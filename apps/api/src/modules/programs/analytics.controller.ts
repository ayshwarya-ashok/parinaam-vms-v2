import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';

/**
 * Admin hub tile counts. The full filterable dashboard (period / programme /
 * city as real SQL predicates) is Phase 7 — this serves the Phase 2 hub only.
 */
@ApiTags('analytics')
@Roles('admin')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('summary')
  @ApiOperation({ summary: 'Admin hub tile counts from v_dashboard_kpis' })
  async summary() {
    const [kpis] = await this.dataSource.query('SELECT * FROM v_dashboard_kpis');
    const [extra] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM volunteers v JOIN users u ON u.id = v.user_id
           WHERE v.created_at > now() - interval '7 days') AS volunteers_this_week,
         (SELECT COUNT(*)::int FROM trainings WHERE status = 'active') AS active_trainings,
         (SELECT COUNT(*)::int FROM events WHERE status = 'inprogress') AS events_inprogress,
         (SELECT COUNT(*)::int FROM email_logs WHERE status IN ('queued','dispatched')) AS mail_in_flight`,
    );
    return { ...kpis, ...extra };
  }
}
