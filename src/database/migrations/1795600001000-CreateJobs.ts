import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jobs table. Deliberately NO secondary indexes yet: Phase 6 seeds 100k+ rows,
 * captures EXPLAIN plans without indexes, then adds them in a later migration
 * so the before/after difference is measurable.
 */
export class CreateJobs1795600001000 implements MigrationInterface {
  name = 'CreateJobs1795600001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE jobs (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        title       varchar(200) NOT NULL,
        status      varchar(16)  NOT NULL DEFAULT 'NEW',
        priority    smallint     NOT NULL DEFAULT 3,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_jobs_status CHECK (status IN ('NEW', 'ASSIGNED', 'DONE')),
        CONSTRAINT ck_jobs_priority_range CHECK (priority BETWEEN 1 AND 5)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE jobs`);
  }
}
