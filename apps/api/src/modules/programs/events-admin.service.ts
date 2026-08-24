import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import {
  Activity,
  Announcement,
  EventOccurrence,
  Volunteer,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TemplateService } from '../notifications';
import {
  CancelEventDto,
  CreateEventDto,
  CreateEventSeriesDto,
  UpdateEventDto,
} from './programs.dto';

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

@Injectable()
export class EventsAdminService {
  constructor(
    @InjectRepository(EventOccurrence) private readonly events: Repository<EventOccurrence>,
    @InjectRepository(Activity) private readonly activities: Repository<Activity>,
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly templates: TemplateService,
  ) {}

  // ── Beneficiary communities ────────────────────────────────────────────────

  /**
   * Every published session serves at least one beneficiary community. The
   * rule is enforced here (create-as-upcoming, publish, and edits that would
   * empty the links) because a cross-table CHECK cannot express it.
   */
  private async setCommunities(eventId: string, communityIds: string[]): Promise<void> {
    if (communityIds.length > 0) {
      const found: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM beneficiary_communities WHERE id = ANY($1) AND status = 'active'`,
        [communityIds],
      );
      if (found.length !== communityIds.length) {
        throw new BusinessException(
          'COMMUNITY_INVALID',
          'One or more beneficiary communities are unknown or archived.',
          400,
        );
      }
    }
    await this.dataSource.transaction(async (mgr) => {
      await mgr.query('DELETE FROM event_communities WHERE event_id = $1', [eventId]);
      for (const cid of communityIds) {
        await mgr.query(
          'INSERT INTO event_communities (event_id, community_id) VALUES ($1, $2)',
          [eventId, cid],
        );
      }
    });
  }

  private async assertHasCommunity(eventId: string): Promise<void> {
    const [{ count }] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS count FROM event_communities WHERE event_id = $1',
      [eventId],
    );
    if (Number(count) === 0) {
      throw new BusinessException(
        'COMMUNITY_REQUIRED',
        'Link at least one beneficiary community before this session goes live.',
        400,
      );
    }
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  /** Unspecified fields fall back to the activity's defaults. */
  async create(principal: AuthPrincipal, activityId: string, dto: CreateEventDto) {
    if (dto.status === 'upcoming' && !dto.communityIds?.length) {
      throw new BusinessException(
        'COMMUNITY_REQUIRED',
        'Link at least one beneficiary community before this session goes live.',
        400,
      );
    }
    const activity = await this.activities.findOne({
      where: { id: activityId },
      relations: { program: true },
    });
    if (!activity) throw new NotFoundException('Activity not found');

    const coordinatorId = dto.coordinatorId ?? activity.program?.defaultCoordinatorId;
    if (!coordinatorId) {
      throw new BusinessException(
        'COORDINATOR_REQUIRED',
        'Pick a coordinator — the program has no default.',
        400,
      );
    }

    const durationHours = dto.durationHours ?? Number(activity.defaultDurationHours ?? 2);

    const event = await this.events.save(
      this.events.create({
        code: await this.nextCode(),
        activityId,
        name: dto.name ?? null,
        date: dto.date,
        startTime: dto.startTime,
        durationHours: String(durationHours),
        location: dto.location ?? activity.defaultLocation ?? null,
        city: dto.city ?? null,
        maxSlots: dto.maxSlots ?? activity.defaultMaxSlots ?? 10,
        coordinatorId,
        status: dto.status ?? 'draft',
        createdBy: principal.sub,
      }),
    );
    if (dto.communityIds?.length) await this.setCommunities(event.id, dto.communityIds);
    return this.adminDetail(event.id);
  }

  /** The payoff of the remodel: a recurring activity scheduled in one call. */
  async createSeries(principal: AuthPrincipal, activityId: string, dto: CreateEventSeriesDto) {
    const dates: string[] = [];
    const cursor = new Date(`${dto.startDate}T00:00:00`);
    const end = new Date(`${dto.endDate}T00:00:00`);
    let guard = 0;

    while (cursor <= end && guard < 60) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (dto.pattern === 'weekly') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
      guard++;
    }

    if (dates.length === 0) {
      throw new BusinessException('EMPTY_SERIES', 'The date range produces no occurrences.', 400);
    }

    const created = [];
    for (const date of dates) {
      created.push(
        await this.create(principal, activityId, {
          date,
          startTime: dto.startTime,
          durationHours: dto.durationHours,
          location: dto.location,
          city: dto.city,
          maxSlots: dto.maxSlots,
          coordinatorId: dto.coordinatorId,
          status: 'draft',
          communityIds: dto.communityIds,
        }),
      );
    }
    return { count: created.length, events: created };
  }

  async adminDetail(id: string) {
    const [row] = await this.dataSource.query(
      `SELECT e.*, a.name AS activity_name, a.status AS activity_status,
              a.skill_required, p.id AS program_id, p.name AS program_name,
              p.status AS program_status,
              c.name AS coordinator_name, c.email AS coordinator_email, c.mobile AS coordinator_mobile,
              cap.enrolled_count, cap.waitlist_count, cap.spots_left, cap.is_enrollable
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       WHERE e.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Event not found');
    delete row.time_range;
    row.communities = await this.dataSource.query(
      `SELECT bc.id, bc.name, bc.status
       FROM event_communities ec
       JOIN beneficiary_communities bc ON bc.id = ec.community_id
       WHERE ec.event_id = $1 ORDER BY bc.name`,
      [id],
    );
    row.phases = await this.dataSource.query(
      `SELECT ph.*, v.first_name AS lead_first_name, v.last_name AS lead_last_name
       FROM event_phases ph
       LEFT JOIN volunteers v ON v.id = ph.partner_lead_volunteer_id
       WHERE ph.event_id = $1
       ORDER BY ph.sort_order, ph.start_date, ph.created_at`,
      [id],
    );
    return row;
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.events.findOneBy({ id });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === 'cancelled') {
      throw new BusinessException('EVENT_CANCELLED', 'A cancelled occurrence cannot be edited.');
    }

    const capacityRaised = dto.maxSlots !== undefined && dto.maxSlots > (event.maxSlots ?? 0);

    Object.assign(event, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.date !== undefined && { date: dto.date }),
      ...(dto.startTime !== undefined && { startTime: dto.startTime }),
      ...(dto.durationHours !== undefined && { durationHours: String(dto.durationHours) }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.maxSlots !== undefined && { maxSlots: dto.maxSlots }),
      ...(dto.coordinatorId !== undefined && { coordinatorId: dto.coordinatorId }),
    });
    await this.events.save(event);

    if (dto.communityIds !== undefined) {
      if (event.status === 'upcoming' && dto.communityIds.length === 0) {
        throw new BusinessException(
          'COMMUNITY_REQUIRED',
          'A live session must keep at least one beneficiary community.',
          400,
        );
      }
      await this.setCommunities(id, dto.communityIds);
    }

    /*
     * New seats go to the queue, not to whoever refreshes fastest.
     *
     * The DB's promotion routine only fires on enrollment cancellations, so a
     * capacity increase has to invoke it explicitly — the edit form has
     * promised this behaviour all along. Snapshot the queue around the call so
     * the people who moved up can be congratulated by email, and only email
     * after the transaction is out of the picture (fn_promote_waitlist commits
     * with this statement).
     */
    if (capacityRaised && event.status === 'upcoming') {
      const before: Array<{ volunteer_id: string }> = await this.dataSource.query(
        'SELECT volunteer_id FROM waitlist_entries WHERE event_id = $1 ORDER BY position',
        [id],
      );
      await this.dataSource.query('SELECT fn_promote_waitlist($1)', [id]);
      const after: Array<{ volunteer_id: string }> = await this.dataSource.query(
        'SELECT volunteer_id FROM waitlist_entries WHERE event_id = $1',
        [id],
      );
      const stillWaiting = new Set(after.map((w) => w.volunteer_id));
      const promoted = before.map((w) => w.volunteer_id).filter((v) => !stillWaiting.has(v));
      for (const volunteerId of promoted) {
        await this.queuePromotionEmail(volunteerId, id);
      }
    }

    return this.adminDetail(id);
  }

  /** Same message a withdrawal-driven promotion sends — one seat, one email. */
  private async queuePromotionEmail(volunteerId: string, eventId: string): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT u.email, v.first_name, COALESCE(e.name, a.name) AS display_name,
              e.date, e.start_time, e.location, a.program_id
       FROM volunteers v
       JOIN users u ON u.id = v.user_id
       CROSS JOIN events e
       JOIN activities a ON a.id = e.activity_id
       WHERE v.id = $1 AND e.id = $2`,
      [volunteerId, eventId],
    );
    if (!row) return;

    await this.notifications.queueEmail({
      templateKey: 'waitlist_promoted',
      to: row.email,
      recipientType: 'volunteer',
      volunteerId,
      eventId,
      programId: row.program_id,
      context: {
        firstName: row.first_name,
        eventName: row.display_name,
        eventDate: fmtDate(row.date),
        eventTime: String(row.start_time).slice(0, 5),
        location: row.location ?? 'to be confirmed',
      },
    });
  }

  /**
   * Close the book on a session that has run.
   *
   * Deliberately an admin ACTION rather than a background sweep: "the date
   * passed" and "the session happened" are not the same claim, and completed
   * is what dashboards count as conducted. Only an upcoming session whose
   * date has arrived can be completed — a draft never opened, and the future
   * has not happened yet.
   */
  async complete(id: string) {
    const event = await this.events.findOneBy({ id });
    if (!event) throw new NotFoundException('Event not found');
    const [{ count: phaseCount }] = await this.dataSource.query(
      'SELECT COUNT(*)::int AS count FROM event_phases WHERE event_id = $1',
      [id],
    );
    if (Number(phaseCount) > 0) {
      throw new BusinessException(
        'PHASED_SESSION',
        'This session has phases — it completes automatically when every phase is complete.',
      );
    }
    if (event.status !== 'upcoming') {
      throw new BusinessException(
        'NOT_UPCOMING',
        `Only an upcoming session can be marked completed — this one is ${event.status}.`,
      );
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (String(event.date) > today) {
      throw new BusinessException(
        'NOT_YET_RUN',
        'This session is in the future. Complete it after it has run, or cancel it if it will not.',
      );
    }
    event.status = 'completed';
    await this.events.save(event);
    return this.adminDetail(id);
  }

  async publish(id: string) {
    const event = await this.events.findOneBy({ id });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status !== 'draft') {
      throw new BusinessException('NOT_DRAFT', 'Only a draft occurrence can be published.');
    }
    await this.assertHasCommunity(id);
    event.status = 'upcoming';
    await this.events.save(event);
    return this.adminDetail(id);
  }

  /**
   * BR-07, in one transaction: cancel, then queue a notification to every
   * enrolled AND waitlisted volunteer. The outbox rows commit with the
   * cancellation — if either fails, both roll back.
   */
  async cancel(principal: AuthPrincipal, id: string, dto: CancelEventDto) {
    const detail = await this.adminDetail(id);
    if (detail.status === 'cancelled') {
      throw new BusinessException('EVENT_CANCELLED', 'This occurrence is already cancelled.');
    }

    const displayName = detail.name ?? detail.activity_name;
    let notified = 0;

    await this.dataSource.transaction(async (mgr) => {
      await mgr.update(EventOccurrence, { id }, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: principal.sub,
        cancelReason: dto.reason ?? null,
      });

      const recipients: Array<{ volunteer_id: string; email: string; first_name: string }> =
        await mgr.query(
          `SELECT v.id AS volunteer_id, u.email, v.first_name
           FROM event_enrollments en
           JOIN volunteers v ON v.id = en.volunteer_id
           JOIN users u ON u.id = v.user_id
           WHERE en.event_id = $1 AND en.status = 'enrolled'
           UNION
           SELECT v.id, u.email, v.first_name
           FROM waitlist_entries w
           JOIN volunteers v ON v.id = w.volunteer_id
           JOIN users u ON u.id = v.user_id
           WHERE w.event_id = $1`,
          [id],
        );

      for (const r of recipients) {
        await this.notifications.queueEmail(
          {
            templateKey: 'event_cancelled',
            to: r.email,
            recipientType: 'volunteer',
            volunteerId: r.volunteer_id,
            eventId: id,
            programId: detail.program_id,
            context: {
              firstName: r.first_name,
              eventName: displayName,
              eventDate: fmtDate(detail.date),
              reason: dto.reason,
            },
          },
          mgr,
        );
        notified++;
      }
    });

    await this.audit.record(principal, {
      action: 'event.cancelled',
      entity: 'events',
      entityId: id,
      after: { reason: dto.reason, notified },
    });

    return { ...(await this.adminDetail(id)), notified };
  }

  async enrollmentsOf(id: string) {
    return this.dataSource.query(
      `SELECT en.id, en.status, en.skills, en.enrolled_at, en.promoted_from_waitlist,
              v.id AS volunteer_id, v.first_name, v.last_name, u.email
       FROM event_enrollments en
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE en.event_id = $1
       ORDER BY en.enrolled_at`,
      [id],
    );
  }

  // ── Announcements ──────────────────────────────────────────────────────────

  async announcementPreview(programId: string, eventId?: string) {
    const body = await this.buildAnnouncement(programId, eventId);
    const recipientCount = await this.volunteers.count({ where: { emailOptIn: true } });
    return { subject: body.subject, html: body.html, recipientCount };
  }

  async announce(principal: AuthPrincipal, programId: string, eventId?: string) {
    const body = await this.buildAnnouncement(programId, eventId);
    const recipients = await this.dataSource.query(
      `SELECT v.id, v.first_name, u.email
       FROM volunteers v JOIN users u ON u.id = v.user_id
       WHERE v.email_opt_in = TRUE AND u.is_active = TRUE`,
    );

    const previous = await this.announcements.countBy({ programId });

    for (const r of recipients) {
      await this.notifications.queueEmail({
        templateKey: 'program_announcement',
        to: r.email,
        recipientType: 'bulk',
        volunteerId: r.id,
        programId,
        eventId: eventId ?? null,
        context: { ...body.context, firstName: r.first_name },
      });
    }

    const record = await this.announcements.save(
      this.announcements.create({
        programId,
        eventId: eventId ?? null,
        subject: body.subject,
        bodySnapshot: body.html,
        recipientCount: recipients.length,
        isResend: previous > 0,
        sentBy: principal.sub,
      }),
    );

    return { announcementId: record.id, recipients: recipients.length, isResend: previous > 0 };
  }

  async announcementHistory(programId: string) {
    return this.announcements.find({
      where: { programId },
      order: { sentAt: 'DESC' },
    });
  }

  private async buildAnnouncement(programId: string, eventId?: string) {
    const [program] = await this.dataSource.query(
      'SELECT id, name, description FROM programs WHERE id = $1',
      [programId],
    );
    if (!program) throw new NotFoundException('Program not found');

    const events = await this.dataSource.query(
      `SELECT e.id, COALESCE(e.name, a.name) AS display_name, e.date, e.start_time,
              e.duration_hours, e.location
       FROM events e JOIN activities a ON a.id = e.activity_id
       WHERE a.program_id = $1 AND e.status = 'upcoming' AND e.date >= CURRENT_DATE
         AND ($2::uuid IS NULL OR e.id = $2)
       ORDER BY e.date, e.start_time`,
      [programId, eventId ?? null],
    );

    const context = {
      programName: program.name,
      programDescription: program.description,
      sessions: events.map(
        (e: { display_name: string; date: string; start_time: string; duration_hours: string; location: string }) => ({
          name: e.display_name,
          date: fmtDate(e.date),
          time: e.start_time.slice(0, 5),
          hours: e.duration_hours,
          location: e.location,
        }),
      ),
    };

    const rendered = this.templates.render('program_announcement', context);
    return { subject: rendered.subject, html: rendered.html, context };
  }

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const [{ n }] = await this.dataSource.query('SELECT COUNT(*)::int AS n FROM events');
    return `EVT-${year}-${String(Number(n) + 1).padStart(4, '0')}`;
  }
}
