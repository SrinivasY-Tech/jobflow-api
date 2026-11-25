import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobStatus } from './job-status.enum';

/**
 * The two list indexes use DESC ordering, which TypeORM's @Index can't
 * describe. `synchronize: false` tells the schema diff to leave them alone:
 * the migrations own them. See docs/postgres-notes.md.
 */
@Entity({ name: 'jobs' })
@Index('ix_jobs_status_priority_created_id', { synchronize: false })
@Index('ix_jobs_open_queue', { synchronize: false })
@Check('ck_jobs_status', `"status" IN ('NEW', 'ASSIGNED', 'DONE')`)
@Check('ck_jobs_priority_range', '"priority" BETWEEN 1 AND 5')
export class Job {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'ALWAYS' })
  id!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 16, default: JobStatus.NEW })
  status!: JobStatus;

  /** 1 (lowest) to 5 (most urgent) */
  @Column({ type: 'smallint', default: 3 })
  priority!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
