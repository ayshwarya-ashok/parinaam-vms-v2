import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UUID_PATTERN, UuidPipe } from '../../common/pipes/uuid.pipe';
import { TrainingsService } from './trainings.service';

class CreateTrainingDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(20) duration?: string;
  @IsOptional() @IsIn(['Online', 'In person']) mode?: 'Online' | 'In person';
  @IsOptional() @IsIn(['compliance', 'activity']) category?: 'compliance' | 'activity';
  @IsOptional() @IsInt() @Min(1) @Max(100) passingScore?: number;
  @IsOptional() @IsBoolean() isMandatory?: boolean;
  @IsOptional() @IsInt() @Min(1) maxAttempts?: number;
  @IsOptional() @IsInt() @Min(1) expiryMonths?: number;
}

class UpdateTrainingDto extends CreateTrainingDto {
  @IsOptional() @IsString() @MaxLength(255) declare name: string;
}

class QuestionDto {
  @IsString() questionText!: string;
  @IsInt() @Min(0) correctOptionIndex!: number;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) options!: string[];
}

class ReplaceQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];
}

class AnswerDto {
  @Matches(UUID_PATTERN) questionId!: string;
  @IsInt() @Min(0) selectedIndex!: number;
}

class SubmitAttemptDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers!: AnswerDto[];
}

class ResetDto {
  @Matches(UUID_PATTERN) volunteerId!: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class ResetAllDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

@ApiTags('trainings')
@Controller('trainings')
export class TrainingsController {
  constructor(private readonly service: TrainingsService) {}

  // ── Volunteer surface — declared before :id routes ─────────────────────────

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Two-section feed: mandatory + activity, with the BR-04 lock' })
  myTrainings(@CurrentUser() user: AuthPrincipal) {
    return this.service.myTrainings(user);
  }

  // ── Catalog ─────────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Training catalog with filters' })
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('mode') mode?: string,
  ) {
    return this.service.adminList({ q, category, status, mode });
  }

  @Post()
  @Roles('admin')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateTrainingDto) {
    return this.service.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail. Correct answers only for admins.' })
  detail(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.service.detail(id, user.role === 'admin', user);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateTrainingDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/status')
  @Roles('admin')
  setStatus(@Param('id', UuidPipe) id: string, @Body() body: { status: 'active' | 'inactive' }) {
    return this.service.setStatus(id, body.status);
  }

  // ── Materials ───────────────────────────────────────────────────────────────

  @Post(':id/materials')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a material. Bumps content_version; on a mandatory training the response asks for the BR-12 reset decision.',
  })
  addMaterial(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    return this.service.addMaterial(user, id, file);
  }

  @Delete(':id/materials/:materialId')
  @Roles('admin')
  removeMaterial(
    @Param('id', UuidPipe) id: string,
    @Param('materialId', UuidPipe) materialId: string,
  ) {
    return this.service.removeMaterial(id, materialId);
  }

  @Get(':id/materials/:materialId/download')
  @ApiOperation({ summary: 'Stream a material to any authenticated user' })
  async download(
    @Param('materialId', UuidPipe) materialId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { material, buffer } = await this.service.materialFile(materialId);
    res.setHeader('Content-Type', material.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${material.name}"`);
    res.send(buffer);
  }

  // ── Quiz ────────────────────────────────────────────────────────────────────

  @Put(':id/questions')
  @Roles('admin')
  replaceQuestions(@Param('id', UuidPipe) id: string, @Body() dto: ReplaceQuestionsDto) {
    return this.service.replaceQuestions(id, dto.questions);
  }

  @Post(':id/attempts')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Start — validates BR-02/BR-03; questions WITHOUT answers' })
  startAttempt(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.service.startAttempt(user, id);
  }

  @Post(':id/attempts/submit')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Server-side scoring; sets expiry on a pass; returns the review' })
  submitAttempt(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.service.submitAttempt(user, id, dto.answers);
  }

  // ── Admin assessments (BR-12) ───────────────────────────────────────────────

  @Get(':id/assessments')
  @Roles('admin')
  assessments(@Param('id', UuidPipe) id: string, @Query('status') status?: string) {
    return this.service.assessments(id, status);
  }

  @Post(':id/assessments/reset')
  @Roles('admin')
  @ApiOperation({ summary: 'Supersede one volunteer’s attempts — history preserved' })
  reset(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: ResetDto,
  ) {
    return this.service.resetAttempts(user, id, dto.volunteerId, dto.reason);
  }

  @Post(':id/assessments/reset-all')
  @Roles('admin')
  @ApiOperation({ summary: 'The BR-12 content-change decision: reset every volunteer' })
  resetAll(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: ResetAllDto,
  ) {
    return this.service.resetAllForTraining(user, id, dto.reason);
  }
}
