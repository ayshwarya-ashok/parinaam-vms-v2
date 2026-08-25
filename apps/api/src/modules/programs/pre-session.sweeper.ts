import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BusinessException } from '../../common';
import { NotificationsService } from '../notifications';

/**
 * Pre-session emails (client decision, 2026-08-25 — closes gap G5):
 *
 *   T-7  session_details  — everything a volunteer needs, a week out
 *   T-1  session_reminder — date/time/venue/coordinator, the day before
 *
 * Both ride the transactional outbox → n8n → SMTP pipeline like every other
 * email. The sweep is idempotent through email_logs: one details + one
 * reminder per (event, volunteer), so late enrollees are caught by the next
 * day's run and re-runs never double-send. The details window is 1–7 days out
 * (not exactly 7) so sessions scheduled inside the week still get one.
 *
 * Admins can also (re)trigger either email for a session from the session
 * record — manual sends bypass the already-sent dedupe on purpose.
 */
@Injectable()
export class PreSessionSweeper {
  private readonly logger = new Logger(PreSessionSweeper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /** Local IST calendar date + offset days — "a week before" is an IST question. */
  private istDatePlus(days: number): string {
    const d = new Date(Date.now() + days * 86_400_000);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  @Cron('0 0 4 * * *', { name: 'pre-session-email-sweep' }) // 09:30 IST = 04:00 UTC
  async sweep(): Promise<void> {
    // Registered in both processes so the manual re-trigger works from the
    // API; the scheduled sweep itself runs in the worker only.
    if ((process.env.ROLE ?? 'all') === 'api') return;
    const today = this.istDatePlus(0);
    const detailsSent = await this.queueDue(
      'session_details',
      `e.date > $1::date AND e.date <= ($1::date + 7)`,
      today,
    );
    const remindersSent = await this.queueDue(
      'session_reminder',
      `e.date = ($1::date + 1)`,
      today,
    );
    if (detailsSent + remindersSent > 0) {
      this.logger.log(`Pre-session emails queued: ${detailsSent} details, ${remindersSent} reminders`);
    }
  }

  /** Queue one email per enrolled volunteer who has not had this template for this event. */
  private async queueDue(
    templateKey: 'session_details' | 'session_reminder',
    datePredicate: string,
    today: string,
  ): Promise<number> {
    const due = await this.dataSource.query(
      `SELECT e.id AS event_id, COALESCE(e.name, a.name) AS display_name, e.date,
              e.start_time, e.duration_hours, e.location, e.city,
              a.description AS activity_description, a.program_id, p.name AS program_name,
              c.name AS coordinator_name, c.mobile AS coordinator_mobile,
              v.id AS volunteer_id, v.first_name, u.email
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN event_enrollments en ON en.event_id = e.id AND en.status = 'enrolled'
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE e.status = 'upcoming'
         AND ${datePredicate}
         AND NOT EXISTS (
           SELECT 1 FROM email_logs el
           WHERE el.event_id = e.id AND el.volunteer_id = v.id
             AND el.template_key = $2)
       LIMIT 500`,
      [today, templateKey],
    );
    for (const r of due) await this.queueOne(templateKey, r);
    return due.length;
  }

  /**
   * Manual (re)trigger from the session record. Sends to every enrolled
   * volunteer regardless of what was sent before — that is the point of a
   * re-trigger. Returns how many were queued.
   */
  async sendNow(eventId: string, type: 'details' | 'reminder'): Promise<{ queued: number }> {
    const templateKey = type === 'details' ? 'session_details' : 'session_reminder';
    const [event] = await this.dataSource.query(
      `SELECT id, status FROM events WHERE id = $1`,
      [eventId],
    );
    if (!event) throw new NotFoundException('Session not found');
    if (event.status === 'cancelled' || event.status === 'completed') {
      throw new BusinessException(
        'NOT_UPCOMING',
        `Pre-session emails only make sense before the session — this one is ${event.status}.`,
      );
    }

    const recipients = await this.dataSource.query(
      `SELECT e.id AS event_id, COALESCE(e.name, a.name) AS display_name, e.date,
              e.start_time, e.duration_hours, e.location, e.city,
              a.description AS activity_description, a.program_id, p.name AS program_name,
              c.name AS coordinator_name, c.mobile AS coordinator_mobile,
              v.id AS volunteer_id, v.first_name, u.email
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN event_enrollments en ON en.event_id = e.id AND en.status = 'enrolled'
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE e.id = $1`,
      [eventId],
    );
    for (const r of recipients) await this.queueOne(templateKey, r);
    return { queued: recipients.length };
  }

  private async queueOne(
    templateKey: 'session_details' | 'session_reminder',
    r: Record<string, string | null>,
  ): Promise<void> {
    await this.notifications.queueEmail({
      templateKey,
      to: r.email as string,
      recipientType: 'volunteer',
      volunteerId: r.volunteer_id,
      eventId: r.event_id,
      programId: r.program_id,
      context: {
        firstName: r.first_name,
        eventName: r.display_name,
        programName: r.program_name,
        eventDate: new Date(`${r.date}T00:00:00`).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        eventTime: String(r.start_time).slice(0, 5),
        durationHours: Number(r.duration_hours),
        location: [r.location, r.city].filter(Boolean).join(', ') || 'to be confirmed',
        coordinatorName: r.coordinator_name ?? 'your Field Coordinator',
        coordinatorMobile: r.coordinator_mobile ?? 'contact via Parinaam',
        activityDescription: r.activity_description,
      },
    });
  }
}
