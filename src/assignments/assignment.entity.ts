import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Workstation } from '../workstations/workstation.entity';

/**
 * Constraint and index names match migration CreateAssignments exactly, so
 * `npm run migration:check` sees no drift.
 */
@Entity({ name: 'assignments' })
@Index('uq_assignments_active_job', ['jobId'], { unique: true, where: '"completed_at" IS NULL' })
@Index('ix_assignments_active_workstation', ['workstationId'], { where: '"completed_at" IS NULL' })
@Check('ck_assignments_completion', '("completed_at" IS NULL) = ("completed_by" IS NULL)')
export class Assignment {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ name: 'job_id', type: 'integer' })
  jobId!: number;

  @Column({ name: 'workstation_id', type: 'integer' })
  workstationId!: number;

  @Column({ name: 'assigned_by', type: 'integer' })
  assignedBy!: number;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'now()' })
  assignedAt!: Date;

  /** NULL while the assignment is active */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'completed_by', type: 'integer', nullable: true })
  completedBy!: number | null;

  // Relations exist so TypeORM knows about the foreign keys (no drift) and
  // so queries can join. The plain *Id columns above are what the code uses.
  @ManyToOne(() => Job, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'job_id', foreignKeyConstraintName: 'fk_assignments_job' })
  job?: Job;

  @ManyToOne(() => Workstation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workstation_id', foreignKeyConstraintName: 'fk_assignments_workstation' })
  workstation?: Workstation;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assigned_by', foreignKeyConstraintName: 'fk_assignments_assigned_by' })
  assignedByUser?: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'completed_by', foreignKeyConstraintName: 'fk_assignments_completed_by' })
  completedByUser?: User;
}
