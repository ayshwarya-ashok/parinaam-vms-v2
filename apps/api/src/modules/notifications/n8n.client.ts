import { HttpException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../../config';

export interface N8nEmailPayload {
  emailLogId: string;
  templateKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName: string;
  fromEmail: string;
  /** Attachments travel as a short-lived signed URL, never as base64. */
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  callbackUrl: string;
}

export interface N8nDispatchResult {
  accepted: boolean;
  executionId: string | null;
}

/**
 * The API's side of the n8n contract.
 *
 * Both directions are authenticated with HMAC-SHA256 over the exact JSON body.
 * The inbound callback is the one that matters: without verification, anyone
 * who could reach the API could mark mail as delivered and suppress a retry.
 */
@Injectable()
export class N8nClient {
  private readonly logger = new Logger(N8nClient.name);

  constructor(private readonly config: AppConfig) {}

  sign(body: unknown): string {
    return createHmac('sha256', this.config.get('VMS_WEBHOOK_SECRET'))
      .update(JSON.stringify(body))
      .digest('hex');
  }

  /** Constant-time comparison — a fast string compare leaks the secret byte by byte. */
  verify(body: unknown, signature: string | undefined): boolean {
    if (!signature) return false;

    const expected = this.sign(body);
    const provided = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (provided.length !== expectedBuf.length) return false;
    return timingSafeEqual(provided, expectedBuf);
  }

  async dispatch(payload: N8nEmailPayload): Promise<N8nDispatchResult> {
    const url = this.config.get('N8N_WEBHOOK_URL');
    const signature = this.sign(payload);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-VMS-Signature': signature,
        },
        timeout: 15_000,
        validateStatus: (s) => s < 500,
      });

      if (response.status >= 400) {
        throw new HttpException(
          `n8n rejected the message (HTTP ${response.status}): ${JSON.stringify(response.data)}`,
          response.status,
        );
      }

      return {
        accepted: true,
        executionId: response.data?.executionId ?? null,
      };
    } catch (err) {
      const axiosErr = err as AxiosError;
      // ECONNREFUSED means n8n is down. The outbox row stays `queued` and the
      // sweeper retries — nothing is lost, only delayed.
      const reason = axiosErr.code ?? axiosErr.message ?? 'unknown error';
      this.logger.error(`Dispatch to n8n failed (${reason}) for ${payload.emailLogId}`);
      throw err;
    }
  }
}
