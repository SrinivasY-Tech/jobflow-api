import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First migration. Proves the migration pipeline end to end:
 * the CLI connects, runs this SQL inside a transaction, and records it in
 * the typeorm_migrations table so it never runs twice.
 */
export class CreateWorkstations1795600000000 implements MigrationInterface {
  name = 'CreateWorkstations1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workstations (
        id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name        varchar(100) NOT NULL,
        capacity    integer      NOT NULL,
        is_active   boolean      NOT NULL DEFAULT true,
        created_at  timestamptz  NOT NULL DEFAULT now(),
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_workstations_name UNIQUE (name),
        CONSTRAINT ck_workstations_capacity_positive CHECK (capacity > 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE workstations`);
  }
}
