import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';

export class RegisterVolunteerDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsIn(['Female', 'Male', 'Non-binary', 'Prefer not to say'])
  gender?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsIn(['Individual', 'CSR'])
  category!: 'Individual' | 'CSR';

  /** Required when category = CSR (BR-01). */
  @IsOptional()
  @Matches(UUID_PATTERN, { message: 'must be a UUID' })
  organizationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  skills?: string;

  @IsBoolean()
  complianceRead!: boolean;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsIn(['Female', 'Male', 'Non-binary', 'Prefer not to say']) gender?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) skills?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailOptIn?: boolean;
}

export class SignConsentDto {
  @IsBoolean() pocsoAgreed!: boolean;
  @IsBoolean() poshAgreed!: boolean;
  @IsBoolean() ndaAgreed!: boolean;

  @IsString()
  @MaxLength(200)
  signedName!: string;

  @IsDateString()
  consentDate!: string;
}

export class AdminUpdateVolunteerDto {
  @IsOptional() @IsIn(['Onboarding', 'In Training', 'Active', 'Inactive']) phase?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
