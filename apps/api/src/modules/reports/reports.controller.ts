import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import type { Response } from 'express';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { ReportFormat, ReportFrequency } from '../../database/entities';
import { ReportDispatcher } from './report.dispatcher';
import { ReportQueryService } from './report-query.service';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled.service';

const REPORT_TYPES = ['volunteers', 'volunteer_summary', 'programs', 'program', 'program_summary', 'calendar', 'annual_calendar'];

class ExportDto {
  @IsIn(REPORT_TYPES) reportType!: string;
  @IsIn(['PDF', 'Excel', 'CSV']) format!: ReportFormat;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}

class CreateScheduleDto {
  @IsString() @MaxLength(255) name!: string;
  @IsIn(REPORT_TYPES) reportType!: string;
  @IsIn(['PDF', 'Excel', 'CSV']) format!: ReportFormat;
  @IsIn(['Daily', 'Weekly', 'Monthly']) frequency!: ReportFrequency;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) sendTime!: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  /** Comma-separated email list. */
  @IsString() @MaxLength(2000) recipients!: string;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}

class UpdateScheduleDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsIn(REPORT_TYPES) reportType?: string;
  @IsOptional() @IsIn(['PDF', 'Excel', 'CSV']) format?: ReportFormat;
  @IsOptional() @IsIn(['Daily', 'Weekly', 'Monthly']) frequency?: ReportFrequency;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) sendTime?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @MaxLength(2000) recipients?: string;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
  @IsOptional() isActive?: boolean;
}

@ApiTags('reports')
@Roles('admin')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly queries: ReportQueryService,
    private readonly schedules: ScheduledReportsService,
    private readonly dispatcher: ReportDispatcher,
  ) {}

  @Get('volunteers')
  @ApiOperation({ summary: 'The volunteer report table (v_volunteer_report_summary), filtered' })
  async volunteers(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('phase') phase?: string,
    @Query('city') city?: string,
  ) {
    const data = await this.queries.volunteers({ q, category, phase, city });
    return { columns: data.columns, data: data.rows };
  }

  @Post('export')
  @ApiOperation({ summary: 'Run an export now; records a report_runs row and returns it' })
  async export(@Body() dto: ExportDto, @CurrentUser() user: AuthPrincipal) {
    const run = await this.reports.runExport({
      reportType: dto.reportType,
      format: dto.format,
      filters: dto.filters ?? {},
      requestedBy: user.sub,
    });
    return { runId: run.id, status: run.status, rowCount: run.rowCount };
  }

  @Get('runs')
  @ApiOperation({ summary: 'Recent report runs, newest first' })
  async runs() {
    return { data: await this.reports.listRuns() };
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'One run — status, row count, error if failed' })
  run(@Param('id', UuidPipe) id: string) {
    return this.reports.findRun(id);
  }

  @Get('runs/:id/download')
  @ApiOperation({ summary: 'Download the generated file' })
  async download(@Param('id', UuidPipe) id: string, @Res() res: Response) {
    const { data, filename, mime } = await this.reports.download(id);
    res
      .type(mime)
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(data);
  }

  // ── Scheduled reports ───────────────────────────────────────────────────────

  @Get('scheduled')
  @ApiOperation({ summary: 'All scheduled reports' })
  async listScheduled() {
    return { data: await this.schedules.list() };
  }

  @Post('scheduled')
  @ApiOperation({ summary: 'Create a schedule; next_run_at computed in its timezone' })
  createScheduled(@Body() dto: CreateScheduleDto, @CurrentUser() user: AuthPrincipal) {
    return this.schedules.create(dto, user.sub);
  }

  @Patch('scheduled/:id')
  @ApiOperation({ summary: 'Edit / pause / resume — pausing freezes next_run_at, resuming recomputes it' })
  updateScheduled(@Param('id', UuidPipe) id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  @Delete('scheduled/:id')
  @ApiOperation({ summary: 'Delete a schedule (run history is kept)' })
  async removeScheduled(@Param('id', UuidPipe) id: string) {
    await this.schedules.remove(id);
    return { deleted: true };
  }

  @Post('scheduled/:id/run-now')
  @ApiOperation({ summary: 'Fire immediately without touching the schedule clock' })
  runNow(@Param('id', UuidPipe) id: string) {
    return this.dispatcher.fire(id, false);
  }
}
