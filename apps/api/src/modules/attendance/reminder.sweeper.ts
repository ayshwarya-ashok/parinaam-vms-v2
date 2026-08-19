import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AppConfig } from '../../config';
import { NotificationsService } from '../notifications';
import { LinkTokenService } from './link-token.service';

/**
 * Daily 09:00 IST: nudge volunteers who were sent an attendance link over 24h
 * ago for a session that has happened, and still have not submitted. Exactly
 * one reminder per person per occurrence — nagging is worse than a gap.
 */
@Injectable()
export class AttendanceReminderSweeper {
  private readonly logger = new Logger(AttendanceReminderSweeper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly linkTokens: LinkTokenService,
    private readonly config: AppConfig,
  ) {}

  @Cron('0 30 3 * * *', { name: 'attendance-reminder-sweep' }) // 09:00 IST = 03:30 UTC
  async sweep(): Promise<void> {
    const due = await this.dataSource.query(
      `SELECT e.id AS event_id, COALESCE(e.name, a.name) AS display_name, e.date,
              e.start_time, e.location, a.program_id,
              v.id AS volunteer_id, v.first_name, u.email
       FROM attendance_dispatches d
       JOIN events e ON e.id = d.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN event_enrollments en ON en.event_id = e.id AND en.status = 'enrolled'
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE d.volunteer_email_sent
         AND d.volunteer_email_sent_at < now() - interval '24 hours'
         AND e.date <= CURRENT_DATE
         AND e.status <> 'cancelled'
         AND NOT EXISTS (
           SELECT 1 FROM attendance_records ar
           WHERE ar.event_id = e.id AND ar.volunteer_id = v.id)
         AND NOT EXISTS (
           SELECT 1 FROM email_logs el
           WHERE el.event_id = e.id AND el.volunteer_id = v.id
             AND el.template_key = 'attendance_reminder')
       LIMIT 200`,
    );
    if (due.length === 0) return;

    this.logger.log(`Attendance reminders due: ${due.length}`);
    for (const r of due) {
      const { raw } = await this.linkTokens.issue({
        purpose: 'volunteer_attendance',
        eventId: r.event_id,
        volunteerId: r.volunteer_id,
        subjectEmail: r.email,
      });
      await this.notifications.queueEmail({
        templateKey: 'attendance_reminder',
        to: r.email,
        recipientType: 'volunteer',
        volunteerId: r.volunteer_id,
        eventId: r.event_id,
        programId: r.program_id,
        context: {
          firstName: r.first_name,
          eventName: r.display_name,
          eventDate: new Date(String(r.date).slice(0, 10) + 'T00:00:00').toLocaleDateString(
            'en-IN',
            { day: 'numeric', month: 'long', year: 'numeric' },
          ),
          link: `${this.config.get('PUBLIC_WEB_URL')}/attendance/${raw}`,
        },
      });
    }
  }
}
