import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Maps the table created by migration CreateWorkstations. The migration is the
 * source of truth; constraint names here must match it exactly, otherwise
 * `npm run migration:check` reports drift.
 */
@Entity({ name: 'workstations' })
@Unique('uq_workstations_name', ['name'])
@Check('ck_workstations_capacity_positive', '"capacity" > 0')
export class Workstation {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  /** Unique display name, e.g. "Cutting-01" */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Maximum number of jobs that can be actively assigned at the same time */
  @Column({ type: 'integer' })
  capacity!: number;

  /** Inactive workstations keep their history but accept no new assignments */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
