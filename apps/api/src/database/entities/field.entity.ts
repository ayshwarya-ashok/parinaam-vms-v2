import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Coordinator, Volunteer } from './people.entity';
import { EventOccurrence } from './program.entity';

export type AttendanceSource = 'self' | 'coordinator' | 'admin';
export type AbsenceReason =
  | 'Personal emergency'
  | 'Medical / Health issue'
  | 'Work / prior commitment'
  | 'Transport issue'
  | 'No longer available'
  | 'Other';
export type EventReportStatus = 'completed' | 'partial' | 'postponed' | 'cancelled';
export type PhotoSource = 'admin_upload' | 'coordinator_report' | 'volunteer_attendance';

/**
 * Per-occurrence state of the two outbound emails. Answers "has this occurrence
 * been dispatched, and to whom?" in one read — email_logs alone cannot express
 * "sent to volunteers but not yet the coordinator".
 */
@Entity('attendance_dispatches')
export class AttendanceDispatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @OneToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ name: 'volunteer_email_sent', type: 'boolean', default: false })
  volunteerEmailSent!: boolean;

  @Column({ name: 'volunteer_email_sent_at', type: 'timestamptz', nullable: true })
  volunteerEmailSentAt!: Date | null;

  @Column({ name: 'volunteer_send_count', type: 'smallint', default: 0 })
  volunteerSendCount!: number;

  @Column({ name: 'coordinator_email_sent', type: 'boolean', default: false })
  coordinatorEmailSent!: boolean;

  @Column({ name: 'coordinator_email_sent_at', type: 'timestamptz', nullable: true })
  coordinatorEmailSentAt!: Date | null;

  @Column({ name: 'coordinator_send_count', type: 'smallint', default: 0 })
  coordinatorSendCount!: number;

  @Column({ name: 'last_dispatched_by', type: 'uuid', nullable: true })
  lastDispatchedBy!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** One row per volunteer per occurrence. BR-15 is enforced by check constraints. */
@Entity('attendance_records')
@Index(['eventId', 'volunteerId'], { unique: true })
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ type: 'boolean', default: false })
  attended!: boolean;

  @Column({ name: 'arrival_time', type: 'time', nullable: true })
  arrivalTime!: string | null;

  @Column({ name: 'departure_time', type: 'time', nullable: true })
  departureTime!: string | null;

  @Column({ name: 'hours_contributed', type: 'numeric', precision: 4, scale: 2, nullable: true })
  hoursContributed!: string | null;

  @Column({ name: 'absence_reason', type: 'enum', enumName: 'absence_reason', enum: ['Personal emergency', 'Medical / Health issue', 'Work / prior commitment', 'Transport issue', 'No longer available', 'Other'], nullable: true })
  absenceReason!: AbsenceReason | null;

  @Column({ name: 'absence_detail', type: 'text', nullable: true })
  absenceDetail!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'enum', enumName: 'attendance_source', enum: ['self', 'coordinator', 'admin'], default: 'self' })
  source!: AttendanceSource;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy!: string | null;

  @CreateDateColumn({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * The coordinator's occurrence report — one per occurrence.
 * The sole origin of the beneficiary count on the dashboard and public page.
 */
@Entity('event_reports')
export class EventReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @OneToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ name: 'coordinator_id', type: 'uuid', nullable: true })
  coordinatorId!: string | null;

  @ManyToOne(() => Coordinator, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'coordinator_id' })
  coordinator!: Coordinator | null;

  @Column({ type: 'enum', enumName: 'event_report_status', enum: ['completed', 'partial', 'postponed', 'cancelled'] })
  status!: EventReportStatus;

  @Column({ name: 'actual_start_time', type: 'time', nullable: true })
  actualStartTime!: string | null;

  @Column({ name: 'actual_end_time', type: 'time', nullable: true })
  actualEndTime!: string | null;

  @Column({ name: 'volunteers_present', type: 'int', default: 0 })
  volunteersPresent!: number;

  @Column({ name: 'beneficiaries_reached', type: 'int', default: 0 })
  beneficiariesReached!: number;

  @Column({ type: 'text', nullable: true })
  highlights!: string | null;

  @Column({ type: 'text', nullable: true })
  challenges!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'submitted_via_token', type: 'uuid', nullable: true })
  submittedViaToken!: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** Evidence and gallery. `is_public` gates the public page (BR-16). */
@Entity('event_photos')
export class EventPhoto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ name: 'event_report_id', type: 'uuid', nullable: true })
  eventReportId!: string | null;

  @Column({ name: 'attendance_record_id', type: 'uuid', nullable: true })
  attendanceRecordId!: string | null;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath!: string;

  @Column({ name: 'thumbnail_path', type: 'varchar', length: 500, nullable: true })
  thumbnailPath!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  caption!: string | null;

  @Column({ type: 'enum', enumName: 'photo_source', enum: ['admin_upload', 'coordinator_report', 'volunteer_attendance'], default: 'admin_upload' })
  source!: PhotoSource;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;
}
