import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partial index for the hot path, the planner's open queue:
 *   WHERE status = 'NEW' ORDER BY priority DESC, created_at, id LIMIT n
 * Only NEW rows (~15% of the table) are indexed, so it is much smaller than
 * the composite index and stays small as DONE history grows. The planner
 * uses it only when the query's WHERE clause implies status = 'NEW'.
 */
export class AddJobsOpenQueuePartialIndex1795600005000 implements MigrationInterface {
  name = 'AddJobsOpenQueuePartialIndex1795600005000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_jobs_open_queue
        ON jobs (priority DESC, created_at ASC, id ASC)
        WHERE status = 'NEW'
    `);
  }

  /**
   * TypeORM's migration:revert always wraps down() in a transaction (it ignores
   * `transaction = false`), so DROP INDEX CONCURRENTLY is impossible here.
   * A plain DROP INDEX is a quick catalog change, but it needs an exclusive lock
   * on jobs. lock_timeout makes it fail fast instead of queueing behind a long
   * query while every new query queues behind it.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`DROP INDEX IF EXISTS ix_jobs_open_queue`);
  }
}
