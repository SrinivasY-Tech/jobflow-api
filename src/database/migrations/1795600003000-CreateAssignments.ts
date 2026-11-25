import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Assignment history. A row is "active" while completed_at IS NULL.
 *
 * uq_assignments_active_job is a PARTIAL UNIQUE INDEX: uniqueness of job_id is
 * enforced only among active rows. A job keeps all its finished assignments
 * as history, but the database makes a second ACTIVE assignment for the
 * same job impossible, whatever code path tries to insert it.
 */
export class CreateAssignments1795600003000 implements MigrationInterface {
  name = 'CreateAssignments1795600003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE assignments (
        id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        job_id          integer     NOT NULL,
        workstation_id  integer     NOT NULL,
        assigned_by     integer     NOT NULL,
        assigned_at     timestamptz NOT NULL DEFAULT now(),
        completed_at    timestamptz NULL,
        completed_by    integer     NULL,
        CONSTRAINT fk_assignments_job          FOREIGN KEY (job_id)         REFERENCES jobs(id)         ON DELETE RESTRICT,
        CONSTRAINT fk_assignments_workstation  FOREIGN KEY (workstation_id) REFERENCES workstations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignments_assigned_by  FOREIGN KEY (assigned_by)    REFERENCES users(id)        ON DELETE RESTRICT,
        CONSTRAINT fk_assignments_completed_by FOREIGN KEY (completed_by)   REFERENCES users(id)        ON DELETE RESTRICT,
        -- completed_at and completed_by are set together or not at all
        CONSTRAINT ck_assignments_completion CHECK ((completed_at IS NULL) = (completed_by IS NULL))
      )
    `);

    // At most ONE active assignment per job.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_assignments_active_job
        ON assignments (job_id)
        WHERE completed_at IS NULL
    `);

    // Serves the capacity check and GET /workstations/:id/load:
    // "active assignments of workstation X". Only active rows are indexed,
    // so the index stays small no matter how much history accumulates.
    await queryRunner.query(`
      CREATE INDEX ix_assignments_active_workstation
        ON assignments (workstation_id)
        WHERE completed_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE assignments`);
  }
}
