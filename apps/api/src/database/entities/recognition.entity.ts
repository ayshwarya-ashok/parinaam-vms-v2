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
import { Organization, Volunteer } from './people.entity';
import { EventOccurrence, Program } from './program.entity';

export type CertType = 'individual' | 'corporate';
export type VolAgain = 'Definitely' | 'Probably' | 'Not sure' | 'Unlikely';

/**
 * BR-18: one certificate per volunteer PER PROGRAMME. Hours are summed across
 * every occurrence attended within that programme (see v_program_participation).
 */
@Entity('certificates')
@Index(['volunteerId', 'programId'], { unique: true })
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'certificate_number', type: 'varchar', length: 30, nullable: true })
  certificateNumber!: string | null;

  /** Tangible-gift note recorded at issue time (memento, sapling, ...). */
  @Column({ name: 'memento_note', type: 'varchar', length: 255, nullable: true })
  mementoNote!: string | null;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ name: 'program_id', type: 'uuid' })
  programId!: string;

  @ManyToOne(() => Program, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'program_id' })
  program!: Program;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  hours!: string;

  /** How many occurrences the hours came from — printed, so the figure is auditable. */
  @Column({ name: 'events_attended', type: 'int', default: 0 })
  eventsAttended!: number;

  @Column({ name: 'period_start', type: 'date', nullable: true })
  periodStart!: string | null;

  @Column({ name: 'period_end', type: 'date', nullable: true })
  periodEnd!: string | null;

  @Column({ name: 'cert_type', type: 'enum', enumName: 'cert_type', enum: ['individual', 'corporate'], default: 'individual' })
  certType!: CertType;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ type: 'boolean', default: false })
  issued!: boolean;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'issued_by', type: 'uuid', nullable: true })
  issuedBy!: string | null;

  @Column({ name: 'resend_count', type: 'smallint', default: 0 })
  resendCount!: number;

  @Column({ name: 'file_path', type: 'varchar', length: 500, nullable: true })
  filePath!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** Admin-editable tag vocabulary the feedback form renders from. */
@Entity('feedback_option_catalog')
export class FeedbackOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: 'issue' | 'improvement';

  @Column({ type: 'varchar', length: 100 })
  label!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}

/**
 * BR-09: one submission per volunteer PER OCCURRENCE — so "poor time management"
 * points at one morning a coordinator can act on.
 */
@Entity('feedback_submissions')
@Index(['volunteerId', 'eventId'], { unique: true })
export class FeedbackSubmission {
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

  @Column({ name: 'overall_rating', type: 'smallint' })
  overallRating!: number;

  @Column({ name: 'nps_score', type: 'smallint' })
  npsScore!: number;

  @Column({ name: 'vol_again', type: 'enum', enumName: 'vol_again_type', enum: ['Definitely', 'Probably', 'Not sure', 'Unlikely'], nullable: true })
  volAgain!: VolAgain | null;

  @Column({ name: 'went_well', type: 'text', nullable: true })
  wentWell!: string | null;

  @Column({ name: 'went_wrong_detail', type: 'text', nullable: true })
  wentWrongDetail!: string | null;

  @Column({ name: 'improvement_detail', type: 'text', nullable: true })
  improvementDetail!: string | null;

  @Column({ type: 'text', nullable: true })
  comments!: string | null;

  /** Admin opt-in. Only published submissions may surface publicly (BR-16). */
  @Column({ name: 'is_published_testimonial', type: 'boolean', default: false })
  isPublishedTestimonial!: boolean;

  @CreateDateColumn({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @OneToMany(() => FeedbackIssue, (i) => i.feedback)
  issues?: FeedbackIssue[];

  @OneToMany(() => FeedbackImprovement, (i) => i.feedback)
  improvements?: FeedbackImprovement[];
}

@Entity('feedback_issues')
export class FeedbackIssue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'feedback_id', type: 'uuid' })
  feedbackId!: string;

  @ManyToOne(() => FeedbackSubmission, (f) => f.issues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feedback_id' })
  feedback!: FeedbackSubmission;

  @Column({ name: 'issue_label', type: 'varchar', length: 100 })
  issueLabel!: string;
}

@Entity('feedback_improvements')
export class FeedbackImprovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'feedback_id', type: 'uuid' })
  feedbackId!: string;

  @ManyToOne(() => FeedbackSubmission, (f) => f.improvements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feedback_id' })
  feedback!: FeedbackSubmission;

  @Column({ name: 'improvement_label', type: 'varchar', length: 100 })
  improvementLabel!: string;
}
