import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';
import { EventOccurrence, EventPhase } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import type { CreatePhaseDto, OverridePhaseDto, UpdatePhaseDto } from './programs.dto';

/**
 * Session phases. A session with zero phases keeps the classic manual
 * lifecycle; with phases, fn_recompute_event_phase_status derives the
 * session's status after every phase change — all complete -> completed,
 * any started -> inprogress. An admin override is authoritative over the
 * completion marks and always audited; if it knocks a completed session
 * back, that reversion is audited too (client decision, 2026-08-24).
 */
@Injectable()
export class PhasesService {
  constructor(
    @InjectRepository(EventPhase) private readonly phases: Repository<EventPhase>,
    @InjectRepository(EventOccurrence) private readonly events: Repository<EventOccurrence>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async listByEvent(eventId: string) {
    const rows = await this.dataSource.query(
      `SELECT ph.*, v.first_name AS lead_first_name, v.last_name AS lead_last_name
       FROM event_phases ph
       LEFT JOIN volunteers v ON v.id = ph.partner_lead_volunteer_id
       WHERE ph.event_id = $1
       ORDER BY ph.sort_order, ph.start_date, ph.created_at`,
      [eventId],
    );
    return { data: rows };
  }

  private async phaseOf(id: string): Promise<EventPhase> {
    const phase = await this.phases.findOneBy({ id });
    if (!phase) throw new NotFoundException('Phase not found');
    return phase;
  }

  /** Re-derive the session status; returns [before, after]. */
  private async recompute(eventId: string): Promise<[string, string]> {
    const [{ status: before }] = await this.dataSource.query(
      'SELECT status FROM events WHERE id = $1',
      [eventId],
    );
    const [{ fn_recompute_event_phase_status: after }] = await this.dataSource.query(
      'SELECT fn_recompute_event_phase_status($1)',
      [eventId],
    );
    return [before, after];
  }

  /** Audit a session that auto-reverted out of completed. */
  private async auditReversion(
    principal: AuthPrincipal,
    eventId: string,
    before: string,
    after: string,
    cause: string,
  ): Promise<void> {
    if (before === 'completed' && after !== 'completed') {
      await this.audit.record(principal, {
        action: 'session.reverted',
        entity: 'event',
        entityId: eventId,
        before: { status: before },
        after: { status: after, cause },
      });
    }
  }

  private async assertLeadIsUsable(volunteerId: string): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT v.id FROM volunteers v
       JOIN users u ON u.id = v.user_id
       WHERE v.id = $1 AND u.is_active AND v.registration_status = 'approved'`,
      [volunteerId],
    );
    if (!row) {
      throw new BusinessException(
        'NOT_ELIGIBLE',
        'The partner lead must be an active, approved volunteer.',
        400,
      );
    }
  }

  async create(principal: AuthPrincipal, eventId: string, dto: CreatePhaseDto) {
    const event = await this.events.findOneBy({ id: eventId });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === 'cancelled' || event.status === 'completed') {
      throw new BusinessException(
        'PHASE_LOCKED',
        `Phases cannot be added to a ${event.status} session — reopen it first with a phase override.`,
      );
    }
    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new BusinessException('TIMES_REQUIRED', 'The end date is before the start date.', 400);
    }
    if (dto.partnerLeadVolunteerId) await this.assertLeadIsUsable(dto.partnerLeadVolunteerId);

    const phase = await this.phases.save(
      this.phases.create({
        eventId,
        name: dto.name,
        description: dto.description ?? null,
        responsibility: dto.responsibility ?? 'parinaam',
        startDate: dto.startDate,
        endDate: dto.endDate ?? dto.startDate,
        partnerLeadVolunteerId: dto.partnerLeadVolunteerId ?? null,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    await this.recompute(eventId);
    return this.detail(phase.id);
  }

  async detail(id: string) {
    const [row] = await this.dataSource.query(
      `SELECT ph.*, v.first_name AS lead_first_name, v.last_name AS lead_last_name
       FROM event_phases ph
       LEFT JOIN volunteers v ON v.id = ph.partner_lead_volunteer_id
       WHERE ph.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Phase not found');
    return row;
  }

  async update(id: string, dto: UpdatePhaseDto) {
    const phase = await this.phaseOf(id);
    if (phase.status === 'completed') {
      throw new BusinessException(
        'PHASE_LOCKED',
        'A completed phase cannot be edited — override its status first.',
      );
    }
    const startDate = dto.startDate ?? phase.startDate;
    const endDate = dto.endDate ?? phase.endDate;
    if (endDate < startDate) {
      throw new BusinessException('TIMES_REQUIRED', 'The end date is before the start date.', 400);
    }
    if (dto.partnerLeadVolunteerId) {
      if (!UUID_PATTERN.test(dto.partnerLeadVolunteerId)) {
        throw new BusinessException('NOT_ELIGIBLE', 'partnerLeadVolunteerId must be a UUID.', 400);
      }
      await this.assertLeadIsUsable(dto.partnerLeadVolunteerId);
    }

    Object.assign(phase, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.responsibility !== undefined && { responsibility: dto.responsibility }),
      ...(dto.startDate !== undefined && { startDate: dto.startDate }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate }),
      ...(dto.partnerLeadVolunteerId !== undefined && {
        partnerLeadVolunteerId: dto.partnerLeadVolunteerId || null,
      }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
    });
    await this.phases.save(phase);
    return this.detail(id);
  }

  async remove(principal: AuthPrincipal, id: string) {
    const phase = await this.phaseOf(id);
    if (phase.status !== 'upcoming' || phase.parinaamMarkedAt || phase.partnerMarkedAt) {
      throw new BusinessException(
        'PHASE_LOCKED',
        'Only an untouched upcoming phase can be removed. Override it back to upcoming first.',
      );
    }
    await this.phases.delete(id);
    const [before, after] = await this.recompute(phase.eventId);
    await this.auditReversion(principal, phase.eventId, before, after, 'phase removed');
    return { ok: true };
  }

  /** Explicit "work has started" — mirrors the deliberate session lifecycle. */
  async start(principal: AuthPrincipal, id: string) {
    const phase = await this.phaseOf(id);
    if (phase.status !== 'upcoming') {
      throw new BusinessException('PHASE_ALREADY_MARKED', `This phase is already ${phase.status}.`);
    }
    phase.status = 'inprogress';
    await this.phases.save(phase);
    await this.recompute(phase.eventId);
    await this.audit.record(principal, {
      action: 'phase.started',
      entity: 'event_phase',
      entityId: id,
      after: { status: 'inprogress' },
    });
    return this.detail(id);
  }

  /**
   * The Parinaam-side completion mark. Partner-owned phases are not the
   * admin's to mark — that is what the override (with its audit trail) is for.
   */
  async completeParinaamSide(principal: AuthPrincipal, id: string) {
    const phase = await this.phaseOf(id);
    if (phase.responsibility === 'partner') {
      throw new BusinessException(
        'PHASE_NOT_YOURS',
        'This phase is partner-owned. The partner lead marks it — or use an override with a reason.',
      );
    }
    if (phase.parinaamMarkedAt) {
      throw new BusinessException('PHASE_ALREADY_MARKED', 'The Parinaam side is already marked complete.');
    }
    phase.parinaamMarkedAt = new Date();
    phase.parinaamMarkedBy = principal.sub;
    const bothSides = phase.responsibility === 'collab';
    phase.status = bothSides && !phase.partnerMarkedAt ? 'inprogress' : 'completed';
    await this.phases.save(phase);
    const [before, after] = await this.recompute(phase.eventId);
    await this.audit.record(principal, {
      action: 'phase.parinaam_marked',
      entity: 'event_phase',
      entityId: id,
      after: { phaseStatus: phase.status, sessionStatus: after, sessionWas: before },
    });
    return this.detail(id);
  }

  /**
   * Admin override — authoritative over the marks. Overriding back to
   * upcoming clears both completion marks so the phase restarts clean.
   */
  async override(principal: AuthPrincipal, id: string, dto: OverridePhaseDto) {
    const phase = await this.phaseOf(id);
    const beforeData = {
      status: phase.status,
      parinaamMarkedAt: phase.parinaamMarkedAt,
      partnerMarkedAt: phase.partnerMarkedAt,
    };

    phase.status = dto.status;
    phase.overriddenAt = new Date();
    phase.overriddenBy = principal.sub;
    phase.overrideReason = dto.reason;
    if (dto.status === 'upcoming') {
      phase.parinaamMarkedAt = null;
      phase.parinaamMarkedBy = null;
      phase.partnerMarkedAt = null;
      phase.partnerMarkedBy = null;
    }
    await this.phases.save(phase);

    const [before, after] = await this.recompute(phase.eventId);
    await this.audit.record(principal, {
      action: 'phase.overridden',
      entity: 'event_phase',
      entityId: id,
      before: beforeData,
      after: { status: dto.status, reason: dto.reason, sessionStatus: after, sessionWas: before },
    });
    await this.auditReversion(principal, phase.eventId, before, after, 'phase overridden');
    return this.detail(id);
  }
}
