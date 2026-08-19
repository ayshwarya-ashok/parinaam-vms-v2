import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications';

/**
 * Daily 10:00 IST: invite volunteers whose attendance was recorded yesterday
 * or earlier to rate the session. Exactly one invitation per person per
 * occurrence — the email_logs check makes the sweep idempotent.
 */
@Injectable()
export class FeedbackRequestSweeper {
  private readonly logger = new Logger(FeedbackRequestSweeper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 30 4 * * *', { name: 'feedback-request-sweep' }) // 10:00 IST = 04:30 UTC
  async sweep(): Promise<void> {
    const due = await this.dataSource.query(
      `SELECT e.id AS event_id, COALESCE(e.name, a.name) AS display_name, e.date,
              a.program_id, v.id AS volunteer_id, v.first_name, u.email
       FROM attendance_records ar
       JOIN events e ON e.id = ar.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN volunteers v ON v.id = ar.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE ar.attended
         AND e.date <= CURRENT_DATE
         AND e.date >= CURRENT_DATE - interval '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM feedback_submissions f
           WHERE f.event_id = e.id AND f.volunteer_id = v.id)
         AND NOT EXISTS (
           SELECT 1 FROM email_logs el
           WHERE el.event_id = e.id AND el.volunteer_id = v.id
             AND el.template_key = 'feedback_request')
       LIMIT 200`,
    );
    if (due.length === 0) return;

    this.logger.log(`Feedback invitations due: ${due.length}`);
    for (const r of due) {
      await this.notifications.queueEmail({
        templateKey: 'feedback_request',
        to: r.email,
        recipientType: 'volunteer',
        eventId: r.event_id,
        volunteerId: r.volunteer_id,
        programId: r.program_id,
        context: {
          firstName: r.first_name,
          eventName: r.display_name,
          eventDate: new Date(`${String(r.date).slice(0, 10)}T00:00:00`).toLocaleDateString(
            'en-IN',
            { day: 'numeric', month: 'long', year: 'numeric' },
          ),
        },
      });
    }
  }
}
