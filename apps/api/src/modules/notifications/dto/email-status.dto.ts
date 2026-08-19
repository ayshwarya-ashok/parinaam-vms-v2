import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** The signed callback n8n posts once it has attempted delivery. */
export class EmailStatusCallbackDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  emailLogId!: string;

  @ApiProperty({ enum: ['sent', 'failed', 'bounced'] })
  @IsIn(['sent', 'failed', 'bounced'])
  status!: 'sent' | 'failed' | 'bounced';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  n8nExecutionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sentAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failedAt?: string;
}
