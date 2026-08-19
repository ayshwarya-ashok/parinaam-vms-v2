import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportRun, ScheduledReport } from '../../database/entities';
import { ExportersService } from './exporters.service';
import { ReportDispatcher } from './report.dispatcher';
import { ReportQueryService } from './report-query.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReportRun, ScheduledReport])],
  controllers: [ReportsController],
  providers: [
    ReportQueryService,
    ExportersService,
    ReportsService,
    ScheduledReportsService,
    // Always registered so run-now works from the API; its cron body no-ops
    // outside the worker.
    ReportDispatcher,
  ],
  exports: [ReportsService, ScheduledReportsService],
})
export class ReportsModule {}
