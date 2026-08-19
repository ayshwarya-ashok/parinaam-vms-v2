import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { EntityManager, In, LessThan, Repository } from 'typeorm';
import { EmailLog, EmailRecipientType } from '../../database/entities';
import { TemplateService } from './template.service';

export const EMAIL_QUEUE = 'email';

export interface QueueEmailParams {
  templateKey: string;
  to: string;
  recipientType: EmailRecipientType;
  context: Record<string, unknown>;
  programId?: string | null;
  activityId?: string | null;
  eventId?: string | null;
  volunteerId?: string | null;
  coordinatorId?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

/**
 * The outbox writer.
 *
 * `queue()` accepts an optional EntityManager so the email row is written in
 * the SAME transaction as the business event that caused it. That is the whole
 * point: if the enrollment rolls back, the confirmation email never existed; if
 * the cancellation commits, every notification is durably recorded before we
 * try to send anything.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(EmailLog) private readonly emailLogs: Repository<EmailLog>,
    @InjectQueue(EMAIL_QUEUE) private readonly queue: Queue,
    private readonly templates: TemplateService,
  ) {}

  /**
   * Record the intent and schedule the handoff.
   * Returns the email log id so callers can correlate.
   */
  async queueEmail(params: QueueEmailParams, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(EmailLog) : this.emailLogs;

    // Render now so a broken template fails loudly at the point of the business
    // action, not silently inside a worker ten seconds later.
    const rendered = this.templates.render(params.templateKey, {
      ...params.context,
      to: params.to,
    });

    const log = repo.create({
      templateKey: params.templateKey,
      recipientEmail: params.to,
      recipientType: params.recipientType,
      subject: rendered.subject,
      bodySnapshot: rendered.html,
      status: 'queued',
      programId: params.programId ?? null,
      activityId: params.activityId ?? null,
      eventId: params.eventId ?? null,
      volunteerId: params.volunteerId ?? null,
      coordinatorId: params.coordinatorId ?? null,
      attachmentUrl: params.attachmentUrl ?? null,
      attachmentName: params.attachmentName ?? null,
    });

    const saved = await repo.save(log);

    // Enqueue after the row exists. If this throws, the sweeper picks it up.
    // Attachment info lives on the row itself, so sweep retries keep it.
    await this.enqueue(saved.id);

    return saved.id;
  }

  async enqueue(
    emailLogId: string,
    extra: {
      /**
       * Sweep retries need a fresh job id: BullMQ silently dedupes an add
       * against a completed or failed job with the same id (failed jobs are
       * kept 24h), so re-enqueueing a stalled row under the original id is a
       * no-op exactly when it matters most.
       */
      freshJobId?: boolean;
    } = {},
  ): Promise<void> {
    const { freshJobId, ...data } = extra;
    await this.queue.add(
      'send',
      { emailLogId, ...data },
      {
        // BullMQ rejects ':' in a custom job id — it delimits its own Redis keys.
        jobId: freshJobId ? `email-${emailLogId}-r${Date.now()}` : `email-${emailLogId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
    );
  }

  /** Preview endpoints render through the same path the send uses. */
  preview(templateKey: string, context: Record<string, unknown>) {
    return this.templates.render(templateKey, context);
  }

  async findById(id: string): Promise<EmailLog | null> {
    return this.emailLogs.findOne({ where: { id } });
  }

  /**
   * Status only ever moves forward.
   *
   * n8n can call back with the delivery outcome BEFORE the dispatching HTTP
   * request returns, so without the `queued` guard this would overwrite a
   * terminal `sent` with `dispatched` and the message would look undelivered
   * forever.
   */
  async markDispatched(id: string, executionId: string | null, workflow: string): Promise<void> {
    await this.emailLogs.update(
      { id, status: 'queued' },
      {
        status: 'dispatched',
        dispatchedAt: new Date(),
        n8nExecutionId: executionId,
        n8nWorkflow: workflow,
      },
    );
  }

  async markSent(id: string, providerMessageId: string | null, executionId: string | null) {
    await this.emailLogs.update(
      { id },
      {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId,
        n8nExecutionId: executionId,
        errorMessage: null,
      },
    );
  }

  async markFailed(id: string, error: string, executionId?: string | null): Promise<void> {
    const log = await this.emailLogs.findOne({ where: { id } });
    await this.emailLogs.update(
      { id },
      {
        status: 'failed',
        errorMessage: error.slice(0, 2000),
        attemptCount: (log?.attemptCount ?? 0) + 1,
        n8nExecutionId: executionId ?? log?.n8nExecutionId ?? null,
      },
    );
  }

  /**
   * Rows that never made it to n8n, or that n8n accepted but never reported on.
   * Anything older than the grace window is fair game for a retry.
   */
  async findStalled(graceMinutes = 5, limit = 100): Promise<EmailLog[]> {
    const cutoff = new Date(Date.now() - graceMinutes * 60_000);
    return this.emailLogs.find({
      where: [
        { status: In(['queued']), queuedAt: LessThan(cutoff) },
        { status: In(['dispatched']), dispatchedAt: LessThan(cutoff) },
      ],
      order: { queuedAt: 'ASC' },
      take: limit,
    });
  }

  async stats(): Promise<Record<string, number>> {
    const rows = await this.emailLogs
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('e.status')
      .getRawMany<{ status: string; count: number }>();

    return Object.fromEntries(rows.map((r) => [r.status, r.count]));
  }
}
