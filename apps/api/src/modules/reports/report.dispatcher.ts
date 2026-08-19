import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications';
import { SignedUrlService } from '../storage/signed-url.service';
import { FORMAT_META } from './exporters.service';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled.service';

/**
 * Every 5 minutes (worker only): fire due schedules, email the file to every
 * recipient, then advance next_run_at. markRan() runs even if a recipient
 * email fails — a schedule must never double-fire because SMTP hiccuped;
 * the failed message stays visible in email_logs for retry.
 */
@Injectable()
export class ReportDispatcher {
  private readonly logger = new Logger(ReportDispatcher.name);
  private running = false;

  constructor(
    private readonly schedules: ScheduledReportsService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
    private readonly signer: SignedUrlService,
  ) {}

  @Cron('0 */5 * * * *', { name: 'scheduled-report-dispatch' })
  async dispatch(): Promise<void> {
    // Registered in both processes so run-now works from the API, but the
    // clock belongs to the worker alone.
    if ((process.env.ROLE ?? 'all') === 'api') return;
    if (this.running) return; // a slow export must not overlap the next tick
    this.running = true;
    try {
      const due = await this.schedules.findDue();
      for (const schedule of due) {
        await this.fire(schedule.id).catch((err) =>
          this.logger.error(`Schedule ${schedule.name} failed: ${(err as Error).message}`),
        );
      }
    } finally {
      this.running = false;
    }
  }

  /** Shared by the cron and POST /reports/scheduled/:id/run-now. */
  async fire(scheduleId: string, advanceClock = true): Promise<{ runId: string; recipients: number }> {
    const schedule = await this.schedules.findOne(scheduleId);

    const run = await this.reports.runExport({
      reportType: schedule.reportType,
      format: schedule.format,
      filters: schedule.filters ?? {},
      scheduledReportId: schedule.id,
    });

    if (advanceClock) await this.schedules.markRan(schedule.id);

    const recipients = schedule.recipients
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const filename = `${schedule.name.replace(/[^\w.-]+/g, '-')}.${FORMAT_META[schedule.format].ext}`;
    for (const to of recipients) {
      await this.notifications.queueEmail({
        templateKey: 'report_ready',
        to,
        recipientType: 'admin',
        context: {
          reportName: schedule.name,
          reportType: schedule.reportType,
          format: schedule.format,
          frequency: schedule.frequency,
          rowCount: run.rowCount ?? 0,
        },
        attachmentUrl: this.signer.internalUrl(run.filePath!, filename),
        attachmentName: filename,
      });
    }

    this.logger.log(`Fired "${schedule.name}" -> ${recipients.length} recipient(s), run ${run.id}`);
    return { runId: run.id, recipients: recipients.length };
  }
}
