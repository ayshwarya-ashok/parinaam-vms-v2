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

    // One aggregate query for the per-programme counts the list cards show.
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
              a.status, a.sort_order, a.discontinue_reason,
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

  async create(principal: AuthPrincipal, dto: CreateProgramDto) {
    const code = await this.nextCode();
    const program = await this.programs.save(
      this.programs.create({
        code,
        name: dto.name,
        description: dto.description ?? null,
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

  async update(id: string, dto: UpdateProgramDto) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
    Object.assign(program, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
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
   * BR-17: blocks new enrollment on every occurrence beneath the programme —
   * via fn_is_event_enrollable — without cancelling anything or deleting
   * history. Cancelling scheduled occurrences stays a separate, explicit act
   * because it emails people (open question O1).
   */
  async discontinue(principal: AuthPrincipal, id: string, dto: DiscontinueDto) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');

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

  async reactivate(principal: AuthPrincipal, id: string) {
    const program = await this.programs.findOneBy({ id });
    if (!program) throw new NotFoundException('Program not found');
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

    const [{ n }] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS n FROM activities',
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
        defaultLocation: dto.defaultLocation ?? null,
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
    Object.assign(activity, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
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

  async reactivateActivity(principal: AuthPrincipal, id: string) {
    const activity = await this.activities.findOneBy({ id });
    if (!activity) throw new NotFoundException('Activity not found');
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

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const [{ n }] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS n FROM programs',
    );
    return `PRG-${year}-${String(Number(n) + 1).padStart(3, '0')}`;
  }
}
