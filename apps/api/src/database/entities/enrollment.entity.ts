import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Volunteer } from './people.entity';
import { EventOccurrence } from './program.entity';

/**
 * Deviation D-07: a row here means a HELD SEAT, nothing else.
 * Volunteers waiting for a seat live only in `waitlist_entries` and have no row
 * here until they are promoted. One fact, one place.
 */
export type EnrollmentStatus = 'enrolled' | 'cancelled';

@Entity('event_enrollments')
@Index(['volunteerId', 'eventId'], { unique: true })
export class EventEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ type: 'enum', enumName: 'enrollment_status', enum: ['enrolled', 'cancelled'], default: 'enrolled' })
  status!: EnrollmentStatus;

  /** Skills the volunteer brings to this occurrence. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  skills!: string | null;

  @Column({ name: 'promoted_from_waitlist', type: 'boolean', default: false })
  promotedFromWaitlist!: boolean;

  /** TRUE when the volunteer chose "Enroll Anyway" past a BR-11 overlap warning. */
  @Column({ name: 'conflict_acknowledged', type: 'boolean', default: false })
  conflictAcknowledged!: boolean;

  @CreateDateColumn({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * BR-10: 1-based FIFO queue for a full occurrence. Position 1 is auto-promoted
 * when a seat frees; remaining positions shift down in the same transaction.
 */
@Entity('waitlist_entries')
@Index(['volunteerId', 'eventId'], { unique: true })
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventOccurrence;

  @Column({ type: 'int' })
  position!: number;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;
}
