import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ConfigModule } from './config';
import { AppConfig } from './config/app.config';
import { DatabaseModule } from './database';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { InternalModule } from './modules/internal/internal.module';
import { NotificationsModule } from './modules/notifications';
import { StorageModule } from './modules/storage/storage.module';

const isProduction = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
          // Nothing that could carry a credential or a personal detail reaches
          // stdout. Email bodies live in email_logs, never in the log stream.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-vms-signature"]',
              'req.body.password',
              'req.body.passwordHash',
              'req.body.html',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          autoLogging: {
            ignore: (req) => req.url === '/api/v1/health' || req.url === '/metrics',
          },
          customProps: (req) => ({ traceId: req.headers['x-trace-id'] }),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    // Baseline 100 req/min per client; auth endpoints tighten this per-route.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    StorageModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    // Diagnostics endpoints exist only outside production.
    ...(isProduction ? [] : [InternalModule]),
  ],
  providers: [
    // Order matters: authenticate, then throttle, then authorise.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
