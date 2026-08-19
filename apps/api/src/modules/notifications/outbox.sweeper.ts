import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service';

/**
 * The safety net behind the n8n handoff.
 *
 * If n8n is unreachable when a message is queued, the row simply stays at
 * `queued` and nothing is lost. This sweep re-enqueues anything that has been
 * sitting too long — including rows n8n accepted but never called back about.
 *
 * Without it, an n8n outage during an event cancellation would silently drop
 * notifications to every registrant, which is the failure mode that matters most.
 */
@Injectable()
export class OutboxSweeper {
  private readonly logger = new Logger(OutboxSweeper.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'outbox-sweep' })
  async sweep(): Promise<void> {
    const stalled = await this.notifications.findStalled(5, 100);
    if (stalled.length === 0) return;

    this.logger.warn(`Outbox sweep: re-enqueueing ${stalled.length} stalled message(s)`);
    for (const log of stalled) {
      // freshJobId: the original job may sit in BullMQ's failed set, which
      // would silently dedupe a re-add under the same id.
      await this.notifications.enqueue(log.id, { freshJobId: true });
    }
  }
}
