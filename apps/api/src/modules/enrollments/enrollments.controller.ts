import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UUID_PATTERN, UuidPipe } from '../../common/pipes/uuid.pipe';
import { EnrollmentsService } from './enrollments.service';
import { BrowseQuery, EventsBrowseService } from './events-browse.service';

class EnrollDto {
  @IsOptional() @IsBoolean() acknowledgeConflict?: boolean;
  @IsOptional() @IsBoolean() acceptWaitlist?: boolean;
  @IsOptional() @IsString() @MaxLength(255) skills?: string;
}

class BatchEnrollDto extends EnrollDto {
  @IsArray()
  @ArrayNotEmpty()
  @Matches(UUID_PATTERN, { each: true, message: 'each id must be a UUID' })
  eventIds!: string[];
}

@ApiTags('events')
@Controller()
export class EnrollmentsController {
  constructor(
    private readonly enrollments: EnrollmentsService,
    private readonly browse: EventsBrowseService,
  ) {}

  // ── Browse ─────────────────────────────────────────────────────────────────

  @Get('events')
  @ApiOperation({
    summary:
      'Browse sessions. For volunteers each row carries capacity, own state, prerequisites and conflicts.',
  })
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query('q') q?: string,
    @Query('programId') programId?: string,
    @Query('type') type?: string,
    @Query('city') city?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('enrollState') enrollState?: BrowseQuery['enrollState'],
    @Query('sort') sort?: BrowseQuery['sort'],
    @Query('scope') scope?: BrowseQuery['scope'],
  ) {
    return this.browse.browse(user, {
      q,
      programId,
      type,
      city,
      from,
      to,
      enrollState,
      sort,
      scope,
    });
  }

  @Get('events/calendar')
  @ApiOperation({ summary: 'Month grid with per-day conflict flags for the caller' })
  calendar(@CurrentUser() user: AuthPrincipal, @Query('month') month: string) {
    return this.browse.calendar(user, month);
  }

  @Get('events/:id')
  detail(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.browse.detail(user, id);
  }

  // ── Enroll / withdraw / waitlist ───────────────────────────────────────────

  @Post('events/:id/enroll')
  @Roles('volunteer')
  @ApiOperation({
    summary:
      'The rule-dense transaction: BR-17 cascade, BR-05 union gate, BR-06 capacity, BR-10 waitlist, BR-11 conflicts.',
  })
  enroll(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: EnrollDto,
  ) {
    return this.enrollments.enroll(user, id, dto);
  }

  @Delete('events/:id/enroll')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Withdraw — the DB trigger promotes the waitlist head (BR-10)' })
  withdraw(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.enrollments.withdraw(user, id);
  }

  @Delete('events/:id/waitlist')
  @Roles('volunteer')
  leaveWaitlist(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.enrollments.leaveWaitlist(user, id);
  }

  @Post('enrollments/batch')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Confirm Participation — per-session results, partial success visible' })
  batch(@CurrentUser() user: AuthPrincipal, @Body() dto: BatchEnrollDto) {
    return this.enrollments.enrollBatch(user, dto.eventIds, dto);
  }

  @Get('enrollments/me')
  @Roles('volunteer')
  mine(@CurrentUser() user: AuthPrincipal) {
    return this.enrollments.mine(user);
  }
}
