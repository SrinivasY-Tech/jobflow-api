import 'reflect-metadata';
import { parseArgs } from 'node:util';
import dataSource from '../database/data-source';

/**
 * Seeds a large, realistic data set for query tuning (Phase 6):
 *
 *   npm run seed:jobs -- --count 200000
 *
 * Distribution (roughly a real work queue): most jobs are finished history.
 *   ~75% DONE, ~10% ASSIGNED, ~15% NEW; priority skewed towards 2-3;
 *   created_at spread over the last 365 days.
 *
 * ASSIGNED and DONE jobs get matching assignment rows (spread over 20 seed
 * workstations), so seeded data respects the same invariants the API
 * enforces and the endpoints keep working on it.
 *
 * Everything is set-based SQL (INSERT ... SELECT generate_series): one round
 * trip per statement instead of 200k ORM inserts.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { count: { type: 'string', default: '200000' } } });
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > 5_000_000) {
    throw new Error('--count must be an integer between 1 and 5,000,000');
  }

  await dataSource.initialize();
  const started = Date.now();
  try {
    await dataSource.transaction(async (em) => {
      const [user] = await em.query<{ id: number }[]>(`SELECT id FROM users ORDER BY id LIMIT 1`);
      if (!user) throw new Error('Create at least one user first (npm run user:create)');

      await em.query(`
        INSERT INTO workstations (name, capacity)
        SELECT format('Seed-WS-%s', lpad(g::text, 2, '0')), 5000
        FROM generate_series(1, 20) g
        ON CONFLICT (name) DO NOTHING`);

      // Remember where the new ids start, so assignments only cover new jobs.
      const [{ max }] = await em.query<{ max: number }[]>(`SELECT coalesce(max(id), 0)::int AS max FROM jobs`);

      await em.query(
        `
        INSERT INTO jobs (title, status, priority, created_at, updated_at)
        SELECT
          format('Seed job %s', g),
          CASE WHEN r < 0.75 THEN 'DONE' WHEN r < 0.85 THEN 'ASSIGNED' ELSE 'NEW' END,
          (ARRAY[1,2,2,3,3,3,4,4,5])[1 + floor(random() * 9)::int],
          ts,
          ts
        FROM (
          SELECT g, random() AS r, now() - random() * interval '365 days' AS ts
          FROM generate_series(1, $1::int) g
        ) s`,
        [count],
      );

      await em.query(
        `
        INSERT INTO assignments (job_id, workstation_id, assigned_by, assigned_at, completed_at, completed_by)
        SELECT
          j.id,
          w.id,
          $2::int,
          j.created_at + interval '1 hour',
          CASE WHEN j.status = 'DONE' THEN j.created_at + interval '1 day' END,
          CASE WHEN j.status = 'DONE' THEN $2::int END
        FROM jobs j
        JOIN LATERAL (
          SELECT id FROM workstations
          WHERE name LIKE 'Seed-WS-%'
          ORDER BY id
          OFFSET (j.id % 20) LIMIT 1
        ) w ON true
        WHERE j.id > $1 AND j.status IN ('ASSIGNED', 'DONE')`,
        [max, user.id],
      );
    });

    // Fresh statistics, so the planner's estimates match the new data.
    await dataSource.query('ANALYZE jobs, assignments, workstations');

    const stats = await dataSource.query<{ status: string; n: number }[]>(
      `SELECT status, count(*)::int AS n FROM jobs GROUP BY status ORDER BY status`,
    );
    console.log(`Seeded ${count} jobs in ${Date.now() - started} ms`);
    console.table(stats);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
