import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMilitaryTime,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';

export class CreateProgramDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) defaultCoordinatorId?: string;
  @IsOptional() @IsArray() @ArrayUnique() @Matches(UUID_PATTERN, { each: true, message: 'each id must be a UUID' }) trainingIds?: string[];
}

export class UpdateProgramDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) defaultCoordinatorId?: string;
}

export class DiscontinueDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class CreateActivityDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['In person', 'Online']) type?: 'In person' | 'Online';
  @IsOptional() @IsString() outcome?: string;
  @IsOptional() @IsString() @MaxLength(255) skillRequired?: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(24) defaultDurationHours?: number;
  @IsOptional() @IsInt() @Min(1) defaultMaxSlots?: number;
  @IsOptional() @IsString() @MaxLength(255) defaultLocation?: string;
  @IsOptional() @IsArray() @ArrayUnique() @Matches(UUID_PATTERN, { each: true, message: 'each id must be a UUID' }) trainingIds?: string[];
}

export class UpdateActivityDto extends CreateActivityDto {
  @IsOptional() @IsString() @MaxLength(255) declare name: string;
}

export class CreateEventDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsDateString() date!: string;
  @IsMilitaryTime() startTime!: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(24) durationHours?: number;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsInt() @Min(1) maxSlots?: number;
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) coordinatorId?: string;
  @IsOptional() @IsIn(['draft', 'upcoming']) status?: 'draft' | 'upcoming';
  @IsOptional() @IsArray() @ArrayUnique()
  @Matches(UUID_PATTERN, { each: true, message: 'each must be a UUID' })
  communityIds?: string[];
}

export class CreateEventSeriesDto {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsIn(['weekly', 'monthly']) pattern!: 'weekly' | 'monthly';
  @IsMilitaryTime() startTime!: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(24) durationHours?: number;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsInt() @Min(1) maxSlots?: number;
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) coordinatorId?: string;
  @IsOptional() @IsArray() @ArrayUnique()
  @Matches(UUID_PATTERN, { each: true, message: 'each must be a UUID' })
  communityIds?: string[];
}

export class UpdateEventDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsMilitaryTime() startTime?: string;
  @IsOptional() @IsNumber() @Min(0.5) @Max(24) durationHours?: number;
  @IsOptional() @IsString() @MaxLength(255) location?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsInt() @Min(1) maxSlots?: number;
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) coordinatorId?: string;
  @IsOptional() @IsArray() @ArrayUnique()
  @Matches(UUID_PATTERN, { each: true, message: 'each must be a UUID' })
  communityIds?: string[];
}

export class CancelEventDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class SetTrainingsDto {
  @IsArray() @ArrayUnique() @Matches(UUID_PATTERN, { each: true, message: 'each id must be a UUID' }) trainingIds!: string[];
}
