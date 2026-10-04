import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import {
  Activity,
  Coordinator,
  Program,
  ProgramTraining,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import {
  CreateActivityDto,
  CreateProgramDto,
  DeleteCatalogDto,
  DiscontinueDto,
  UpdateActivityDto,
  UpdateProgramDto,
} from './programs.dto';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectRepository(Program) private readonly programs: Repository<Program>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Coordinator) private readonly coordinators: Repository<Coordinator>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // ── Programs ─────────────────────────────────────────────────────────────

  async list(query: { q?: string; status?: string }) {
    const qb = this.programs
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.defaultCoordinator', 'dc')
      .orderBy('p.createdAt', 'DESC');

    if (query.q) qb.andWhere('p.name ILIKE :q', { q: `%${query.q}%` });
    if (query.status) qb.andWhere('p.status = :status', { status: query.status });

    const rows = await qb.getMany();
    if (rows.length === 0) return { data: [] };

    // One aggregate query for the per-program counts the list cards show.
    const stats = await this.dataSource.query(
      `SELECT a.program_id,
              COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active')::int AS active_activities,
              COUNT(e.id) FILTER (WHERE e.status = 'upcoming')::int       AS upcoming_events,
              COUNT(e.id) FILTER (WHERE e.status = 'inprogress')::int     AS inprogress_events,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int      AS completed_events,
              MIN(e.date) FILTER (WHERE e.status = 'upcoming' AND e.date >= CURRENT_DATE) AS next_event_date
       FROM activities a
       LEFT JOIN events e ON e.activity_id = a.id
       WHERE a.program_id = ANY($1)
       GROUP BY a.program_id`,
      [rows.map((p) => p.id)],
    );
    const byProgram = new Map<string, Record<string, unknown>>(
      stats.map((s: { program_id: string }) => [s.program_id, s]),
    );

    return {
      data: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        status: p.status,
        defaultCoordinator: p.defaultCoordinator
          ? { id: p.defaultCoordinator.id, name: p.defaultCoordinator.name }
          : null,
        activeActivities: Number(byProgram.get(p.id)?.active_activities ?? 0),
        upcomingEvents: Number(byProgram.get(p.id)?.upcoming_events ?? 0),
        inprogressEvents: Number(byProgram.get(p.id)?.inprogress_events ?? 0),
        completedEvents: Number(byProgram.get(p.id)?.completed_events ?? 0),
        nextEventDate: byProgram.get(p.id)?.next_event_date ?? null,
        createdAt: p.createdAt,
      })),
    };
  }

  async detail(id: string) {
    const program = await this.programs.findOne({
      where: { id },
      relations: { defaultCoordinator: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    const activities = await this.dataSource.query(
      `SELECT a.id, a.code, a.name, a.description, a.type, a.skill_required,
              a.default_duration_hours, a.default_max_slots, a.default_location,
              a.status, a.sort_order, a.discontinue_reason, a.delete_reason,
              COUNT(e.id) FILTER (WHERE e.status = 'upcoming')::int   AS upcoming_events,
              COUNT(e.id) FILTER (WHERE e.status = 'inprogress')::int AS inprogress_events,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int  AS completed_events
       FROM activities a
       LEFT JOIN events e ON e.activity_id = a.id
       WHERE a.program_id = $1
       GROUP BY a.id
       ORDER BY a.sort_order, a.created_at`,
      [id],
    );

    const trainings = await this.dataSource.query(
      `SELECT t.id, t.code, t.name, t.duration, t.mode, t.is_mandatory
       FROM program_trainings pt JOIN trainings t ON t.id = pt.training_id
       WHERE pt.program_id = $1 ORDER BY t.name`,
      [id],
    );

    return { ...program, activities, trainings };
  }

  /** Friendly cross-field check — the DB CHECK is the backstop. */
  private assertWindow(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && endDate < startDate) {
      throw new BusinessException('TIMES_REQUIRED', 'The end date is before the start date.', 400);
    }
  }

  async create(principal: AuthPrincipal, dto: CreateProgramDto) {
    this.assertWindow(dto.startDate, dto.endDate);
    const code = await this.nextCode();
    const program = await this.programs.save(
      this.programs.create({
        code,
        name: dto.name,
        description: dto.description,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        defaultCoordinatorId: dto.defaultCoordinatorId ?? null,
        status: 'draft',
        createdBy: principal.sub,
      }),
    );
    if (dto.trainingIds?.length) {
      await this.setTrainings(program.id, dto.trainingIds);
    }
    return this.detail(program.id);
  }

  /** 'deleted' is terminal: nothing about a deleted record may change again. */
  private assertNotDeleted(status: string, what: 'program' | 'activity') {
    if (status === 'deleted') {
      throw new BusinessException(
        'CATALOG_DELETED',
        `This ${what} has been deleted — deletion is permanent and it can no longer be changed.`,
        409,
      );
    }
  }

  async update(id: string, dto: UpdateProgramDto) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    this.assertNotDeleted(program.status, 'program');
    this.assertWindow(dto.startDate ?? program.startDate, dto.endDate ?? program.endDate);
    Object.assign(program, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.startDate !== undefined && { startDate: dto.startDate || null }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate || null }),
      ...(dto.defaultCoordinatorId !== undefined && {
        defaultCoordinatorId: dto.defaultCoordinatorId,
      }),
    });
    await this.programs.save(program);
    return this.detail(id);
  }

  async publish(id: string) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    this.assertNotDeleted(program.status, 'program');
    if (program.status === 'discontinued') {
      throw new BusinessException(
        'PROGRAM_DISCONTINUED',
        'Reactivate the program before publishing.',
      );
    }
    program.status = 'active';
    await this.programs.save(program);
    return this.detail(id);
  }

  /**
   * BR-17: blocks new enrollment on every occurrence beneath the program —
   * via fn_is_event_enrollable — without cancelling anything or deleting
   * history. Cancelling scheduled occurrences stays a separate, explicit act
   * because it emails people (open question O1).
   */
  async discontinue(principal: AuthPrincipal, id: string, dto: DiscontinueDto) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    this.assertNotDeleted(program.status, 'program');

    program.status = 'discontinued';
    program.discontinuedAt = new Date();
    program.discontinuedBy = principal.sub;
    program.discontinueReason = dto.reason ?? null;
    await this.programs.save(program);

    await this.audit.record(principal, {
      action: 'program.discontinued',
      entity: 'programs',
      entityId: id,
      after: { reason: dto.reason },
    });

    // How many upcoming occurrences are now closed to enrollment — surfaced so
    // the admin can decide whether to cancel them explicitly.
    const [{ count }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM events e
       JOIN activities a ON a.id = e.activity_id
       WHERE a.program_id = $1 AND e.status = 'upcoming' AND e.date >= CURRENT_DATE`,
      [id],
    );

    return { ...(await this.detail(id)), upcomingEventsBlocked: Number(count) };
  }

  /**
   * Terminal delete (Round 36). Deliberately a SOFT delete under a hard-delete
   * contract: the row stays (a real row delete would cascade through events
   * and corrupt every report and certificate beneath it), but the status is
   * irreversible — no reactivation path exists, and every mutation refuses.
   * Enrollment under it is blocked by BR-17 with no further change.
   */
  async deleteProgram(principal: AuthPrincipal, id: string, dto: DeleteCatalogDto) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    this.assertNotDeleted(program.status, 'program');

    program.status = 'deleted';
    program.deletedAt = new Date();
    program.deletedBy = principal.sub;
    program.deleteReason = dto.reason;
    await this.programs.save(program);

    // The activities beneath it share the fate: a deleted program's activities
    // are each marked deleted too, carrying the same reason.
    await this.dataSource.query(
      `UPDATE activities
       SET status = 'deleted', deleted_at = now(), deleted_by = $2,
           delete_reason = COALESCE(delete_reason, $3)
       WHERE program_id = $1 AND status <> 'deleted'`,
      [id, principal.sub, `Program deleted: ${dto.reason}`],
    );

    // …and so do the not-yet-completed sessions: cancelled with the reason on
    // record. Deliberately NO emails — the explicit per-session cancel is the
    // flow that notifies people; a catalog delete is bookkeeping.
    // (TypeORM returns [rows, affected] for UPDATE … RETURNING on postgres.)
    const [cancelledRows] = await this.dataSource.query(
      `UPDATE events e SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancel_reason = $3
       FROM activities a
       WHERE a.id = e.activity_id AND a.program_id = $1
         AND e.status IN ('draft', 'upcoming', 'inprogress')
       RETURNING e.id`,
      [id, principal.sub, `Program deleted: ${dto.reason}`],
    );
    const sessionsCancelled = Array.isArray(cancelledRows) ? cancelledRows.length : 0;

    await this.audit.record(principal, {
      action: 'program.deleted',
      entity: 'programs',
      entityId: id,
      after: { reason: dto.reason, sessionsCancelled },
    });

    return { deleted: true, sessionsCancelled };
  }

  async reactivate(principal: AuthPrincipal, id: string) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    this.assertNotDeleted(program.status, 'program');
    program.status = 'active';
    program.discontinuedAt = null;
    program.discontinuedBy = null;
    program.discontinueReason = null;
    await this.programs.save(program);
    await this.audit.record(principal, {
      action: 'program.reactivated',
      entity: 'programs',
      entityId: id,
    });
    return this.detail(id);
  }

  async setTrainings(programId: string, trainingIds: string[]) {
    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(ProgramTraining, { programId });
      if (trainingIds.length) {
        await mgr.insert(
          ProgramTraining,
          trainingIds.map((trainingId) => ({ programId, trainingId })),
        );
      }
    });
    return { trainingIds };
  }

  async participation(programId: string) {
    return this.dataSource.query(
      `SELECT pp.volunteer_id, v.first_name, v.last_name, u.email,
              pp.events_attended, pp.total_hours, pp.first_attended_on, pp.last_attended_on
       FROM v_program_participation pp
       JOIN volunteers v ON v.id = pp.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE pp.program_id = $1
       ORDER BY pp.total_hours DESC`,
      [programId],
    );
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async createActivity(principal: AuthPrincipal, programId: string, dto: CreateActivityDto) {
    const program = await this.programs.findOneBy({ id: programId });
    if (!program) throw new NotFoundException('Program not found');
    this.assertWindow(dto.startDate, dto.endDate);

    // Max existing suffix + 1 (a row count collides after any deletion).
    const [{ n }] = await this.dataSource.query(
      `SELECT COALESCE(MAX((regexp_match(code, '(\\d+)$'))[1]::int), 0) AS n
       FROM activities WHERE code ~ '\\d+$'`,
    );
    const activity = await this.activities.save(
      this.activities.create({
        code: `ACT-${String(Number(n) + 1).padStart(3, '0')}`,
        programId,
        name: dto.name,
        description: dto.description ?? null,
        type: dto.type ?? 'In person',
        outcome: dto.outcome ?? null,
        skillRequired: dto.skillRequired ?? null,
        defaultDurationHours:
          dto.defaultDurationHours !== undefined ? String(dto.defaultDurationHours) : null,
        defaultMaxSlots: dto.defaultMaxSlots ?? null,
        defaultLocation: dto.defaultLocation,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        createdBy: principal.sub,
      }),
    );
    if (dto.trainingIds?.length) {
      await this.setActivityTrainings(activity.id, dto.trainingIds);
    }
    return this.activityDetail(activity.id);
  }

  async activityDetail(id: string) {
    const activity = await this.activities.findOne({
      where: { id },
      relations: { program: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    const events = await this.dataSource.query(
      `SELECT e.id, e.code, e.name, e.date, e.start_time, e.duration_hours, e.location,
              e.city, e.max_slots, e.status, c.name AS coordinator_name,
              cap.enrolled_count, cap.waitlist_count, cap.spots_left, cap.is_enrollable,
              (SELECT COUNT(*)::int FROM event_phases ph WHERE ph.event_id = e.id) AS phase_total,
              (SELECT COUNT(*)::int FROM event_phases ph
               WHERE ph.event_id = e.id AND ph.status = 'completed') AS phases_completed
       FROM events e
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       WHERE e.activity_id = $1
       ORDER BY e.date DESC, e.start_time DESC`,
      [id],
    );

    const trainings = await this.dataSource.query(
      `SELECT t.id, t.code, t.name, t.duration, t.mode, t.is_mandatory
       FROM activity_trainings at JOIN trainings t ON t.id = at.training_id
       WHERE at.activity_id = $1 ORDER BY t.name`,
      [id],
    );

    return {
      ...activity,
      programName: activity.program?.name,
      programStatus: activity.program?.status,
      events,
      trainings,
    };
  }

  async updateActivity(id: string, dto: UpdateActivityDto) {
    const activity = await this.activities.findOneBy({ id });
    if (!activity) throw new NotFoundException('Activity not found');
    this.assertNotDeleted(activity.status, 'activity');
    this.assertWindow(dto.startDate ?? activity.startDate, dto.endDate ?? activity.endDate);
    Object.assign(activity, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.startDate !== undefined && { startDate: dto.startDate || null }),
      ...(dto.endDate !== undefined && { endDate: dto.endDate || null }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.outcome !== undefined && { outcome: dto.outcome }),
      ...(dto.skillRequired !== undefined && { skillRequired: dto.skillRequired }),
      ...(dto.defaultDurationHours !== undefined && {
        defaultDurationHours: String(dto.defaultDurationHours),
      }),
      ...(dto.defaultMaxSlots !== undefined && { defaultMaxSlots: dto.defaultMaxSlots }),
      ...(dto.defaultLocation !== undefined && { defaultLocation: dto.defaultLocation }),
    });
    await this.activities.save(activity);
    if (dto.trainingIds) await this.setActivityTrainings(id, dto.trainingIds);
    return this.activityDetail(id);
  }

  /** BR-17 at activity level — its occurrences stop accepting enrollment. */
  async discontinueActivity(principal: AuthPrincipal, id: string, dto: DiscontinueDto) {
    const activity = await this.activities.findOneBy({ id });
    if (!activity) throw new NotFoundException('Activity not found');
    this.assertNotDeleted(activity.status, 'activity');
    activity.status = 'discontinued';
    activity.discontinuedAt = new Date();
    activity.discontinuedBy = principal.sub;
    activity.discontinueReason = dto.reason ?? null;
    await this.activities.save(activity);
    await this.audit.record(principal, {
      action: 'activity.discontinued',
      entity: 'activities',
      entityId: id,
      after: { reason: dto.reason },
    });
    return this.activityDetail(id);
  }

  /** Same terminal delete as deleteProgram, scoped to one activity. */
  async deleteActivity(principal: AuthPrincipal, id: string, dto: DeleteCatalogDto) {
    const activity = await this.activities.findOneBy({ id });
    if (!activity) throw new NotFoundException('Activity not found');
    this.assertNotDeleted(activity.status, 'activity');

    activity.status = 'deleted';
    activity.deletedAt = new Date();
    activity.deletedBy = principal.sub;
    activity.deleteReason = dto.reason;
    await this.activities.save(activity);

    // Its not-yet-completed sessions are cancelled with the reason on record
    // (no emails — the explicit per-session cancel is the flow that notifies).
    const [cancelledRows] = await this.dataSource.query(
      `UPDATE events SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              cancel_reason = $3
       WHERE activity_id = $1 AND status IN ('draft', 'upcoming', 'inprogress')
       RETURNING id`,
      [id, principal.sub, `Activity deleted: ${dto.reason}`],
    );
    const sessionsCancelled = Array.isArray(cancelledRows) ? cancelledRows.length : 0;

    await this.audit.record(principal, {
      action: 'activity.deleted',
      entity: 'activities',
      entityId: id,
      after: { reason: dto.reason, sessionsCancelled },
    });

    return { deleted: true, sessionsCancelled };
  }

  async reactivateActivity(principal: AuthPrincipal, id: string) {
    const activity = await this.activities.findOneBy({ id });
    if (!activity) throw new NotFoundException('Activity not found');
    this.assertNotDeleted(activity.status, 'activity');
    activity.status = 'active';
    activity.discontinuedAt = null;
    activity.discontinuedBy = null;
    activity.discontinueReason = null;
    await this.activities.save(activity);
    await this.audit.record(principal, {
      action: 'activity.reactivated',
      entity: 'activities',
      entityId: id,
    });
    return this.activityDetail(id);
  }

  async setActivityTrainings(activityId: string, trainingIds: string[]) {
    await this.dataSource.transaction(async (mgr) => {
      await mgr.query('DELETE FROM activity_trainings WHERE activity_id = $1', [activityId]);
      for (const trainingId of trainingIds) {
        await mgr.query(
          'INSERT INTO activity_trainings (activity_id, training_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [activityId, trainingId],
        );
      }
    });
    return { trainingIds };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Next code = highest existing numeric suffix + 1 — NOT a row count. A count
   * collides with a surviving code the moment any row is ever deleted.
   */
  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const [{ n }] = await this.dataSource.query(
      `SELECT COALESCE(MAX((regexp_match(code, '(\\d+)$'))[1]::int), 0) AS n
       FROM programs WHERE code ~ '\\d+$'`,
    );
    return `PRG-${year}-${String(Number(n) + 1).padStart(3, '0')}`;
  }
}
