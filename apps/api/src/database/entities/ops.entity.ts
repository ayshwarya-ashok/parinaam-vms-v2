import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailRecipientType = 'volunteer' | 'coordinator' | 'admin' | 'bulk';

/**
 * queued      — row written in the same transaction as the business event
 * dispatched  — handed to n8n, awaiting its callback
 * sent/failed — terminal, reported back by n8n
 */
export type EmailStatus = 'queued' | 'dispatched' | 'sent' | 'failed' | 'bounced';

export type ReportFormat = 'PDF' | 'Excel' | 'CSV';
export type ReportFrequency = 'Daily' | 'Weekly' | 'Monthly';
export type ReportRunStatus = 'pending' | 'running' | 'success' | 'failed';

/**
 * The transactional outbox. A row exists BEFORE the message is handed to n8n,
 * so an n8n outage delays delivery but never loses it.
 */
@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'program_id', type: 'uuid', nullable: true })
  programId!: string | null;

  @Column({ name: 'activity_id', type: 'uuid', nullable: true })
  activityId!: string | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ name: 'volunteer_id', type: 'uuid', nullable: true })
  volunteerId!: string | null;

  @Column({ name: 'coordinator_id', type: 'uuid', nullable: true })
  coordinatorId!: string | null;

  @Column({ name: 'recipient_type', type: 'enum', enumName: 'email_recipient_type', enum: ['volunteer', 'coordinator', 'admin', 'bulk'] })
  recipientType!: EmailRecipientType;

  @Column({ name: 'recipient_email', type: 'citext' })
  recipientEmail!: string;

  /** Stable template identifier, e.g. attendance_volunteer, event_cancelled. */
  @Index()
  @Column({ name: 'template_key', type: 'varchar', length: 80 })
  templateKey!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject!: string | null;

  @Column({ name: 'body_snapshot', type: 'text', nullable: true })
  bodySnapshot!: string | null;

  @Index()
  @Column({ type: 'enum', enumName: 'email_status', enum: ['queued', 'dispatched', 'sent', 'failed', 'bounced'], default: 'queued' })
  status!: EmailStatus;

  @Column({ name: 'n8n_workflow', type: 'varchar', length: 120, nullable: true })
  n8nWorkflow!: string | null;

  /** Traces a message straight into the n8n execution log. */
  @Column({ name: 'n8n_execution_id', type: 'varchar', length: 120, nullable: true })
  n8nExecutionId!: string | null;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'attempt_count', type: 'smallint', default: 0 })
  attemptCount!: number;

  @CreateDateColumn({ name: 'queued_at', type: 'timestamptz' })
  queuedAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}

/**
 * Schedules are stored as frequency + send time + timezone rather than a cron
 * expression, so the next run is computable, displayable and correct across IST.
 */
@Entity('scheduled_reports')
export class ScheduledReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'report_type', type: 'varchar', length: 100 })
  reportType!: string;

  @Column({ type: 'enum', enumName: 'report_format', enum: ['PDF', 'Excel', 'CSV'] })
  format!: ReportFormat;

  @Column({ type: 'enum', enumName: 'report_frequency', enum: ['Daily', 'Weekly', 'Monthly'] })
  frequency!: ReportFrequency;

  @Column({ name: 'send_time', type: 'time' })
  sendTime!: string;

  @Column({ type: 'varchar', length: 64, default: 'Asia/Kolkata' })
  timezone!: string;

  @Column({ type: 'text' })
  recipients!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filters!: Record<string, unknown>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;

  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true })
  nextRunAt!: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity('report_runs')
export class ReportRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'scheduled_report_id', type: 'uuid', nullable: true })
  scheduledReportId!: string | null;

  @Column({ name: 'report_type', type: 'varchar', length: 100 })
  reportType!: string;

  @Column({ type: 'enum', enumName: 'report_format', enum: ['PDF', 'Excel', 'CSV'] })
  format!: ReportFormat;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  filters!: Record<string, unknown>;

  @Column({ type: 'enum', enumName: 'report_run_status', enum: ['pending', 'running', 'success', 'failed'], default: 'pending' })
  status!: ReportRunStatus;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount!: number | null;

  @Column({ name: 'file_path', type: 'varchar', length: 500, nullable: true })
  filePath!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Key/JSONB configuration an admin can change without a deploy. */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
