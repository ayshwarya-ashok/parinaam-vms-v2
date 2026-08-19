import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/**
 * Typed accessor over the validated environment. Injecting this instead of
 * ConfigService keeps `process.env` string-typing out of the rest of the app.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true }) as Env[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
}
