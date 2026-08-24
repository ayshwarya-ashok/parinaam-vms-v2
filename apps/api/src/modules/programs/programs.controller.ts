import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
    Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { EventsAdminService } from './events-admin.service';
import {
  CancelEventDto,
  CreateActivityDto,
  CreateEventDto,
  CreateEventSeriesDto,
  CreatePhaseDto,
  CreateProgramDto,
  DiscontinueDto,
  OverridePhaseDto,
  SetTrainingsDto,
  UpdateActivityDto,
  UpdateEventDto,
  UpdatePhaseDto,
  UpdateProgramDto,
} from './programs.dto';
import { PhasesService } from './phases.service';
import { ProgramsService } from './programs.service';

@ApiTags('programs')
@Controller()
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly eventsAdmin: EventsAdminService,
    private readonly phases: PhasesService,
  ) {}

  // ── Programs ─────────────────────────────────────────────────────────────

  @Get('programs')
  @ApiOperation({ summary: 'Programs with activity/occurrence counts' })
  list(@Query('q') q?: string, @Query('status') status?: string) {
    return this.programs.list({ q, status });
  }

  @Get('programs/:id')
  detail(@Param('id', UuidPipe) id: string) {
    return this.programs.detail(id);
  }

  @Post('programs')
  @Roles('admin')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateProgramDto) {
    return this.programs.create(user, dto);
  }

  @Patch('programs/:id')
  @Roles('admin')
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateProgramDto) {
    return this.programs.update(id, dto);
  }

  @Post('programs/:id/publish')
  @Roles('admin')
  publish(@Param('id', UuidPipe) id: string) {
    return this.programs.publish(id);
  }

  @Post('programs/:id/discontinue')
  @Roles('admin')
  @ApiOperation({
    summary: 'BR-17 — block enrollment on every occurrence beneath. Cancels nothing.',
  })
  discontinue(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: DiscontinueDto,
  ) {
    return this.programs.discontinue(user, id, dto);
  }

  @Post('programs/:id/reactivate')
  @Roles('admin')
  reactivate(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.programs.reactivate(user, id);
  }

  @Put('programs/:id/trainings')
  @Roles('admin')
  setProgramTrainings(@Param('id', UuidPipe) id: string, @Body() dto: SetTrainingsDto) {
    return this.programs.setTrainings(id, dto.trainingIds);
  }

  @Get('programs/:id/participation')
  @Roles('admin')
  @ApiOperation({ summary: 'Per-volunteer hours and occurrences — the certificate source' })
  participation(@Param('id', UuidPipe) id: string) {
    return this.programs.participation(id);
  }

  // ── Announcements ──────────────────────────────────────────────────────────

  @Post('programs/:id/announcement/preview')
  @Roles('admin')
  @ApiOperation({ summary: 'Rendered by the same template the send uses' })
  announcementPreview(
    @Param('id', UuidPipe) id: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.eventsAdmin.announcementPreview(id, eventId || undefined);
  }

  @Post('programs/:id/announcement')
  @Roles('admin')
  announce(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.eventsAdmin.announce(user, id, eventId || undefined);
  }

  @Get('programs/:id/announcements')
  @Roles('admin')
  announcementHistory(@Param('id', UuidPipe) id: string) {
    return this.eventsAdmin.announcementHistory(id);
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  @Post('programs/:programId/activities')
  @Roles('admin')
  createActivity(
    @CurrentUser() user: AuthPrincipal,
    @Param('programId', UuidPipe) programId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.programs.createActivity(user, programId, dto);
  }

  @Get('activities/:id')
  activityDetail(@Param('id', UuidPipe) id: string) {
    return this.programs.activityDetail(id);
  }

  @Patch('activities/:id')
  @Roles('admin')
  updateActivity(@Param('id', UuidPipe) id: string, @Body() dto: UpdateActivityDto) {
    return this.programs.updateActivity(id, dto);
  }

  @Post('activities/:id/discontinue')
  @Roles('admin')
  discontinueActivity(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: DiscontinueDto,
  ) {
    return this.programs.discontinueActivity(user, id, dto);
  }

  @Post('activities/:id/reactivate')
  @Roles('admin')
  reactivateActivity(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.programs.reactivateActivity(user, id);
  }

  @Put('activities/:id/trainings')
  @Roles('admin')
  setActivityTrainings(@Param('id', UuidPipe) id: string, @Body() dto: SetTrainingsDto) {
    return this.programs.setActivityTrainings(id, dto.trainingIds);
  }

  // ── Occurrences (admin scheduling) ─────────────────────────────────────────

  @Post('activities/:activityId/events')
  @Roles('admin')
  @ApiOperation({ summary: 'Schedule one occurrence; unset fields inherit activity defaults' })
  createEvent(
    @CurrentUser() user: AuthPrincipal,
    @Param('activityId', UuidPipe) activityId: string,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsAdmin.create(user, activityId, dto);
  }

  @Post('activities/:activityId/events/series')
  @Roles('admin')
  @ApiOperation({ summary: 'Schedule a weekly/monthly series in one call' })
  createSeries(
    @CurrentUser() user: AuthPrincipal,
    @Param('activityId', UuidPipe) activityId: string,
    @Body() dto: CreateEventSeriesDto,
  ) {
    return this.eventsAdmin.createSeries(user, activityId, dto);
  }

  @Get('events/:id/admin')
  @Roles('admin')
  adminEventDetail(@Param('id', UuidPipe) id: string) {
    return this.eventsAdmin.adminDetail(id);
  }

  @Patch('events/:id')
  @Roles('admin')
  updateEvent(@Param('id', UuidPipe) id: string, @Body() dto: UpdateEventDto) {
    return this.eventsAdmin.update(id, dto);
  }

  @Post('events/:id/complete')
  @Roles('admin')
  @ApiOperation({ summary: 'Mark a past upcoming session as completed — what dashboards count as conducted' })
  completeEvent(@Param('id', UuidPipe) id: string) {
    return this.eventsAdmin.complete(id);
  }

  @Post('events/:id/publish')
  @Roles('admin')
  publishEvent(@Param('id', UuidPipe) id: string) {
    return this.eventsAdmin.publish(id);
  }

  @Post('events/:id/cancel')
  @Roles('admin')
  @ApiOperation({ summary: 'BR-07 — cancel and notify every enrolled and waitlisted volunteer' })
  cancelEvent(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventsAdmin.cancel(user, id, dto);
  }

  @Get('events/:id/enrollments')
  @Roles('admin')
  eventEnrollments(@Param('id', UuidPipe) id: string) {
    return this.eventsAdmin.enrollmentsOf(id);
  }

  // ── Session phases ───────────────────────────────────────────────────────

  @Get('events/:id/phases')
  @Roles('admin')
  @ApiOperation({ summary: "A session's phases with lead names" })
  eventPhases(@Param('id', UuidPipe) id: string) {
    return this.phases.listByEvent(id);
  }

  @Post('events/:id/phases')
  @Roles('admin')
  @ApiOperation({ summary: 'Add a phase — the session status becomes phase-derived' })
  addPhase(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.phases.create(user, id, dto);
  }

  @Patch('phases/:id')
  @Roles('admin')
  updatePhase(@Param('id', UuidPipe) id: string, @Body() dto: UpdatePhaseDto) {
    return this.phases.update(id, dto);
  }

  @Delete('phases/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Remove an untouched upcoming phase' })
  removePhase(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.phases.remove(user, id);
  }

  @Post('phases/:id/start')
  @Roles('admin')
  @ApiOperation({ summary: 'Mark work on a phase as started (session goes inprogress)' })
  startPhase(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.phases.start(user, id);
  }

  @Post('phases/:id/complete')
  @Roles('admin')
  @ApiOperation({ summary: "Mark the Parinaam side complete — partner-owned phases need the lead's mark or an override" })
  completePhase(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.phases.completeParinaamSide(user, id);
  }

  @Post('phases/:id/override')
  @Roles('admin')
  @ApiOperation({ summary: 'Force a phase status with a reason — audited; may revert a completed session' })
  overridePhase(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: OverridePhaseDto,
  ) {
    return this.phases.override(user, id, dto);
  }
}
