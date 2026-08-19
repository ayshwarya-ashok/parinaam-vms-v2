import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { BusinessErrors } from '../../common';
import { Public } from '../../common/decorators/auth.decorators';
import { EmailStatusCallbackDto } from './dto/email-status.dto';
import { N8nClient } from './n8n.client';
import { NotificationsService } from './notifications.service';

/**
 * n8n reports back here once it has attempted delivery.
 *
 * This endpoint is unauthenticated in the session sense — n8n has no JWT — so
 * the HMAC signature is the only thing standing between it and an attacker
 * marking every queued message as delivered.
 */
@Public() // n8n has no JWT — the HMAC signature is the authentication
@ApiTags('webhooks')
@Controller('webhooks/n8n')
export class N8nWebhooksController {
  private readonly logger = new Logger(N8nWebhooksController.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly n8n: N8nClient,
  ) {}

  @Post('email-status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delivery outcome callback from the n8n email workflow',
    description:
      'Requires a valid X-VMS-Signature: HMAC-SHA256 of the raw JSON body, keyed with VMS_WEBHOOK_SECRET.',
  })
  async emailStatus(
    @Body() dto: EmailStatusCallbackDto,
    @Headers('x-vms-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<void> {
    if (!this.isSignatureValid(dto, signature, req)) {
      this.logger.warn(`Rejected unsigned/mis-signed callback for ${dto?.emailLogId}`);
      throw BusinessErrors.invalidSignature();
    }

    if (dto.status === 'sent') {
      await this.notifications.markSent(
        dto.emailLogId,
        dto.providerMessageId ?? null,
        dto.n8nExecutionId ?? null,
      );
      this.logger.log(`Delivered: ${dto.emailLogId}`);
      return;
    }

    await this.notifications.markFailed(
      dto.emailLogId,
      dto.errorMessage ?? `n8n reported ${dto.status}`,
      dto.n8nExecutionId ?? null,
    );
    this.logger.error(`Delivery ${dto.status}: ${dto.emailLogId} — ${dto.errorMessage}`);
  }

  /**
   * Prefer the raw body: n8n signs the exact bytes it sent, and re-serialising
   * a parsed object can reorder keys. Fall back to the parsed DTO for clients
   * that do not preserve the raw buffer.
   */
  private isSignatureValid(
    dto: EmailStatusCallbackDto,
    signature: string | undefined,
    req: RawBodyRequest<Request>,
  ): boolean {
    if (!signature) return false;

    if (req.rawBody) {
      try {
        const parsed = JSON.parse(req.rawBody.toString('utf8'));
        if (this.n8n.verify(parsed, signature)) return true;
      } catch {
        // fall through to the DTO comparison
      }
    }

    return this.n8n.verify(dto, signature);
  }
}
