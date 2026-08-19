import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('options')
  @ApiOperation({ summary: 'Active issue/improvement tag vocabulary for the form' })
  options() {
    return this.feedback.optionCatalog();
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

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: "The volunteer's own submissions" })
  async mine(@CurrentUser() user: AuthPrincipal) {
    return { data: await this.feedback.mine(user.sub) };
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'All submissions, filterable by programme / occurrence / rating' })
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
  @Roles('admin')
  @ApiOperation({ summary: 'Rating/NPS aggregates and ranked issue/improvement tags' })
  analytics(@Query('programId') programId?: string) {
    return this.feedback.analytics(programId || undefined);
  }

  @Patch(':id/publish')
  @Roles('admin')
  @ApiOperation({ summary: 'Publish or retract a testimonial (BR-16: publish is an explicit admin act)' })
  async publish(@Param('id', UuidPipe) id: string, @Body() dto: PublishDto) {
    await this.feedback.setPublished(id, dto.publish);
    return { id, published: dto.publish };
  }
}
