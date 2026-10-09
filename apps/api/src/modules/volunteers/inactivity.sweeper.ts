import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications';

/**
 * Round 56 — a year of silence closes the account, politely.
 *
 * Daily 09:15 IST: volunteers whose LAST ACTIVITY is more than a year old are
 * deactivated and told so by email. "Activity" is deliberately broader than
 * the letter of the rule (no enrollment in a year): an enrollment, an
 * attendance record (walk-ins never enroll), or the account's own creation —
 * a volunteer who registered eleven months ago and never enrolled still has
 * their full first year.
 *
 * Scope: approved, currently-active volunteers on sign-in-able accounts.
 * Pending and rejected registrations have their own lifecycle, and erased
 * accounts are husks. Deactivation here is exactly the admin's manual toggle
 * (users.is_active = false): sessions die on rotation, the record keeps, and
 * an admin reactivating later fires the existing Welcome-Back email.
 */
@Injectable()
export class InactivitySweeper {
  private readonly logger = new Logger(InactivitySweeper.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 45 3 * * *', { name: 'volunteer-inactivity-sweep' }) // 09:15 IST = 03:45 UTC
  async sweep(): Promise<void> {
    const due: Array<{
      volunteer_id: string;
      user_id: string;
      first_name: string;
      email: string;
      last_activity: string;
    }> = await this.dataSource.query(
      `SELECT v.id AS volunteer_id, u.id AS user_id, v.first_name, u.email,
              GREATEST(
                v.created_at,
                COALESCE((SELECT MAX(en.enrolled_at) FROM event_enrollments en
                          WHERE en.volunteer_id = v.id), v.created_at),
                COALESCE((SELECT MAX(ar.recorded_at) FROM attendance_records ar
                          WHERE ar.volunteer_id = v.id), v.created_at)
              ) AS last_activity
       FROM volunteers v
       JOIN users u ON u.id = v.user_id
       WHERE u.is_active
         AND u.role = 'volunteer'
         AND v.registration_status = 'approved'
         AND u.email NOT LIKE '%@erased.invalid'
         AND GREATEST(
               v.created_at,
               COALESCE((SELECT MAX(en.enrolled_at) FROM event_enrollments en
                         WHERE en.volunteer_id = v.id), v.created_at),
               COALESCE((SELECT MAX(ar.recorded_at) FROM attendance_records ar
                         WHERE ar.volunteer_id = v.id), v.created_at)
             ) < now() - interval '1 year'
       LIMIT 100`,
    );
    if (due.length === 0) return;

    this.logger.warn(`Inactivity sweep: deactivating ${due.length} volunteer(s)`);
    for (const r of due) {
      // Per-volunteer isolation: one bad row must not strand the rest of the
      // batch half-processed.
      try {
        await this.dataSource.query(`UPDATE users SET is_active = false WHERE id = $1`, [r.user_id]);
        await this.dataSource.query(
          // Every jsonb_build_object argument is cast — Postgres cannot infer
          // a bare parameter's type inside the function call.
          `INSERT INTO audit_logs (action, entity, entity_id, after_data)
           VALUES ('volunteer.auto_deactivated', 'volunteers', $1,
                   jsonb_build_object('email', $2::text, 'lastActivity', $3::text,
                                      'rule', 'no activity for 1 year'))`,
          [r.volunteer_id, r.email, String(r.last_activity)],
        );
        await this.notifications.queueEmail({
          templateKey: 'account_inactivity_deactivated',
          to: r.email,
          recipientType: 'volunteer',
          volunteerId: r.volunteer_id,
          context: { firstName: r.first_name },
        });
      } catch (err) {
        this.logger.error(`inactivity deactivation failed for ${r.email}: ${(err as Error).message}`);
      }
    }
  }
}
