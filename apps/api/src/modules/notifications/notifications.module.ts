import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../../config';
import { EmailProcessor } from './email.processor';
import { N8nClient } from './n8n.client';
import { EMAIL_QUEUE, NotificationsService } from './notifications.service';
import { OutboxSweeper } from './outbox.sweeper';
import { TemplateService } from './template.service';
import { N8nWebhooksController } from './webhooks.controller';

// Module decorators evaluate at import time, before Nest DI exists, so the
// role gate reads the environment directly. Zod validates the same value at
// boot; an invalid ROLE still fails fast.
const role = process.env.ROLE ?? 'all';
const workerOnly = role === 'api' ? [] : [EmailProcessor, OutboxSweeper];

/**
 * Email delivery is orchestrated by n8n; the API renders and records.
 * See docs/01-design-document.md §12 and n8n/README.md.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const url = new URL(config.get('REDIS_URL'));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [N8nWebhooksController],
  providers: [NotificationsService, TemplateService, N8nClient, ...workerOnly],
  exports: [NotificationsService, TemplateService, N8nClient],
})
export class NotificationsModule {}
