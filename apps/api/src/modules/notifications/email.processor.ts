import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AppConfig } from '../../config';
import { N8nClient } from './n8n.client';
import { EMAIL_QUEUE, NotificationsService } from './notifications.service';
import { TemplateService } from './template.service';

interface SendJob {
  emailLogId: string;
}

/**
 * Runs in the worker process. Loads the outbox row, hands it to n8n, and marks
 * it dispatched. It does NOT mark the message sent — only n8n's signed callback
 * can do that, because only n8n knows whether SMTP accepted it.
 */
@Processor(EMAIL_QUEUE, { concurrency: 5 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly templates: TemplateService,
    private readonly n8n: N8nClient,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async process(job: Job<SendJob>): Promise<void> {
    const { emailLogId } = job.data;

    const log = await this.notifications.findById(emailLogId);
    if (!log) {
      this.logger.warn(`Email log ${emailLogId} vanished; dropping job`);
      return;
    }

    if (log.status === 'sent') {
      this.logger.debug(`Email ${emailLogId} already sent; skipping`);
      return;
    }

    if (!this.config.get('NOTIFICATIONS_ENABLED')) {
      this.logger.warn(`Notifications disabled — ${emailLogId} left queued`);
      return;
    }

    // The body was rendered and snapshotted when the row was written, so what
    // we send is exactly what the admin previewed.
    const html = log.bodySnapshot ?? '';
    const subject = log.subject ?? 'Parinaam Foundation';

    try {
      const result = await this.n8n.dispatch({
        emailLogId: log.id,
        templateKey: log.templateKey,
        to: log.recipientEmail,
        subject,
        html,
        text: '',
        fromName: this.config.get('MAIL_FROM_NAME'),
        fromEmail: this.config.get('MAIL_FROM_EMAIL'),
        attachmentUrl: log.attachmentUrl ?? null,
        attachmentName: log.attachmentName ?? null,
        callbackUrl: this.config.get('N8N_CALLBACK_URL'),
      });

      await this.notifications.markDispatched(
        log.id,
        result.executionId,
        'vms-email-dispatch',
      );
      this.logger.log(`Dispatched ${log.templateKey} -> ${log.recipientEmail}`);
    } catch (err) {
      const message = (err as Error).message;
      // Leave the row `queued` on the final attempt so the sweeper owns it.
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.notifications.markFailed(log.id, message);
      }
      throw err;
    }
  }
}
