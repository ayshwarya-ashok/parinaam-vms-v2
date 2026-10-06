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
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AuthPrincipal,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UUID_PATTERN, UuidPipe } from '../../common/pipes/uuid.pipe';
import { FeedbackService } from './feedback.service';

class SubmitFeedbackDto {
  @Matches(UUID_PATTERN) eventId!: string;
  @IsInt() @Min(1) @Max(5) overallRating!: number;
  @IsInt() @Min(0) @Max(10) npsScore!: number;
  @IsOptional() @IsIn(['Definitely', 'Probably', 'Not sure', 'Unlikely'])
  volAgain?: 'Definitely' | 'Probably' | 'Not sure' | 'Unlikely';
  @IsOptional() @IsString() @MaxLength(4000) wentWell?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) issues?: string[];
  @IsOptional() @IsString() @MaxLength(4000) wentWrongDetail?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) improvements?: string[];
  @IsOptional() @IsString() @MaxLength(4000) improvementDetail?: string;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

class PublishDto {
  @IsBoolean() publish!: boolean;
}

// Multipart fields arrive as strings; coerce explicitly (same pattern as the
// attendance link form). Tag arrays travel as JSON strings.
const toInt = ({ value }: { value: unknown }) => (value === '' || value == null ? undefined : Number(value));
const toArray = ({ value }: { value: unknown }) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : undefined; } catch { return undefined; }
  }
  return undefined;
};

class LinkFeedbackDto {
  @Transform(toInt) @IsInt() @Min(1) @Max(5) overallRating!: number;
  @Transform(toInt) @IsInt() @Min(0) @Max(10) npsScore!: number;
  @IsOptional() @IsIn(['Definitely', 'Probably', 'Not sure', 'Unlikely'])
  volAgain?: 'Definitely' | 'Probably' | 'Not sure' | 'Unlikely';
  @IsOptional() @IsString() @MaxLength(4000) wentWell?: string;
  @IsOptional() @Transform(toArray) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) issues?: string[];
  @IsOptional() @IsString() @MaxLength(4000) wentWrongDetail?: string;
  @IsOptional() @Transform(toArray) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) improvements?: string[];
  @IsOptional() @IsString() @MaxLength(4000) improvementDetail?: string;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('options')
  @ApiOperation({ summary: 'Active issue/improvement tag vocabulary for the form' })
  options() {
    return this.feedback.optionCatalog();
  }

  // ── Link-token form (Round 51) — the token IS the authentication ──────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('link/:token')
  @ApiOperation({ summary: 'Feedback form context via the emailed signed link — no login' })
  linkContext(@Param('token') token: string) {
    return this.feedback.linkContext(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('link/:token')
  @UseInterceptors(FilesInterceptor('images', 2, { limits: { fileSize: 8 * 1024 * 1024, files: 2 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit feedback via the emailed signed link (BR-09; resubmit replaces within the grace window)' })
  submitViaLink(
    @Param('token') token: string,
    @Body() dto: LinkFeedbackDto,
    @UploadedFiles() images: Array<{ mimetype: string; buffer: Buffer }> = [],
  ) {
    return this.feedback.submitViaToken(token, dto, images);
  }

  @Get('eligible-events')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Attended occurrences the volunteer has not rated yet' })
  async eligible(@CurrentUser() user: AuthPrincipal) {
    return { data: await this.feedback.eligibleEvents(user.sub) };
  }

  @Post()
  @Roles('volunteer')
  @ApiOperation({ summary: 'Submit feedback for one attended occurrence (BR-09: once per occurrence)' })
  submit(@Body() dto: SubmitFeedbackDto, @CurrentUser() user: AuthPrincipal) {
    return this.feedback.submit(user.sub, dto);
  }

  @Post(':id/photos')
  @Roles('volunteer')
  @UseInterceptors(FilesInterceptor('images', 2, { limits: { fileSize: 8 * 1024 * 1024, files: 2 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach up to two session photos to your own feedback (EXIF stripped, private until published)' })
  addPhotos(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @UploadedFiles() images: Array<{ mimetype: string; buffer: Buffer }> = [],
  ) {
    return this.feedback.addPhotos(user.sub, id, images);
  }

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: "The volunteer's own submissions" })
  async mine(@CurrentUser() user: AuthPrincipal) {
    return { data: await this.feedback.mine(user.sub) };
  }

  @Get()
  @Roles('admin', 'field_coordinator')
  @ApiOperation({ summary: 'All submissions, filterable by program / occurrence / rating' })
  async list(
    @Query('programId') programId?: string,
    @Query('eventId') eventId?: string,
    @Query('rating') rating?: string,
    @Query('published') published?: string,
  ) {
    return {
      data: await this.feedback.list({
        programId: programId || undefined,
        eventId: eventId || undefined,
        rating: Number(rating) || undefined,
        published: published === undefined ? undefined : published === 'true',
      }),
    };
  }

  @Get('analytics')
  @Roles('admin', 'field_coordinator')
  @ApiOperation({ summary: 'Rating/NPS aggregates and ranked issue/improvement tags' })
  analytics(@Query('programId') programId?: string) {
    return this.feedback.analytics(programId || undefined);
  }

  @Get(':id/photos')
  @Roles('admin', 'field_coordinator')
  @ApiOperation({ summary: 'Photos attached to one submission, as short-lived signed URLs (Round 52 detail drawer)' })
  async photos(@Param('id', UuidPipe) id: string) {
    return { data: await this.feedback.photosOf(id) };
  }

  @Patch(':id/publish')
  @Roles('admin', 'field_coordinator')
  @ApiOperation({ summary: 'Publish or retract a testimonial (BR-16: publish is an explicit admin act)' })
  async publish(@Param('id', UuidPipe) id: string, @Body() dto: PublishDto) {
    await this.feedback.setPublished(id, dto.publish);
    return { id, published: dto.publish };
  }
}
