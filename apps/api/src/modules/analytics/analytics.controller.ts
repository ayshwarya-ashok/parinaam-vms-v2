import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/auth.decorators';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';
import { AnalyticsService, DashboardPeriod } from './analytics.service';

const PERIODS: DashboardPeriod[] = ['all', 'month', 'quarter', 'year'];

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @Roles('admin')
  @ApiOperation({ summary: 'KPIs and every chart series in one payload, filtered by period / programme / city' })
  dashboard(
    @Query('period') period?: string,
    @Query('programId') programId?: string,
    @Query('city') city?: string,
  ) {
    return this.analytics.dashboard({
      period: PERIODS.includes(period as DashboardPeriod) ? (period as DashboardPeriod) : 'all',
      programId: programId && UUID_PATTERN.test(programId) ? programId : undefined,
      city: city || undefined,
    });
  }
}
