import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/auth.decorators';

/**
 * Prometheus text exposition, hand-rolled — four gauges don't justify a
 * client library. Scraped over the container network; not linked anywhere
 * user-facing and carries no personal data (counts only).
 */
@Public()
@ApiTags('health')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics — outbox backlog, email success rate, core counts' })
  async metrics(): Promise<string> {
    const [email] = await this.dataSource.query(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('queued','dispatched'))::int AS backlog,
        COUNT(*) FILTER (WHERE status = 'sent')::int   AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM email_logs`,
    );
    const [core] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*)::int FROM volunteers)                             AS volunteers,
        (SELECT COUNT(*)::int FROM events WHERE status = 'upcoming')       AS events_upcoming,
        (SELECT COUNT(*)::int FROM event_enrollments WHERE status = 'enrolled') AS enrollments,
        (SELECT COUNT(*)::int FROM report_runs WHERE status = 'failed')    AS report_failures`,
    );

    const delivered = email.sent + email.failed;
    const successRate = delivered === 0 ? 1 : email.sent / delivered;

    const lines = [
      '# HELP vms_email_outbox_backlog Emails written but not yet confirmed delivered.',
      '# TYPE vms_email_outbox_backlog gauge',
      `vms_email_outbox_backlog ${email.backlog}`,
      '# HELP vms_email_success_ratio sent / (sent + failed), 1 when nothing has been delivered yet.',
      '# TYPE vms_email_success_ratio gauge',
      `vms_email_success_ratio ${successRate.toFixed(4)}`,
      '# HELP vms_emails_sent_total Emails confirmed delivered by n8n.',
      '# TYPE vms_emails_sent_total counter',
      `vms_emails_sent_total ${email.sent}`,
      '# HELP vms_emails_failed_total Emails n8n reported as failed.',
      '# TYPE vms_emails_failed_total counter',
      `vms_emails_failed_total ${email.failed}`,
      '# HELP vms_volunteers_total Registered volunteers.',
      '# TYPE vms_volunteers_total gauge',
      `vms_volunteers_total ${core.volunteers}`,
      '# HELP vms_events_upcoming Upcoming occurrences.',
      '# TYPE vms_events_upcoming gauge',
      `vms_events_upcoming ${core.events_upcoming}`,
      '# HELP vms_enrollments_active Currently enrolled seats.',
      '# TYPE vms_enrollments_active gauge',
      `vms_enrollments_active ${core.enrollments}`,
      '# HELP vms_report_runs_failed_total Report runs that ended in failure.',
      '# TYPE vms_report_runs_failed_total counter',
      `vms_report_runs_failed_total ${core.report_failures}`,
    ];
    return lines.join('\n') + '\n';
  }
}
