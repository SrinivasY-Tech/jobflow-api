import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Job } from '../jobs/job.entity';
import { JobStatus } from '../jobs/job-status.enum';
import { Workstation } from '../workstations/workstation.entity';
import { Assignment } from './assignment.entity';
import { WorkstationLoadDto } from './dto/workstation-load.dto';

/**
 * How long a request waits for a row lock before giving up. Without it, a
 * stuck transaction would make every request for that row wait forever while
 * holding a pool connection. Postgres raises 55P03, which PgErrorFilter maps to 409.
 */
const LOCK_TIMEOUT = '5s';

@Injectable()
export class AssignmentsService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Assign a NEW job to an active workstation that has free capacity.
   *
   * Everything runs in ONE transaction (READ COMMITTED, the Postgres default):
   *
   *  1. SELECT job ... FOR UPDATE
   *     Concurrent assigns of the SAME job queue up here. The second waits until
   *     the first commits, then re-reads the row, sees status = ASSIGNED -> 409.
   *     Without it: both read status NEW, both insert -> two active assignments.
   *
   *  2. SELECT workstation ... FOR UPDATE
   *     Concurrent assigns of DIFFERENT jobs to the SAME workstation queue up here,
   *     so step 3 counts with nobody else mid-insert. Without it: capacity 2,
   *     1 active, two requests both count 1, both insert -> 3 active (write skew).
   *
   *  3. COUNT active assignments < capacity
   *
   *  4. INSERT assignment + UPDATE job status
   *     The partial unique index uq_assignments_active_job is the backstop: even
   *     if some future code path skipped step 1, the database refuses a second
   *     active assignment for the job (23505 -> 409).
   *
   * Lock order is always job -> workstation (complete() only locks the job), so
   * two transactions can never wait on each other in a cycle (no deadlock).
   */
  assign(jobId: number, workstationId: number, userId: number): Promise<Assignment> {
    return this.dataSource.transaction(async (em) => {
      await em.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

      const job = await this.lockJob(em, jobId);
      if (job.status !== JobStatus.NEW) {
        throw new ConflictException(`Job ${jobId} is already ${job.status}`);
      }

      const ws = await em
        .getRepository(Workstation)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.id = :id', { id: workstationId })
        .getOne();
      if (!ws) throw new NotFoundException(`Workstation ${workstationId} not found`);
      if (!ws.isActive) throw new ConflictException(`Workstation ${workstationId} is not active`);

      const active = await em.count(Assignment, { where: { workstationId, completedAt: IsNull() } });
      if (active >= ws.capacity) {
        throw new ConflictException(
          `Workstation ${workstationId} is at full capacity (${active}/${ws.capacity})`,
        );
      }

      const assignment = await em.save(
        em.create(Assignment, { jobId, workstationId, assignedBy: userId, completedAt: null, completedBy: null }),
      );
      await em.update(Job, { id: jobId }, { status: JobStatus.ASSIGNED });
      return assignment;
    });
  }

  /**
   * Mark an ASSIGNED job DONE and close its active assignment (which frees
   * one unit of workstation capacity). Locks the job row so a concurrent
   * double "complete" gets a clean 409, not a second update.
   */
  complete(jobId: number, userId: number): Promise<Assignment> {
    return this.dataSource.transaction(async (em) => {
      await em.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

      const job = await this.lockJob(em, jobId);
      if (job.status !== JobStatus.ASSIGNED) {
        throw new ConflictException(
          job.status === JobStatus.DONE ? `Job ${jobId} is already DONE` : `Job ${jobId} is not assigned`,
        );
      }

      const assignment = await em.findOneBy(Assignment, { jobId, completedAt: IsNull() });
      if (!assignment) {
        // status says ASSIGNED but no active assignment exists: a data bug, not a client error.
        throw new Error(`Invariant violated: job ${jobId} is ASSIGNED without an active assignment`);
      }

      await em.update(
        Assignment,
        { id: assignment.id },
        { completedAt: () => 'now()', completedBy: userId },
      );
      await em.update(Job, { id: jobId }, { status: JobStatus.DONE });
      return em.findOneByOrFail(Assignment, { id: assignment.id });
    });
  }

  /**
   * Current load of a workstation. Read-only, so no locks: it reads inside one
   * REPEATABLE READ transaction so the workstation row and the assignment list
   * come from the same snapshot. Under READ COMMITTED, each statement sees its
   * own snapshot, and the count could disagree with the capacity it is shown next to.
   */
  getLoad(workstationId: number): Promise<WorkstationLoadDto> {
    return this.dataSource.transaction('REPEATABLE READ', async (em) => {
      const ws = await em.findOneBy(Workstation, { id: workstationId });
      if (!ws) throw new NotFoundException(`Workstation ${workstationId} not found`);

      const active = await em.find(Assignment, {
        where: { workstationId, completedAt: IsNull() },
        relations: { job: true },
        order: { assignedAt: 'ASC', id: 'ASC' },
      });

      return {
        workstationId: ws.id,
        name: ws.name,
        isActive: ws.isActive,
        capacity: ws.capacity,
        activeAssignments: active.length,
        available: Math.max(ws.capacity - active.length, 0),
        jobs: active.map((a) => ({
          assignmentId: a.id,
          jobId: a.jobId,
          title: a.job?.title ?? '',
          priority: a.job?.priority ?? 0,
          assignedAt: a.assignedAt,
        })),
      };
    });
  }

  /** SELECT ... FROM jobs WHERE id = $1 FOR UPDATE */
  private async lockJob(em: EntityManager, jobId: number): Promise<Job> {
    const job = await em
      .getRepository(Job)
      .createQueryBuilder('j')
      .setLock('pessimistic_write')
      .where('j.id = :id', { id: jobId })
      .getOne();
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    return job;
  }
}
