import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Coordinator } from './people.entity';

export type ProgramStatus = 'draft' | 'active' | 'discontinued';
export type ActivityStatus = 'active' | 'discontinued';
export type ActivityType = 'In person' | 'Online';
export type EventStatus = 'draft' | 'upcoming' | 'inprogress' | 'completed' | 'cancelled';

/**
 * A long-running initiative. Has no dates.
 * Discontinuing a programme blocks new enrollment on every occurrence beneath
 * it (BR-17) without deleting history.
 */
@Entity('programs')
export class Program {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enumName: 'program_status', enum: ['draft', 'active', 'discontinued'], default: 'draft' })
  status!: ProgramStatus;

  @Column({ name: 'default_coordinator_id', type: 'uuid', nullable: true })
  defaultCoordinatorId!: string | null;

  @ManyToOne(() => Coordinator, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'default_coordinator_id' })
  defaultCoordinator!: Coordinator | null;

  @Column({ name: 'discontinued_at', type: 'timestamptz', nullable: true })
  discontinuedAt!: Date | null;

  @Column({ name: 'discontinued_by', type: 'uuid', nullable: true })
  discontinuedBy!: string | null;

  @Column({ name: 'discontinue_reason', type: 'text', nullable: true })
  discontinueReason!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Activity, (a) => a.program)
  activities?: Activity[];
}

/**
 * A repeatable unit of work inside a programme. Has no dates of its own;
 * each scheduled occurrence is a row in `events`.
 */
@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;

  @Column({ name: 'program_id', type: 'uuid' })
  programId!: string;

  @ManyToOne(() => Program, (p) => p.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'program_id' })
  program!: Program;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enumName: 'activity_type', enum: ['In person', 'Online'], default: 'In person' })
  type!: ActivityType;

  @Column({ type: 'text', nullable: true })
  outcome!: string | null;

  @Column({ name: 'skill_required', type: 'varchar', length: 255, nullable: true })
  skillRequired!: string | null;

  /** Seed value copied into a new occurrence; the occurrence value is authoritative. */
  @Column({ name: 'default_duration_hours', type: 'numeric', precision: 4, scale: 2, nullable: true })
  defaultDurationHours!: string | null;

  @Column({ name: 'default_max_slots', type: 'int', nullable: true })
  defaultMaxSlots!: number | null;

  @Column({ name: 'default_location', type: 'varchar', length: 255, nullable: true })
  defaultLocation!: string | null;

  @Column({ type: 'enum', enumName: 'activity_status', enum: ['active', 'discontinued'], default: 'active' })
  status!: ActivityStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'discontinued_at', type: 'timestamptz', nullable: true })
  discontinuedAt!: Date | null;

  @Column({ name: 'discontinued_by', type: 'uuid', nullable: true })
  discontinuedBy!: string | null;

  @Column({ name: 'discontinue_reason', type: 'text', nullable: true })
  discontinueReason!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => EventOccurrence, (e) => e.activity)
  events?: EventOccurrence[];
}

/**
 * A single dated, timed occurrence of an activity — the enrollable unit.
 *
 * Named `EventOccurrence` in TypeScript to avoid colliding with the DOM `Event`
 * type. It maps to the `events` table.
 */
@Entity('events')
export class EventOccurrence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;

  @Column({ name: 'activity_id', type: 'uuid' })
  activityId!: string;

  @ManyToOne(() => Activity, (a) => a.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'activity_id' })
  activity!: Activity;

  /** NULL means display the activity name. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'date' })
  date!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'duration_hours', type: 'numeric', precision: 4, scale: 2 })
  durationHours!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'max_slots', type: 'int', default: 10 })
  maxSlots!: number;

  @Column({ name: 'coordinator_id', type: 'uuid' })
  coordinatorId!: string;

  @ManyToOne(() => Coordinator, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coordinator_id' })
  coordinator!: Coordinator;

  @Column({ type: 'enum', enumName: 'event_status', enum: ['draft', 'upcoming', 'inprogress', 'completed', 'cancelled'], default: 'draft' })
  status!: EventStatus;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason!: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Generated [start, end) range backing BR-11 conflict detection. Read-only. */
  @Column({ name: 'time_range', type: 'tsrange', insert: false, update: false, select: false })
  timeRange?: string;

  get displayName(): string {
    return this.name ?? this.activity?.name ?? 'Untitled session';
  }
}

/**
 * A broadcast. `event_id` NULL means it covers the whole programme; set means it
 * announces one specific occurrence.
 */
@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId!: string;

  @ManyToOne(() => Program, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'program_id' })
  program!: Program;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ name: 'body_snapshot', type: 'text' })
  bodySnapshot!: string;

  @Column({ name: 'recipient_count', type: 'int', default: 0 })
  recipientCount!: number;

  @Column({ name: 'is_resend', type: 'boolean', default: false })
  isResend!: boolean;

  @Column({ name: 'sent_by', type: 'uuid', nullable: true })
  sentBy!: string | null;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
