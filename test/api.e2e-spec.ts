import request from 'supertest';
import { Role } from '../src/auth/role.enum';
import { bearer, createTestApp, PASSWORD, TestApp } from './utils/test-app';

describe('jobflow-api (e2e)', () => {
  let t: TestApp;
  const as = (role: Role) => bearer(t.tokens[role]);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('health & auth', () => {
    it('GET /health is public and checks the database', async () => {
      const res = await request(t.url).get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    });

    it('login: same 401 message for wrong password and unknown email', async () => {
      const wrong = await request(t.url).post('/auth/login').send({ email: 'admin@example.com', password: 'nope' });
      const unknown = await request(t.url).post('/auth/login').send({ email: 'ghost@example.com', password: PASSWORD });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('401 without a token, 403 with the wrong role', async () => {
      await request(t.url).get('/jobs').expect(401);
      await request(t.url).get('/jobs').set(as(Role.ADMIN)).expect(403);
      await request(t.url).post('/workstations').set(as(Role.PLANNER)).send({ name: 'x', capacity: 1 }).expect(403);
    });

    it('GET /users/me returns the caller without the password hash', async () => {
      const res = await request(t.url).get('/users/me').set(as(Role.OPERATOR)).expect(200);
      expect(res.body).toMatchObject({ email: 'operator@example.com', role: 'operator' });
      expect(JSON.stringify(res.body)).not.toMatch(/scrypt|password/i);
    });
  });

  describe('workstations (admin)', () => {
    it('creates, rejects duplicates (409) and invalid input (400)', async () => {
      const created = await request(t.url)
        .post('/workstations')
        .set(as(Role.ADMIN))
        .send({ name: 'Lathe-01', capacity: 2 })
        .expect(201);
      expect(created.body).toMatchObject({ id: expect.any(Number), name: 'Lathe-01', capacity: 2, isActive: true });

      const dup = await request(t.url).post('/workstations').set(as(Role.ADMIN)).send({ name: 'Lathe-01', capacity: 1 });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('A workstation with this name already exists');

      const bad = await request(t.url)
        .post('/workstations')
        .set(as(Role.ADMIN))
        .send({ name: '', capacity: 0, extra: true });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toEqual(
        expect.arrayContaining(['property extra should not exist', 'capacity must not be less than 1']),
      );
    });

    it('400 for a non-numeric or out-of-range id, 404 for a missing one', async () => {
      await request(t.url).get('/workstations/abc').set(as(Role.ADMIN)).expect(400);
      await request(t.url).get('/workstations/99999999999').set(as(Role.ADMIN)).expect(400);
      await request(t.url).get('/workstations/424242').set(as(Role.ADMIN)).expect(404);
    });
  });

  describe('jobs: list, filters, pagination', () => {
    beforeAll(async () => {
      for (const [title, priority] of [
        ['low', 1],
        ['urgent-1', 5],
        ['mid', 3],
        ['urgent-2', 5],
      ] as const) {
        await request(t.url).post('/jobs').set(as(Role.PLANNER)).send({ title, priority }).expect(201);
      }
    });

    it('clients cannot set status on create', async () => {
      await request(t.url).post('/jobs').set(as(Role.PLANNER)).send({ title: 'x', status: 'DONE' }).expect(400);
    });

    it('orders by priority DESC then oldest first, and pages without overlap', async () => {
      const p1 = await request(t.url).get('/jobs?limit=2&page=1').set(as(Role.PLANNER)).expect(200);
      const p2 = await request(t.url).get('/jobs?limit=2&page=2').set(as(Role.PLANNER)).expect(200);
      const titles = [...p1.body.items, ...p2.body.items].map((j: { title: string }) => j.title);
      expect(titles).toEqual(['urgent-1', 'urgent-2', 'mid', 'low']);
      expect(p1.body.total).toBe(4);
    });

    it('filters by status and minPriority', async () => {
      const res = await request(t.url).get('/jobs?status=NEW&minPriority=4').set(as(Role.OPERATOR)).expect(200);
      expect(res.body.items.map((j: { title: string }) => j.title)).toEqual(['urgent-1', 'urgent-2']);
    });

    it('rejects invalid query params', async () => {
      await request(t.url).get('/jobs?status=BOGUS').set(as(Role.PLANNER)).expect(400);
      await request(t.url).get('/jobs?limit=1000').set(as(Role.PLANNER)).expect(400);
    });
  });

  describe('assignment lifecycle', () => {
    let wsId: number;
    const newJob = async (title: string): Promise<number> =>
      (await request(t.url).post('/jobs').set(as(Role.PLANNER)).send({ title }).expect(201)).body.id;

    beforeAll(async () => {
      wsId = (
        await request(t.url).post('/workstations').set(as(Role.ADMIN)).send({ name: 'Press-01', capacity: 1 }).expect(201)
      ).body.id;
    });

    it('NEW -> ASSIGNED -> DONE, freeing capacity, with the right roles', async () => {
      const job = await newJob('lifecycle');

      await request(t.url).post(`/jobs/${job}/assign`).set(as(Role.OPERATOR)).send({ workstationId: wsId }).expect(403);
      const assigned = await request(t.url)
        .post(`/jobs/${job}/assign`)
        .set(as(Role.PLANNER))
        .send({ workstationId: wsId })
        .expect(201);
      expect(assigned.body).toMatchObject({ jobId: job, workstationId: wsId, completedAt: null });

      const load = await request(t.url).get(`/workstations/${wsId}/load`).set(as(Role.OPERATOR)).expect(200);
      expect(load.body).toMatchObject({ capacity: 1, activeAssignments: 1, available: 0 });
      expect(load.body.jobs[0]).toMatchObject({ jobId: job, title: 'lifecycle' });

      // full workstation
      const other = await newJob('waiting');
      const full = await request(t.url).post(`/jobs/${other}/assign`).set(as(Role.PLANNER)).send({ workstationId: wsId });
      expect(full.status).toBe(409);
      expect(full.body.message).toMatch(/full capacity \(1\/1\)/);

      await request(t.url).post(`/jobs/${job}/complete`).set(as(Role.PLANNER)).expect(403);
      const done = await request(t.url).post(`/jobs/${job}/complete`).set(as(Role.OPERATOR)).expect(200);
      expect(done.body.completedAt).not.toBeNull();
      await request(t.url).post(`/jobs/${job}/complete`).set(as(Role.OPERATOR)).expect(409);

      const after = await request(t.url).get(`/jobs/${job}`).set(as(Role.PLANNER)).expect(200);
      expect(after.body.status).toBe('DONE');

      // capacity is free again
      await request(t.url).post(`/jobs/${other}/assign`).set(as(Role.PLANNER)).send({ workstationId: wsId }).expect(201);
    });

    it('capacity cannot be lowered below the current active assignments', async () => {
      const ws = (
        await request(t.url).post('/workstations').set(as(Role.ADMIN)).send({ name: 'Mill-01', capacity: 3 }).expect(201)
      ).body.id;
      for (const title of ['m1', 'm2']) {
        const job = await newJob(title);
        await request(t.url).post(`/jobs/${job}/assign`).set(as(Role.PLANNER)).send({ workstationId: ws }).expect(201);
      }
      const res = await request(t.url).patch(`/workstations/${ws}`).set(as(Role.ADMIN)).send({ capacity: 1 });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('capacity cannot be lower than the current active assignments (2)');
      await request(t.url).patch(`/workstations/${ws}`).set(as(Role.ADMIN)).send({ capacity: 2 }).expect(200);
    });

    it('409 for inactive workstations; delete with history is refused', async () => {
      await request(t.url).delete(`/workstations/${wsId}`).set(as(Role.ADMIN)).expect(409);
      await request(t.url).patch(`/workstations/${wsId}`).set(as(Role.ADMIN)).send({ isActive: false }).expect(200);
      const job = await newJob('inactive-target');
      const res = await request(t.url).post(`/jobs/${job}/assign`).set(as(Role.PLANNER)).send({ workstationId: wsId });
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/not active/);
    });

    it('404 for unknown job or workstation', async () => {
      const job = await newJob('lonely');
      await request(t.url).post('/jobs/999999/assign').set(as(Role.PLANNER)).send({ workstationId: wsId }).expect(404);
      await request(t.url).post(`/jobs/${job}/assign`).set(as(Role.PLANNER)).send({ workstationId: 999999 }).expect(404);
    });
  });
});
