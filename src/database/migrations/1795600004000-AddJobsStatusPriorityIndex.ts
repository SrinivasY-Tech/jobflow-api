import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Composite index that matches the list query exactly:
 *   WHERE status = $1 ORDER BY priority DESC, created_at ASC, id ASC LIMIT n
 * Equality column first, then the ORDER BY columns in the SAME directions, so
 * Postgres can walk the index in order and stop after n rows (no sort, no
 * full scan). Serves every status (NEW, ASSIGNED, DONE).
 *
 * CONCURRENTLY builds the index without blocking INSERT/UPDATE on jobs. A
 * plain CREATE INDEX holds a lock that blocks writes for the whole build,
 * which on a big production table is an outage. CONCURRENTLY can't run inside
 * a transaction, hence `transaction = false` (requires migration:run -t each).
 */
export class AddJobsStatusPriorityIndex1795600004000 implements MigrationInterface {
  name = 'AddJobsStatusPriorityIndex1795600004000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_jobs_status_priority_created_id
        ON jobs (status, priority DESC, created_at ASC, id ASC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS ix_jobs_status_priority_created_id`);
  }
}
