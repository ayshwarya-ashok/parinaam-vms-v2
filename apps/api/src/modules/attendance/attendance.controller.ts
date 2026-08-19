import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMilitaryTime,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthPrincipal,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { AttendanceService, UploadedImage } from './attendance.service';

// Multipart fields arrive as strings; coerce explicitly.
const toBool = ({ value }: { value: unknown }) => value === true || value === 'true';
const toInt = ({ value }: { value: unknown }) => (value === '' || value == null ? 0 : Number(value));

class VolunteerSubmissionDto {
  @Transform(toBool) @IsBoolean() attended!: boolean;
  @IsOptional() @IsMilitaryTime() arrivalTime?: string;
  @IsOptional() @IsMilitaryTime() departureTime?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional()
  @IsIn(['Personal emergency', 'Medical / Health issue', 'Work / prior commitment', 'Transport issue', 'No longer available', 'Other'])
  absenceReason?: string;
  @IsOptional() @IsString() @MaxLength(2000) absenceDetail?: string;
}

class CoordinatorSubmissionDto {
  @IsIn(['completed', 'partial', 'postponed', 'cancelled'])
  status!: 'completed' | 'partial' | 'postponed' | 'cancelled';
  @IsOptional() @IsMilitaryTime() actualStartTime?: string;
  @IsOptional() @IsMilitaryTime() actualEndTime?: string;
  @Transform(toInt) @IsInt() @Min(0) volunteersPresent!: number;
  @Transform(toInt) @IsInt() @Min(0) beneficiariesReached!: number;
  @IsOptional() @IsString() @MaxLength(4000) highlights?: string;
  @IsOptional() @IsString() @MaxLength(4000) challenges?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

class DispatchDto {
  @IsIn(['volunteer', 'coordinator', 'both'])
  target!: 'volunteer' | 'coordinator' | 'both';
}

class OverrideDto {
  @IsOptional() @IsBoolean() attended?: boolean;
  @IsOptional() @IsNumber() @Min(0) hoursContributed?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional()
  @IsIn(['Personal emergency', 'Medical / Health issue', 'Work / prior commitment', 'Transport issue', 'No longer available', 'Other'])
  absenceReason?: string;
}

const IMAGE_LIMITS = { fileSize: 8 * 1024 * 1024, files: 2 };

@ApiTags('attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ── Admin: field execution ──────────────────────────────────────────────────

  @Get('attendance/dispatches')
  @Roles('admin')
  @ApiOperation({ summary: 'Field execution table — per-occurrence dispatch and submission state' })
  dispatches(
    @Query('q') q?: string,
    @Query('programId') programId?: string,
    @Query('sendStatus') sendStatus?: string,
  ) {
    return this.service.dispatchList({ q, programId, sendStatus });
  }

  @Post('attendance/dispatches/:eventId/preview')
  @Roles('admin')
  preview(
    @Param('eventId', UuidPipe) eventId: string,
    @Body() body: { target: 'volunteer' | 'coordinator' },
  ) {
    return this.service.preview(eventId, body.target);
  }

  @Post('attendance/dispatches/:eventId/send')
  @Roles('admin')
  @ApiOperation({ summary: 'Issue one signed link per recipient and queue the emails' })
  dispatch(
    @CurrentUser() user: AuthPrincipal,
    @Param('eventId', UuidPipe) eventId: string,
    @Body() dto: DispatchDto,
  ) {
    return this.service.dispatch(user, eventId, dto.target);
  }

  @Get('events/:id/attendance')
  @Roles('admin')
  records(@Param('id', UuidPipe) id: string) {
    return this.service.recordsOf(id);
  }

  @Get('events/:id/report')
  @Roles('admin')
  report(@Param('id', UuidPipe) id: string) {
    return this.service.reportOf(id);
  }

  @Patch('attendance/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin correction — source becomes admin, change audited' })
  override(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: OverrideDto,
  ) {
    return this.service.adminOverride(user, id, dto);
  }

  // ── Link-token forms (BR-13) — the token IS the authentication ─────────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('attendance/link/:token')
  @ApiOperation({ summary: 'Volunteer form context via signed link' })
  volunteerForm(@Param('token') token: string) {
    return this.service.volunteerFormContext(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('attendance/link/:token')
  @UseInterceptors(FilesInterceptor('images', IMAGE_LIMITS.files, { limits: IMAGE_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Volunteer attendance submission (BR-15)' })
  submitVolunteer(
    @Param('token') token: string,
    @Body() dto: VolunteerSubmissionDto,
    @UploadedFiles() images: UploadedImage[] = [],
  ) {
    return this.service.submitVolunteer(token, dto, images);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('reports/link/:token')
  @ApiOperation({ summary: 'Coordinator report context via signed link' })
  coordinatorForm(@Param('token') token: string) {
    return this.service.coordinatorFormContext(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reports/link/:token')
  @UseInterceptors(FilesInterceptor('images', IMAGE_LIMITS.files, { limits: IMAGE_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Coordinator occurrence report — the beneficiary-count source' })
  submitCoordinator(
    @Param('token') token: string,
    @Body() dto: CoordinatorSubmissionDto,
    @UploadedFiles() images: UploadedImage[] = [],
  ) {
    return this.service.submitCoordinator(token, dto, images);
  }
}
