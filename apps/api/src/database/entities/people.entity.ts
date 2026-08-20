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
import { User } from './identity.entity';

export type Gender = 'Female' | 'Male' | 'Non-binary' | 'Prefer not to say';
export type VolunteerCategory = 'Individual' | 'CSR';
export type VolunteerPhase = 'Onboarding' | 'In Training' | 'Active' | 'Inactive';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 150, nullable: true })
  contactPerson!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * Demographic and lifecycle profile, 1:1 with users.
 * `phase` is derived — owned by fn_recompute_volunteer_phase(), never set by hand.
 */
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

@Entity('volunteers')
export class Volunteer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'enum', enumName: 'gender_type', enum: ['Female', 'Male', 'Non-binary', 'Prefer not to say'], nullable: true })
  gender!: Gender | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enumName: 'volunteer_category', enum: ['Individual', 'CSR'], default: 'Individual' })
  category!: VolunteerCategory;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ type: 'enum', enumName: 'volunteer_phase', enum: ['Onboarding', 'In Training', 'Active', 'Inactive'], default: 'Onboarding' })
  phase!: VolunteerPhase;

  @Column({ type: 'varchar', length: 255, nullable: true })
  skills!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  occupation!: string | null;

  /** Comma-joined reference_values codes — see V011. */
  @Column({ type: 'text', nullable: true })
  languages!: string | null;

  @Column({ name: 'areas_of_interest', type: 'text', nullable: true })
  areasOfInterest!: string | null;

  @Column({ type: 'text', nullable: true })
  availability!: string | null;

  @Column({ name: 'availability_notes', type: 'text', nullable: true })
  availabilityNotes!: string | null;

  /**
   * A completed profile is a REQUEST to volunteer. It stays 'pending' until an
   * administrator decides; rejection also deactivates the account.
   */
  @Column({ name: 'registration_status', type: 'enum', enumName: 'registration_status', enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  registrationStatus!: RegistrationStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'compliance_read', type: 'boolean', default: false })
  complianceRead!: boolean;

  @Column({ name: 'email_opt_in', type: 'boolean', default: true })
  emailOptIn!: boolean;

  @Column({ name: 'profile_photo_path', type: 'varchar', length: 500, nullable: true })
  profilePhotoPath!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}

/** Field coordinators. Contactable and assignable, never system users. */
@Entity('coordinators')
export class Coordinator {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobile!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** The POCSO / POSH / NDA declaration. BR-02. */
@Entity('volunteer_consents')
export class VolunteerConsent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'volunteer_id', type: 'uuid' })
  volunteerId!: string;

  @OneToOne(() => Volunteer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'volunteer_id' })
  volunteer!: Volunteer;

  @Column({ name: 'pocso_agreed', type: 'boolean', default: false })
  pocsoAgreed!: boolean;

  @Column({ name: 'posh_agreed', type: 'boolean', default: false })
  poshAgreed!: boolean;

  @Column({ name: 'nda_agreed', type: 'boolean', default: false })
  ndaAgreed!: boolean;

  @Column({ name: 'signed_name', type: 'varchar', length: 200 })
  signedName!: string;

  @Column({ name: 'consent_version', type: 'varchar', length: 20, default: '1.0' })
  consentVersion!: string;

  @Column({ name: 'consent_date', type: 'date' })
  consentDate!: string;

  @CreateDateColumn({ name: 'signed_at', type: 'timestamptz' })
  signedAt!: Date;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 400, nullable: true })
  userAgent!: string | null;
}
