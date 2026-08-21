import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BusinessErrors, BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { EventEnrollment, Volunteer, WaitlistEntry } from '../../database/entities';
import { NotificationsService } from '../notifications';

interface EnrollOptions {
  acknowledgeConflict?: boolean;
  acceptWaitlist?: boolean;
  skills?: string;
}

function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The most rule-dense service in the system. Every step delegates its truth to
 * the database objects that own it: fn_is_event_enrollable (BR-17 cascade),
 * fn_event_prereqs_met (BR-05 union gate), fn_volunteer_conflicts (BR-11),
 * v_event_capacity (BR-06), and the promotion trigger (BR-10).
 */
@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Enrolling is the review gate's teeth. A pending volunteer can explore,
   * sign consent and complete trainings — all of that is preparation — but a
   * seat on a roster is a commitment the foundation makes back, and that
   * waits for an administrator's approval.
   */
  private assertApproved(volunteer: Volunteer): void {
    if (volunteer.registrationStatus !== 'approved') {
      throw new BusinessException(
        'REGISTRATION_PENDING',
        'Your registration is still being reviewed. Enrolling opens up once an administrator approves it — we will email you.',
        403,
      );
    }
  }

  private async volunteerOf(principal: AuthPrincipal): Promise<Volunteer> {
    const volunteer = await this.volunteers.findOne({ where: { userId: principal.sub } });
    if (!volunteer) {
      throw new BusinessException(
        'PROFILE_INCOMPLETE',
        'Complete your volunteer registration first.',
        404,
      );
    }
    return volunteer;
  }

  // ── Enroll ─────────────────────────────────────────────────────────────────

  async enroll(principal: AuthPrincipal, eventId: string, opts: EnrollOptions) {
    const volunteer = await this.volunteerOf(principal);
    this.assertApproved(volunteer);

    return this.dataSource.transaction(async (mgr) => {
      // Lock the occurrence row: two concurrent enrollments must serialise on
      // the capacity check, or the last seat gets sold twice.
      const [event] = await mgr.query(
        `SELECT e.*, COALESCE(e.name, a.name) AS display_name, a.program_id, p.name AS program_name
         FROM events e
         JOIN activities a ON a.id = e.activity_id
         JOIN programs p ON p.id = a.program_id
         WHERE e.id = $1
         FOR UPDATE OF e`,
        [eventId],
      );
      if (!event) throw new NotFoundException('Session not found');

      // 1 — BR-17 cascade in one call: event status, activity status,
      //     programme status, past date.
      const [{ fn_is_event_enrollable: enrollable }] = await mgr.query(
        'SELECT fn_is_event_enrollable($1)',
        [eventId],
      );
      if (!enrollable) throw BusinessErrors.eventNotEnrollable();

      // 2 — no double state
      const existing = await mgr.findOne(EventEnrollment, {
        where: { volunteerId: volunteer.id, eventId, status: 'enrolled' },
      });
      if (existing) throw BusinessErrors.alreadyEnrolled();
      const waiting = await mgr.findOne(WaitlistEntry, {
        where: { volunteerId: volunteer.id, eventId },
      });
      if (waiting) {
        throw new BusinessException(
          'ALREADY_WAITLISTED',
          `You are already on the waitlist at position #${waiting.position}.`,
        );
      }

      // 3 — BR-05: the union of programme-level and activity-level trainings,
      //     gated behind the feature flag Phase 4 flips on.
      const [{ value: enforce }] = await mgr.query(
        `SELECT value FROM app_settings WHERE key = 'features.enforceTrainingPrerequisites'`,
      );
      if (enforce === true || enforce === 'true') {
        const [{ fn_event_prereqs_met: met }] = await mgr.query(
          'SELECT fn_event_prereqs_met($1, $2)',
          [volunteer.id, eventId],
        );
        if (!met) {
          const missing = await mgr.query(
            'SELECT * FROM fn_volunteer_missing_trainings($1, $2)',
            [volunteer.id, eventId],
          );
          throw BusinessErrors.prerequisitesNotMet(
            missing.map((t: { code: string; name: string; is_mandatory: boolean }) => ({
              code: t.code,
              name: t.name,
              isMandatory: t.is_mandatory,
            })),
          );
        }
      }

      // 4 — BR-06 capacity, BR-10 waitlist
      const [cap] = await mgr.query(
        'SELECT enrolled_count, waitlist_count, spots_left FROM v_event_capacity WHERE event_id = $1',
        [eventId],
      );
      if (Number(cap.spots_left) <= 0) {
        const position = Number(cap.waitlist_count) + 1;
        if (!opts.acceptWaitlist) {
          throw BusinessErrors.eventFull(event.max_slots, position);
        }
        const entry = await mgr.save(
          mgr.create(WaitlistEntry, { volunteerId: volunteer.id, eventId, position }),
        );
        return {
          state: 'waitlisted' as const,
          waitlistPosition: entry.position,
          event: this.eventContext(event),
        };
      }

      // 5 — BR-11 scheduling conflict, override recorded
      const conflicts = await mgr.query(
        'SELECT * FROM fn_volunteer_conflicts($1, $2)',
        [volunteer.id, eventId],
      );
      if (conflicts.length > 0 && !opts.acknowledgeConflict) {
        const c = conflicts[0];
        throw BusinessErrors.schedulingConflict({
          id: c.conflicting_event_id,
          name: c.conflicting_name,
          date: c.conflicting_date,
          startTime: String(c.conflicting_start).slice(0, 5),
        });
      }

      // 6 — the seat
      const enrollment = await mgr.save(
        mgr.create(EventEnrollment, {
          volunteerId: volunteer.id,
          eventId,
          status: 'enrolled',
          skills: opts.skills ?? volunteer.skills ?? null,
          conflictAcknowledged: conflicts.length > 0,
        }),
      );

      // 7 — confirmation, written to the outbox in this same transaction
      await this.queueConfirmation(mgr, volunteer, event, principal.email);

      return {
        state: 'enrolled' as const,
        enrollmentId: enrollment.id,
        conflictAcknowledged: enrollment.conflictAcknowledged,
        event: this.eventContext(event),
      };
    });
  }

  private async queueConfirmation(
    mgr: EntityManager,
    volunteer: Volunteer,
    event: Record<string, string>,
    email: string,
  ): Promise<void> {
    // Outstanding trainings still get named in the confirmation even while the
    // hard gate is off — the volunteer should know what to finish.
    const missing = await mgr.query(
      'SELECT name FROM fn_volunteer_missing_trainings($1, $2)',
      [volunteer.id, event.id],
    );

    await this.notifications.queueEmail(
      {
        templateKey: 'registration_confirmed',
        to: email,
        recipientType: 'volunteer',
        volunteerId: volunteer.id,
        eventId: event.id,
        programId: event.program_id,
        context: {
          firstName: volunteer.firstName,
          eventName: event.display_name,
          programName: event.program_name,
          activityName: event.display_name,
          eventDate: fmtDate(event.date),
          eventTime: String(event.start_time).slice(0, 5),
          location: event.location ?? 'to be confirmed',
          outstandingTrainings: missing.length
            ? missing.map((m: { name: string }) => m.name)
            : null,
        },
      },
      mgr,
    );
  }

  private eventContext(event: Record<string, string>) {
    return {
      id: event.id,
      code: event.code,
      name: event.display_name,
      date: event.date,
      startTime: String(event.start_time).slice(0, 5),
      programName: event.program_name,
    };
  }

  // ── Withdraw ───────────────────────────────────────────────────────────────

  async withdraw(principal: AuthPrincipal, eventId: string) {
    const volunteer = await this.volunteerOf(principal);

    const promotedIds: string[] = await this.dataSource.transaction(async (mgr) => {
      const enrollment = await mgr.findOne(EventEnrollment, {
        where: { volunteerId: volunteer.id, eventId, status: 'enrolled' },
      });
      if (!enrollment) throw new NotFoundException('You are not enrolled in this session.');

      // Snapshot the head of the queue: the DB trigger promotes on this update,
      // and the service's job afterwards is only to email whoever moved up.
      const before: Array<{ volunteer_id: string }> = await mgr.query(
        'SELECT volunteer_id FROM waitlist_entries WHERE event_id = $1 ORDER BY position',
        [eventId],
      );

      enrollment.status = 'cancelled';
      enrollment.cancelledAt = new Date();
      await mgr.save(enrollment);

      const after: Array<{ volunteer_id: string }> = await mgr.query(
        'SELECT volunteer_id FROM waitlist_entries WHERE event_id = $1',
        [eventId],
      );
      const afterSet = new Set(after.map((w) => w.volunteer_id));
      return before.map((w) => w.volunteer_id).filter((id) => !afterSet.has(id));
    });

    // Promotion emails — after commit, so nobody is congratulated for a
    // promotion that rolled back.
    for (const promotedId of promotedIds) {
      await this.queuePromotionEmail(promotedId, eventId);
    }

    return { withdrawn: true, promoted: promotedIds.length };
  }

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

  // ── Waitlist leave ─────────────────────────────────────────────────────────

  async leaveWaitlist(principal: AuthPrincipal, eventId: string) {
    const volunteer = await this.volunteerOf(principal);

    await this.dataSource.transaction(async (mgr) => {
      const entry = await mgr.findOne(WaitlistEntry, {
        where: { volunteerId: volunteer.id, eventId },
      });
      if (!entry) throw new NotFoundException('You are not on this waitlist.');
      await mgr.delete(WaitlistEntry, { id: entry.id });
      await mgr.query(
        'UPDATE waitlist_entries SET position = position - 1 WHERE event_id = $1 AND position > $2',
        [eventId, entry.position],
      );
    });

    return { left: true };
  }

  // ── Batch (Confirm Participation) ──────────────────────────────────────────

  async enrollBatch(principal: AuthPrincipal, eventIds: string[], opts: EnrollOptions) {
    this.assertApproved(await this.volunteerOf(principal));
    // Per-occurrence results so the dashboard can show partial success — one
    // full session must not sink the other three.
    const results = [];
    for (const eventId of eventIds) {
      try {
        results.push({ eventId, ...(await this.enroll(principal, eventId, opts)) });
      } catch (err) {
        if (err instanceof BusinessException) {
          results.push({
            eventId,
            state: 'failed' as const,
            code: err.code,
            message: err.message,
            details: err.details,
          });
        } else {
          throw err;
        }
      }
    }
    return { results };
  }

  // ── Mine ───────────────────────────────────────────────────────────────────

  async mine(principal: AuthPrincipal) {
    const volunteer = await this.volunteerOf(principal);
    const enrollments = await this.dataSource.query(
      `SELECT en.id, en.event_id, en.status, en.enrolled_at, en.promoted_from_waitlist,
              COALESCE(e.name, a.name) AS event_name, e.code, e.date, e.start_time,
              e.duration_hours, e.location, e.status AS event_status,
              p.name AS program_name
       FROM event_enrollments en
       JOIN events e ON e.id = en.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE en.volunteer_id = $1 AND en.status = 'enrolled'
       ORDER BY e.date, e.start_time`,
      [volunteer.id],
    );
    const waitlists = await this.dataSource.query(
      `SELECT w.event_id, w.position, COALESCE(e.name, a.name) AS event_name,
              e.date, e.start_time, e.location, p.name AS program_name
       FROM waitlist_entries w
       JOIN events e ON e.id = w.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE w.volunteer_id = $1
       ORDER BY e.date`,
      [volunteer.id],
    );
    return { enrollments, waitlists };
  }
}
