import request, { Response } from 'supertest';
import { Role } from '../src/auth/role.enum';
import { bearer, createTestApp, TestApp } from './utils/test-app';

/**
 * Fires many requests at the same moment through real HTTP sockets against
 * a real Postgres, then checks the invariants in the database itself.
 *
 * The API's connection pool has 10 connections, so up to 10 transactions really
 * do race inside Postgres at once. The rest queue for a connection, then race too.
 */
describe('concurrency (e2e)', () => {
  let t: TestApp;
  const planner = () => bearer(t.tokens[Role.PLANNER]);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  const createWorkstation = async (name: string, capacity: number): Promise<number> =>
    (
      await request(t.url)
        .post('/workstations')
        .set(bearer(t.tokens[Role.ADMIN]))
        .send({ name, capacity })
        .expect(201)
    ).body.id;

  const createJob = async (title: string): Promise<number> =>
    (await request(t.url).post('/jobs').set(planner()).send({ title }).expect(201)).body.id;

  /**
   * Open all pool connections BEFORE the race. On a cold pool, the first
   * transaction finishes while the other requests are still opening database
   * connections (TCP + auth, tens of ms), so they never truly overlap. The
   * first version of these tests passed even with the locks REMOVED. Warming
   * the pool makes them able to fail.
   */
  const warmUpPool = async (): Promise<void> => {
    await Promise.all(Array.from({ length: 30 }, () => request(t.url).get('/health').expect(200)));
  };

  const countStatuses = (responses: Response[]): Record<number, number> =>
    responses.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});

  it('50 parallel assigns of the SAME job: exactly one 201, forty-nine clean 409s', async () => {
    const N = 50;
    const wsId = await createWorkstation('Race-Same-Job', 100); // capacity is not the limit here
    const jobId = await createJob('contested job');

    await warmUpPool();
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        request(t.url).post(`/jobs/${jobId}/assign`).set(planner()).send({ workstationId: wsId }),
      ),
    );

    expect(countStatuses(responses)).toEqual({ 201: 1, 409: N - 1 });
    for (const r of responses.filter((x) => x.status === 409)) {
      // a clean, explained conflict, not a leaked SQL error or a 500
      expect(r.body).toEqual({ statusCode: 409, error: 'Conflict', message: `Job ${jobId} is already ASSIGNED` });
    }

    // Check the invariant in the database too, not only the HTTP responses.
    const [{ active }] = await t.ds.query<{ active: number }[]>(
      'SELECT count(*)::int AS active FROM assignments WHERE job_id = $1 AND completed_at IS NULL',
      [jobId],
    );
    expect(active).toBe(1);
  });

  it('20 different jobs racing for a workstation with capacity 3: exactly 3 win', async () => {
    const N = 20;
    const CAPACITY = 3;
    const wsId = await createWorkstation('Race-Capacity', CAPACITY);
    const jobIds: number[] = [];
    for (let i = 0; i < N; i++) jobIds.push(await createJob(`capacity job ${i}`));

    await warmUpPool();
    const responses = await Promise.all(
      jobIds.map((id) => request(t.url).post(`/jobs/${id}/assign`).set(planner()).send({ workstationId: wsId })),
    );

    expect(countStatuses(responses)).toEqual({ 201: CAPACITY, 409: N - CAPACITY });
    for (const r of responses.filter((x) => x.status === 409)) {
      expect(r.body.message).toBe(`Workstation ${wsId} is at full capacity (3/3)`);
    }

    const [{ active }] = await t.ds.query<{ active: number }[]>(
      'SELECT count(*)::int AS active FROM assignments WHERE workstation_id = $1 AND completed_at IS NULL',
      [wsId],
    );
    expect(active).toBe(CAPACITY);

    // The losers are still NEW (their transactions rolled back completely).
    const [{ stillNew }] = await t.ds.query<{ stillNew: number }[]>(
      `SELECT count(*)::int AS "stillNew" FROM jobs WHERE id = ANY($1) AND status = 'NEW'`,
      [jobIds],
    );
    expect(stillNew).toBe(N - CAPACITY);
  });

  it('10 parallel completes of the same job: exactly one 200', async () => {
    const N = 10;
    const wsId = await createWorkstation('Race-Complete', 5);
    const jobId = await createJob('finish me');
    await request(t.url).post(`/jobs/${jobId}/assign`).set(planner()).send({ workstationId: wsId }).expect(201);

    await warmUpPool();
    const responses = await Promise.all(
      Array.from({ length: N }, () =>
        request(t.url).post(`/jobs/${jobId}/complete`).set(bearer(t.tokens[Role.OPERATOR])),
      ),
    );

    expect(countStatuses(responses)).toEqual({ 200: 1, 409: N - 1 });
    const rows = await t.ds.query<{ completed_at: Date | null }[]>(
      'SELECT completed_at FROM assignments WHERE job_id = $1',
      [jobId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).not.toBeNull();
  });
});
