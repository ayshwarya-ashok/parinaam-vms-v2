import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';

/**
 * Ten digits, optionally written the way people actually type them: a +91 or
 * 0 prefix, and spaces, dashes or brackets anywhere. The API stores what it is
 * given; the web client normalises to bare digits before sending.
 */
export const PHONE_PATTERN = /^(?:\+?91[\s-]?|0)?[\s-]?(?:\d[\s-]?){10}$/;

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
  @Matches(PHONE_PATTERN, { message: 'Enter a 10-digit mobile number' })
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

  @IsOptional()
  @IsString()
  @MaxLength(150)
  occupation?: string;

  /** Reference-value CODES, not labels — see V011. */
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  languages?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  areasOfInterest?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  availability?: string[];

  @IsOptional() @IsString() @MaxLength(2000) availabilityNotes?: string;

  @IsBoolean()
  complianceRead!: boolean;
}

/**
 * Account + profile in a single request.
 *
 * Registration is atomic by design: an abandoned form must leave NO user row
 * behind, so credentials travel with the profile and both are written in one
 * transaction (or neither is).
 */
export class RegisterAccountDto extends RegisterVolunteerDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(200)
  password!: string;
}

export class ReviewRegistrationDto {
  /** Required when rejecting: "no" without a reason is unusable downstream. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsIn(['Female', 'Male', 'Non-binary', 'Prefer not to say']) gender?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(20)
  @Matches(PHONE_PATTERN, { message: 'Enter a 10-digit mobile number' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) skills?: string;
  @IsOptional() @IsString() @MaxLength(150) occupation?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) areasOfInterest?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) availability?: string[];
  @IsOptional() @IsString() @MaxLength(2000) availabilityNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailOptIn?: boolean;
}

/** Admin corrections to a pending registration — the profile plus category. */
export class UpdateRegistrationDto extends UpdateProfileDto {
  @IsOptional() @IsIn(['Individual', 'CSR']) category?: 'Individual' | 'CSR';
  @IsOptional() @Matches(UUID_PATTERN, { message: 'must be a UUID' }) organizationId?: string;
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
