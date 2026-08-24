import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventOccurrence } from './program.entity';

export type CommunityStatus = 'active' | 'archived';

/**
 * A beneficiary community Parinaam serves. Admin-managed master data; every
 * published session must link to at least one (enforced in the service —
 * a cross-table CHECK cannot express it). Archived, never deleted: the
 * session links are history.
 */
@Entity('beneficiary_communities')
export class BeneficiaryCommunity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'active' })
  status!: CommunityStatus;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/** Session ↔ community link. */
@Entity('event_communities')
export class EventCommunity {
  @PrimaryColumn({ type: 'uuid', name: 'event_id' })
  eventId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'community_id' })
  communityId!: string;

  @ManyToOne(() => EventOccurrence, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event?: EventOccurrence;

  @ManyToOne(() => BeneficiaryCommunity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'community_id' })
  community?: BeneficiaryCommunity;
}
