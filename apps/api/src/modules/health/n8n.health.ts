import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import axios from 'axios';
import { AppConfig } from '../../config';

/**
 * n8n owns email delivery, so its reachability belongs in readiness.
 *
 * Deliberately reported as DEGRADED rather than failing the check: if n8n is
 * down the outbox holds messages safely, so the API is still able to serve
 * every request. Alerting watches the outbox backlog, not this flag.
 */
@Injectable()
export class N8nHealthIndicator extends HealthIndicator {
  constructor(private readonly config: AppConfig) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const webhookUrl = this.config.get('N8N_WEBHOOK_URL');
    const healthUrl = new URL('/healthz', webhookUrl).toString();

    try {
      const res = await axios.get(healthUrl, { timeout: 3000, validateStatus: () => true });
      const up = res.status < 500;
      return this.getStatus(key, true, {
        reachable: up,
        note: up ? undefined : 'n8n unreachable — mail will queue in the outbox',
      });
    } catch (err) {
      return this.getStatus(key, true, {
        reachable: false,
        note: 'n8n unreachable — mail will queue in the outbox',
        message: (err as Error).message,
      });
    }
  }
}
