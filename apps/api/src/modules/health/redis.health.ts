import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { AppConfig } from '../../config';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly config: AppConfig) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const client = new Redis(this.config.get('REDIS_URL'), {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return this.getStatus(key, pong === 'PONG');
    } catch (err) {
      throw new HealthCheckError(
        'Redis unreachable',
        this.getStatus(key, false, { message: (err as Error).message }),
      );
    } finally {
      client.disconnect();
    }
  }
}
