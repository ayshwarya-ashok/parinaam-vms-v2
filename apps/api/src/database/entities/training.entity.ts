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
import { Volunteer } from './people.entity';

export type TrainingMode = 'Online' | 'In person';
export type TrainingCategory = 'compliance' | 'activity';
export type TrainingStatus = 'active' | 'inactive';
export type MaterialFileType = 'pdf' | 'ppt' | 'doc' | 'vid';

/**
 * `category` describes subject matter; `is_mandatory` describes gating.
 * They are independent — a training can be categorised compliance without
 * being one of the three mandatory ones.
 */
@Entity('trainings')
export class Training {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20 })
  duration!: string;

  @Column({ type: 'enum', enumName: 'training_mode', enum: ['Online', 'In person'] })
  mode!: TrainingMode;

  @Column({ type: 'enum', enumName: 'training_category', enum: ['compliance', 'activity'] })
  category!: TrainingCategory;

  @Column({ type: 'enum', enumName: 'training_status', enum: ['active', 'inactive'], default: 'active' })
  status!: TrainingStatus;

  @Column({ name: 'passing_score', type: 'int', default: 70 })
  passingScore!: number;

  @Column({ name: 'is_mandatory', type: 'boolean', default: false })
  isMandatory!: boolean;

  @Column({ name: 'max_attempts', type: 'smallint', nullable: true })
  maxAttempts!: number | null;

  @Column({ name: 'expiry_months', type: 'int', nullable: true })
  expiryMonths!: number | null;

  /** Bumped when materials change; attempts record the version they were taken against. */
  @Column({ name: 'content_version', type: 'int', default: 1 })
  contentVersion!: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TrainingMaterial, (m) => m.training)
  materials?: TrainingMaterial[];

  @OneToMany(() => TrainingQuestion, (q) => q.training)
  questions?: TrainingQuestion[];
}

@Entity('training_materials')
export class TrainingMaterial {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'training_id', type: 'uuid' })
  trainingId!: string;

  @ManyToOne(() => Training, (t) => t.materials, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_id' })
  training!: Training;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'file_type', type: 'enum', enumName: 'material_file_type', enum: ['pdf', 'ppt', 'doc', 'vid'] })
  fileType!: MaterialFileType;

  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes!: string | null;

  /** Display string only ("3.2 MB"). Never compute with this. */
  @Column({ name: 'file_size_text', type: 'varchar', length: 30, nullable: true })
  fileSizeText!: string | null;

  @Column({ type: 'int', nullable: true })
  pages!: number | null;

  @Column({ type: 'int', nullable: true })
  slides!: number | null;

  @Column({ name: 'duration_text', type: 'varchar', length: 20, nullable: true })
  durationText!: string | null;

  @Column({ name: 'content_hash', type: 'char', length: 64, nullable: true })
  contentHash!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy!: string | null;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt!: Date;
}

@Entity('training_questions')
export class TrainingQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'training_id', type: 'uuid' })
  trainingId!: string;

  @ManyToOne(() => Training, (t) => t.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_id' })
  training!: Training;

  @Column({ name: 'question_text', type: 'text' })
  questionText!: string;

  /** Never serialised to a volunteer before submission. Scoring is server-side. */
  @Column({ name: 'correct_option_index', type: 'smallint' })
  correctOptionIndex!: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => TrainingOption, (o) => o.question)
  options?: TrainingOption[];
}

@Entity('training_options')
export class TrainingOption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => TrainingQuestion, (q) => q.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: TrainingQuestion;

  @Column({ name: 'option_index', type: 'smallint' })
  optionIndex!: number;

  @Column({ name: 'option_text', type: 'text' })
  optionText!: string;
}

/** Programme-level training links: initiative-wide context. */
@Entity('program_trainings')
export class ProgramTraining {
  @Column({ name: 'program_id', type: 'uuid', primary: true })
  programId!: string;

  @Column({ name: 'training_id', type: 'uuid', primary: true })
  trainingId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Activity-level training links: the role/skill gate. */
@Entity('activity_trainings')
export class ActivityTraining {
  @Column({ name: 'activity_id', type: 'uuid', primary: true })
  activityId!: string;

  @Column({ name: 'training_id', type: 'uuid', primary: true })
  trainingId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Append-only. One row per quiz sitting. */
@Entity('training_attempts')
export class TrainingAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @ManyToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ name: 'training_id', type: 'uuid' })
  trainingId!: string;

  @ManyToOne(() => Training, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_id' })
  training!: Training;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber!: number;

  @Column({ name: 'score_percent', type: 'numeric', precision: 5, scale: 2 })
  scorePercent!: string;

  @Column({ name: 'correct_count', type: 'smallint', default: 0 })
  correctCount!: number;

  @Column({ name: 'question_count', type: 'smallint', default: 0 })
  questionCount!: number;

  @Column({ type: 'boolean' })
  passed!: boolean;

  @Column({ name: 'content_version', type: 'int', default: 1 })
  contentVersion!: number;

  @CreateDateColumn({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt!: Date;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: string | null;

  /** TRUE after an admin reset. Retained for audit, ignored by gating rules. */
  @Column({ name: 'is_superseded', type: 'boolean', default: false })
  isSuperseded!: boolean;
}

@Entity('training_attempt_answers')
export class TrainingAttemptAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  @ManyToOne(() => TrainingAttempt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id' })
  attempt!: TrainingAttempt;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @Column({ name: 'selected_index', type: 'smallint' })
  selectedIndex!: number;

  @Column({ name: 'is_correct', type: 'boolean' })
  isCorrect!: boolean;
}

@Entity('training_attempt_resets')
export class TrainingAttemptReset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @Column({ name: 'training_id', type: 'uuid' })
  trainingId!: string;

  @Column({ name: 'attempts_cleared', type: 'smallint', default: 0 })
  attemptsCleared!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'triggered_by_content_change', type: 'boolean', default: false })
  triggeredByContentChange!: boolean;

  @Column({ name: 'reset_by', type: 'uuid', nullable: true })
  resetBy!: string | null;

  @CreateDateColumn({ name: 'reset_at', type: 'timestamptz' })
  resetAt!: Date;
}
