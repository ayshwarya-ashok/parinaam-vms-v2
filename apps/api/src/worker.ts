import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import 'reflect-metadata';
import { AppModule } from './app.module';

/**
 * The background worker: outbox dispatch to n8n, and — from later phases — PDF
 * rendering and report generation.
 *
 * Same application context as the API with HTTP disabled, so business logic is
 * never duplicated between the two processes.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const log = app.get(Logger);
  log.log('Worker started — consuming the email queue and running scheduled sweeps');
}

bootstrap().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
