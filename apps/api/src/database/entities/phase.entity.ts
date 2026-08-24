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

export type PhaseStatus = 'upcoming' | 'inprogress' | 'completed';
export type PhaseResponsibility = 'parinaam' | 'partner' | 'collab';

/**
 * One phase of a session. Zero phases on a session = classic single-day
 * lifecycle (manual "Mark completed"). With phases, the session's status is
 * derived: all phases completed -> completed; any started -> inprogress.
 * fn_recompute_event_phase_status is the only writer of that derivation.
 */
@Entity('event_phases')
export class EventPhase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'event_id' })
  eventId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: EventOccurrence;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enumName: 'phase_responsibility',
    enum: ['parinaam', 'partner', 'collab'],
    default: 'parinaam',
  })
  responsibility!: PhaseResponsibility;

  /** Single-day phase: endDate === startDate. */
  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  /** The ONLY volunteer who may mark the partner side (named lead). */
  @Column({ type: 'uuid', name: 'partner_lead_volunteer_id', nullable: true })
  partnerLeadVolunteerId!: string | null;

  @ManyToOne(() => Volunteer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'partner_lead_volunteer_id' })
  partnerLead?: Volunteer | null;

  @Column({
    type: 'enum',
    enumName: 'phase_status',
    enum: ['upcoming', 'inprogress', 'completed'],
    default: 'upcoming',
  })
  status!: PhaseStatus;

  @Column({ type: 'timestamptz', name: 'parinaam_marked_at', nullable: true })
  parinaamMarkedAt!: Date | null;

  @Column({ type: 'uuid', name: 'parinaam_marked_by', nullable: true })
  parinaamMarkedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'partner_marked_at', nullable: true })
  partnerMarkedAt!: Date | null;

  @Column({ type: 'uuid', name: 'partner_marked_by', nullable: true })
  partnerMarkedBy!: string | null;

  @Column({ type: 'timestamptz', name: 'overridden_at', nullable: true })
  overriddenAt!: Date | null;

  @Column({ type: 'uuid', name: 'overridden_by', nullable: true })
  overriddenBy!: string | null;

  @Column({ type: 'text', name: 'override_reason', nullable: true })
  overrideReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
