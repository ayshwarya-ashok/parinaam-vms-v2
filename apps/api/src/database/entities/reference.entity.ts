import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Admin-editable option lists (languages, areas of interest, availability).
 * Volunteers store the CODE; the label is presentation and may be reworded
 * without rewriting anybody's registration.
 */
@Entity('reference_values')
@Index(['category', 'code'], { unique: true })
export class ReferenceValue {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  category!: string;

  @Column({ type: 'varchar', length: 40 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  label!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
