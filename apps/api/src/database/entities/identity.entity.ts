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
import type { Volunteer } from './people.entity';

export type UserRole = 'admin' | 'volunteer';

/** Authentication record. Coordinators are deliberately not users. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'enum', enum: ['admin', 'volunteer'], enumName: 'user_role' })
  role!: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'failed_login_count', type: 'smallint', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne('Volunteer', (v: Volunteer) => v.user)
  volunteer?: Volunteer;
}

/** Rotating refresh sessions. Only a SHA-256 hash of the token is stored. */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 400, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;
}

export type AccessTokenPurpose =
  | 'volunteer_attendance'
  | 'coordinator_report'
  | 'feedback'
  | 'password_reset'
  | 'email_verification';

/**
 * Single-purpose signed links. This is how coordinators, who have no accounts,
 * submit event reports. Targets an Event — the dated occurrence — never an
 * activity or programme.
 */
@Entity('access_tokens')
export class AccessToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({
    type: 'enum',
    enumName: 'access_token_purpose',
    enum: [
      'volunteer_attendance',
      'coordinator_report',
      'feedback',
      'password_reset',
      'email_verification',
    ],
  })
  purpose!: AccessTokenPurpose;

  @Column({ name: 'subject_email', type: 'citext', nullable: true })
  subjectEmail!: string | null;

  @Column({ name: 'volunteer_id', type: 'uuid', nullable: true })
  volunteerId!: string | null;

  @Column({ name: 'coordinator_id', type: 'uuid', nullable: true })
  coordinatorId!: string | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}

/** Actor / action / entity trail for compliance-relevant changes. */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ name: 'actor_email', type: 'citext', nullable: true })
  actorEmail!: string | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ type: 'varchar', length: 60 })
  entity!: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId!: string | null;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData!: Record<string, unknown> | null;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
