import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';

/**
 * Admin hub tile counts. The full filterable dashboard (period / program /
 * city as real SQL predicates) is Phase 7 — this serves the Phase 2 hub only.
 */
@ApiTags('analytics')
@Roles('admin', 'field_coordinator')
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
         (SELECT COUNT(*)::int FROM email_logs WHERE status IN ('queued','dispatched')) AS mail_in_flight,
         -- "Awaiting your review" cards (Round 28): what a staff login should act on.
         (SELECT COUNT(*)::int FROM volunteers WHERE registration_status = 'pending') AS pending_registrations,
         (SELECT COUNT(*)::int FROM events e
           WHERE e.status = 'upcoming' AND e.date <= CURRENT_DATE
             AND NOT EXISTS (SELECT 1 FROM event_phases ph WHERE ph.event_id = e.id)) AS sessions_to_close,
         (SELECT COUNT(*)::int FROM v_program_participation pp
           JOIN volunteers v ON v.id = pp.volunteer_id
           JOIN users u ON u.id = v.user_id
           LEFT JOIN certificates c
             ON c.volunteer_id = pp.volunteer_id AND c.program_id = pp.program_id
           WHERE pp.events_attended > 0
             AND u.email::text NOT LIKE '%@erased.invalid'
             AND (c.id IS NULL OR c.issued = false)) AS certificates_pending`,
    );
    return { ...kpis, ...extra };
  }
}
