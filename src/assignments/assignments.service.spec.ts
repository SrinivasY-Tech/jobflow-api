import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Job } from '../jobs/job.entity';
import { JobStatus } from '../jobs/job-status.enum';
import { Assignment } from './assignment.entity';
import { AssignmentsService } from './assignments.service';

/**
 * Unit tests check the decision logic and the ORDER of locking calls.
 * They can't prove the locks work: that needs a real Postgres and parallel
 * requests, which is what test/concurrency.e2e-spec.ts does.
 */

type Row = Record<string, unknown> | null;

interface FakeQueryBuilder {
  setLock(mode: string): FakeQueryBuilder;
  where(): FakeQueryBuilder;
  getOne(): Promise<Row>;
}

function lockingQueryBuilder(entity: string, row: Row, calls: string[]): FakeQueryBuilder {
  const qb: FakeQueryBuilder = {
    setLock: (mode) => {
      calls.push(`lock:${entity}:${mode}`);
      return qb;
    },
    where: () => qb,
    getOne: () => Promise.resolve(row),
  };
  return qb;
}

function buildEm(opts: { job: Row; ws?: Row; activeCount?: number; activeAssignment?: Row }) {
  const calls: string[] = [];
  const em = {
    query: jest.fn((sql: string) => {
      calls.push(`query:${sql}`);
      return Promise.resolve();
    }),
    getRepository: jest.fn((target: unknown) =>
      target === Job
        ? lockingQueryBuilderRepo('job', opts.job, calls)
        : lockingQueryBuilderRepo('workstation', opts.ws ?? null, calls),
    ),
    count: jest.fn(() => {
      calls.push('count');
      return Promise.resolve(opts.activeCount ?? 0);
    }),
    create: jest.fn((_t: unknown, data: object) => ({ ...data })),
    save: jest.fn((data: object) => {
      calls.push('insert');
      return Promise.resolve({ id: 99, ...data });
    }),
    update: jest.fn((target: unknown, _where: object, set: object) => {
      calls.push(`update:${target === Job ? 'job' : 'assignment'}:${JSON.stringify(set)}`);
      return Promise.resolve();
    }),
    findOneBy: jest.fn(() => Promise.resolve(opts.activeAssignment ?? null)),
    findOneByOrFail: jest.fn(() => Promise.resolve({ id: 5, completedAt: new Date() })),
  };
  return { em: em as unknown as EntityManager, raw: em, calls };
}

function lockingQueryBuilderRepo(entity: string, row: Row, calls: string[]) {
  return { createQueryBuilder: () => lockingQueryBuilder(entity, row, calls) };
}

function serviceWith(em: EntityManager): AssignmentsService {
  const dataSource = {
    transaction: jest.fn((cb: (em: EntityManager) => unknown) => cb(em)),
  } as unknown as DataSource;
  return new AssignmentsService(dataSource);
}

const newJob = { id: 1, status: JobStatus.NEW };
const activeWs = { id: 10, capacity: 2, isActive: true };

describe('AssignmentsService.assign', () => {
  it('locks job then workstation, checks capacity, inserts, then marks the job ASSIGNED', async () => {
    const { em, calls } = buildEm({ job: newJob, ws: activeWs, activeCount: 1 });

    const result = await serviceWith(em).assign(1, 10, 7);

    expect(result).toMatchObject({ id: 99, jobId: 1, workstationId: 10, assignedBy: 7 });
    expect(calls).toEqual([
      "query:SET LOCAL lock_timeout = '5s'",
      'lock:job:pessimistic_write',
      'lock:workstation:pessimistic_write',
      'count',
      'insert',
      `update:job:${JSON.stringify({ status: JobStatus.ASSIGNED })}`,
    ]);
  });

  it('404s when the job does not exist, without touching the workstation', async () => {
    const { em, calls } = buildEm({ job: null });
    await expect(serviceWith(em).assign(1, 10, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).not.toContain('lock:workstation:pessimistic_write');
  });

  it.each([JobStatus.ASSIGNED, JobStatus.DONE])('409s when the job is %s', async (status) => {
    const { em, calls } = buildEm({ job: { id: 1, status }, ws: activeWs });
    await expect(serviceWith(em).assign(1, 10, 7)).rejects.toThrow(`already ${status}`);
    expect(calls).not.toContain('insert');
  });

  it('404s when the workstation does not exist', async () => {
    const { em } = buildEm({ job: newJob, ws: null });
    await expect(serviceWith(em).assign(1, 10, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when the workstation is inactive', async () => {
    const { em } = buildEm({ job: newJob, ws: { ...activeWs, isActive: false } });
    await expect(serviceWith(em).assign(1, 10, 7)).rejects.toThrow('not active');
  });

  it('409s when the workstation is at capacity, and inserts nothing', async () => {
    const { em, calls } = buildEm({ job: newJob, ws: activeWs, activeCount: 2 });
    const err = await serviceWith(em).assign(1, 10, 7).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe('Workstation 10 is at full capacity (2/2)');
    expect(calls).not.toContain('insert');
  });
});

describe('AssignmentsService.complete', () => {
  it('closes the active assignment and marks the job DONE', async () => {
    const { em, raw, calls } = buildEm({
      job: { id: 1, status: JobStatus.ASSIGNED },
      activeAssignment: { id: 5, jobId: 1 },
    });

    await serviceWith(em).complete(1, 3);

    expect(calls[1]).toBe('lock:job:pessimistic_write');
    expect(raw.update).toHaveBeenCalledWith(
      Assignment,
      { id: 5 },
      expect.objectContaining({ completedBy: 3 }),
    );
    expect(raw.update).toHaveBeenCalledWith(Job, { id: 1 }, { status: JobStatus.DONE });
  });

  it('409s when the job is still NEW', async () => {
    const { em } = buildEm({ job: { id: 1, status: JobStatus.NEW } });
    await expect(serviceWith(em).complete(1, 3)).rejects.toThrow('is not assigned');
  });

  it('409s when the job is already DONE', async () => {
    const { em } = buildEm({ job: { id: 1, status: JobStatus.DONE } });
    await expect(serviceWith(em).complete(1, 3)).rejects.toThrow('already DONE');
  });

  it('raises a 500-class error if status and assignment rows disagree', async () => {
    const { em } = buildEm({ job: { id: 1, status: JobStatus.ASSIGNED }, activeAssignment: null });
    const err = await serviceWith(em).complete(1, 3).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ConflictException);
    expect((err as Error).message).toMatch(/Invariant violated/);
  });
});
