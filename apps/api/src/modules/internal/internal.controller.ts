import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { AppConfig } from '../../config';
import { NotificationsService, TemplateService } from '../notifications';

class TestEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  templateKey?: string;
}

/**
 * Phase 0 diagnostics. These prove the email pipeline works end to end before
 * any business feature exists.
 *
 * Mounted only outside production — see AppModule.
 */
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly templates: TemplateService,
    private readonly config: AppConfig,
  ) {}

  @Get('templates')
  @ApiOperation({ summary: 'List the registered email templates' })
  listTemplates(): { templates: string[] } {
    return { templates: this.templates.availableTemplates };
  }

  @Post('test-email')
  @ApiOperation({
    summary: 'Send a test email through the real pipeline',
    description:
      'Writes an email_logs row, renders the template, and hands it to n8n. ' +
      'Watch it arrive in Mailpit at http://localhost:8026.',
  })
  async testEmail(@Body() dto: TestEmailDto): Promise<{
    emailLogId: string;
    templateKey: string;
    to: string;
    inspect: string;
  }> {
    const templateKey = dto.templateKey ?? 'smoke_test';

    const emailLogId = await this.notifications.queueEmail({
      templateKey,
      to: dto.to,
      recipientType: 'admin',
      context: { firstName: 'there', emailLogId: 'pending' },
    });

    return {
      emailLogId,
      templateKey,
      to: dto.to,
      inspect: 'http://localhost:8026',
    };
  }

  @Get('email-stats')
  @ApiOperation({ summary: 'Outbox status counts — queued / dispatched / sent / failed' })
  async emailStats(): Promise<{ stats: Record<string, number>; notificationsEnabled: boolean }> {
    return {
      stats: await this.notifications.stats(),
      notificationsEnabled: this.config.get('NOTIFICATIONS_ENABLED'),
    };
  }
}
