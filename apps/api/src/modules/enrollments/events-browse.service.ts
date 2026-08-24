import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { Volunteer } from '../../database/entities';

export interface BrowseQuery {
  q?: string;
  programId?: string;
  type?: string;
  city?: string;
  from?: string;
  to?: string;
  enrollState?: 'all' | 'open' | 'waitlist' | 'enrolled';
  sort?: 'date' | 'time' | 'venue' | 'slots';
  scope?: 'open' | 'all' | 'completed';
}

/**
 * The volunteer's read model. One query returns everything a session card
 * needs: capacity, the caller's own state, whether prerequisites are met, and
 * any scheduling conflict — so the grid never fans out into N+1 calls.
 */
@Injectable()
export class EventsBrowseService {
  constructor(
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    private readonly dataSource: DataSource,
  ) {}

  private async volunteerIdOf(principal: AuthPrincipal): Promise<string | null> {
    if (principal.role !== 'volunteer') return null;
    const v = await this.volunteers.findOne({ where: { userId: principal.sub } });
    return v?.id ?? null;
  }

  async browse(principal: AuthPrincipal, query: BrowseQuery) {
    const volunteerId = await this.volunteerIdOf(principal);

    const rows = await this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS name, e.date, e.start_time,
              e.duration_hours, e.location, e.city, e.max_slots, e.status,
              a.id AS activity_id, a.name AS activity_name, a.type, a.skill_required,
              a.status AS activity_status,
              p.id AS program_id, p.name AS program_name, p.status AS program_status,
              c.name AS coordinator_name,
              cap.enrolled_count, cap.waitlist_count, cap.spots_left, cap.is_enrollable,
              CASE WHEN $1::uuid IS NULL THEN NULL
                   ELSE fn_event_prereqs_met($1, e.id) END AS prereqs_met,
              en.id IS NOT NULL AS is_enrolled,
              w.position AS waitlist_position,
              ar.my_attended, ar.my_hours,
              conf.conflicting_name, conf.conflicting_start
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       LEFT JOIN event_enrollments en
         ON en.event_id = e.id AND en.volunteer_id = $1 AND en.status = 'enrolled'
       LEFT JOIN waitlist_entries w
         ON w.event_id = e.id AND w.volunteer_id = $1
       LEFT JOIN LATERAL (
         -- Aggregated: phased sessions hold one row PER VISIT, so a bare join
         -- would fan the session out. Hours sum across every attended row.
         SELECT bool_or(a.attended) AS my_attended,
                SUM(a.hours_contributed) FILTER (WHERE a.attended) AS my_hours
         FROM attendance_records a
         WHERE a.event_id = e.id AND a.volunteer_id = $1
       ) ar ON $1::uuid IS NOT NULL
       LEFT JOIN LATERAL (
         SELECT conflicting_name, conflicting_start
         FROM fn_volunteer_conflicts($1, e.id) LIMIT 1
       ) conf ON $1::uuid IS NOT NULL AND en.id IS NULL
       WHERE ($2::text IS NULL OR COALESCE(e.name, a.name) ILIKE $2
              OR a.name ILIKE $2 OR p.name ILIKE $2 OR e.location ILIKE $2)
         AND ($3::uuid IS NULL OR p.id = $3)
         AND ($4::text IS NULL OR a.type::text = $4)
         AND ($5::text IS NULL OR e.city ILIKE $5)
         AND ($6::date IS NULL OR e.date >= $6)
         AND ($7::date IS NULL OR e.date <= $7)
         AND (CASE WHEN $8 = 'open' THEN e.status = 'upcoming' AND e.date >= CURRENT_DATE
                   WHEN $8 = 'completed' THEN e.status = 'completed'
                   ELSE e.status <> 'cancelled' END)
       ORDER BY CASE WHEN $8 = 'completed' THEN e.date END DESC,
                e.date, e.start_time
       LIMIT 200`,
      [
        volunteerId,
        query.q ? `%${query.q}%` : null,
        query.programId ?? null,
        query.type && query.type !== 'all' ? query.type : null,
        query.city ? `%${query.city}%` : null,
        query.from ?? null,
        query.to ?? null,
        query.scope ?? 'open',
      ],
    );

    let mapped = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      date: r.date,
      startTime: String(r.start_time).slice(0, 5),
      durationHours: r.duration_hours,
      location: r.location,
      city: r.city,
      type: r.type,
      skillRequired: r.skill_required,
      status: r.status,
      program: { id: r.program_id, name: r.program_name },
      activity: { id: r.activity_id, name: r.activity_name },
      coordinatorName: r.coordinator_name,
      capacity: {
        enrolled: Number(r.enrolled_count),
        maxSlots: Number(r.max_slots),
        spotsLeft: Number(r.spots_left),
        waitlisted: Number(r.waitlist_count),
      },
      isEnrollable: r.is_enrollable,
      prereqsMet: r.prereqs_met,
      myState: r.is_enrolled
        ? ('enrolled' as const)
        : r.waitlist_position
          ? ('waitlisted' as const)
          : ('none' as const),
      waitlistPosition: r.waitlist_position ? Number(r.waitlist_position) : null,
      myAttendance:
        r.my_attended === null || r.my_attended === undefined
          ? null
          : r.my_attended
            ? ('present' as const)
            : ('absent' as const),
      myHours: r.my_hours === null || r.my_hours === undefined ? null : Number(r.my_hours),
      conflict: r.conflicting_name
        ? { name: r.conflicting_name, startTime: String(r.conflicting_start).slice(0, 5) }
        : null,
    }));

    if (query.enrollState === 'enrolled') {
      mapped = mapped.filter((m: { myState: string }) => m.myState !== 'none');
    } else if (query.enrollState === 'open') {
      mapped = mapped.filter(
        (m: { myState: string; capacity: { spotsLeft: number }; isEnrollable: boolean }) =>
          m.myState === 'none' && m.capacity.spotsLeft > 0 && m.isEnrollable,
      );
    } else if (query.enrollState === 'waitlist') {
      mapped = mapped.filter(
        (m: { myState: string; capacity: { spotsLeft: number } }) =>
          m.myState === 'waitlisted' || (m.myState === 'none' && m.capacity.spotsLeft === 0),
      );
    }

    const sort = query.sort ?? 'date';
    if (sort === 'time') mapped.sort((a: { startTime: string }, b: { startTime: string }) => a.startTime.localeCompare(b.startTime));
    if (sort === 'venue') mapped.sort((a: { location: string | null }, b: { location: string | null }) => String(a.location).localeCompare(String(b.location)));
    if (sort === 'slots') mapped.sort((a: { capacity: { spotsLeft: number } }, b: { capacity: { spotsLeft: number } }) => a.capacity.spotsLeft - b.capacity.spotsLeft);

    return { data: mapped };
  }

  async detail(principal: AuthPrincipal, eventId: string) {
    const { data } = await this.browse(principal, { scope: 'all' });
    const event = data.find((e: { id: string }) => e.id === eventId);
    if (!event) throw new NotFoundException('Session not found');

    const trainings = await this.dataSource.query(
      `SELECT DISTINCT t.id, t.code, t.name, t.duration, t.mode, t.is_mandatory, req.source
       FROM v_event_required_trainings req
       JOIN trainings t ON t.id = req.training_id
       WHERE req.event_id = $1
       ORDER BY t.is_mandatory DESC, t.name`,
      [eventId],
    );

    const volunteerId = await this.volunteerIdOf(principal);
    const missing = volunteerId
      ? await this.dataSource.query('SELECT code FROM fn_volunteer_missing_trainings($1, $2)', [
          volunteerId,
          eventId,
        ])
      : [];
    const missingCodes = new Set(missing.map((m: { code: string }) => m.code));

    const [coordinator] = await this.dataSource.query(
      `SELECT c.name, c.email, c.mobile FROM events e
       JOIN coordinators c ON c.id = e.coordinator_id WHERE e.id = $1`,
      [eventId],
    );

    const roster = await this.dataSource.query(
      `SELECT v.first_name, en.skills FROM event_enrollments en
       JOIN volunteers v ON v.id = en.volunteer_id
       WHERE en.event_id = $1 AND en.status = 'enrolled'
       ORDER BY en.enrolled_at`,
      [eventId],
    );

    // The session's phases, with what the CALLER may do about each: only the
    // named partner lead can mark the partner side (client decision Q1).
    const phases = await this.dataSource.query(
      `SELECT ph.id, ph.name, ph.description, ph.responsibility, ph.status,
              ph.start_date, ph.end_date,
              ph.parinaam_marked_at IS NOT NULL AS parinaam_marked,
              ph.partner_marked_at IS NOT NULL AS partner_marked,
              lv.first_name AS lead_first_name, lv.last_name AS lead_last_name,
              ph.partner_lead_volunteer_id = $2 AS i_am_lead
       FROM event_phases ph
       LEFT JOIN volunteers lv ON lv.id = ph.partner_lead_volunteer_id
       WHERE ph.event_id = $1
       ORDER BY ph.sort_order, ph.start_date`,
      [eventId, volunteerId],
    );

    return {
      ...event,
      phases,
      trainings: trainings.map((t: { code: string; [k: string]: unknown }) => ({
        ...t,
        held: !missingCodes.has(t.code),
      })),
      coordinator,
      roster: roster.map((r: { first_name: string; skills: string | null }) => ({
        firstName: r.first_name,
        skills: r.skills,
      })),
    };
  }

  /** Month grid: sessions grouped by date, plus the caller's conflict days. */
  async calendar(principal: AuthPrincipal, month: string) {
    const [year, mm] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = new Date(year, mm, 0).toISOString().slice(0, 10);

    const { data } = await this.browse(principal, { from, to, scope: 'all' });

    const byDate: Record<string, typeof data> = {};
    for (const event of data) {
      const key = String(event.date).slice(0, 10);
      (byDate[key] ??= []).push(event);
    }

    // A day conflicts when the caller holds two overlapping seats on it.
    const volunteerId = await this.volunteerIdOf(principal);
    const conflictDays: string[] = volunteerId
      ? (
          await this.dataSource.query(
            `SELECT DISTINCT e1.date::text AS day
             FROM event_enrollments en1
             JOIN events e1 ON e1.id = en1.event_id
             JOIN event_enrollments en2
               ON en2.volunteer_id = en1.volunteer_id AND en2.status = 'enrolled'
             JOIN events e2 ON e2.id = en2.event_id AND e2.id <> e1.id
             WHERE en1.volunteer_id = $1 AND en1.status = 'enrolled'
               AND e1.time_range && e2.time_range
               AND e1.date >= $2 AND e1.date <= $3`,
            [volunteerId, from, to],
          )
        ).map((r: { day: string }) => r.day)
      : [];

    return { month, byDate, conflictDays };
  }
}
