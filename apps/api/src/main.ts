import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { AllExceptionsFilter, TraceIdInterceptor } from './common';
import { AppConfig } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    // n8n signs the exact bytes it sends; we need them to verify the HMAC.
    rawBody: true,
  });

  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('api/v1');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: false as never });

  app.use(cookieParser());
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['X-Trace-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new TraceIdInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('Parinaam VMS API')
      .setDescription(
        'Volunteer Management System. Hierarchy: Program (undated) -> Activity (undated) -> Event (dated occurrence). Volunteers enroll in Events.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get('PORT');
  // No host argument: Node binds dual-stack (:: plus IPv4). Binding '0.0.0.0'
  // is IPv4-only, and any client resolving "localhost" to ::1 — browsers and
  // curl both do on Windows — gets ECONNREFUSED against a healthy container.
  await app.listen(port);

  const log = app.get(Logger);
  log.log(`API listening on http://localhost:${port}/api/v1`);
  if (!config.isProduction) {
    log.log(`Swagger at http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start API:', err);
  process.exit(1);
});
