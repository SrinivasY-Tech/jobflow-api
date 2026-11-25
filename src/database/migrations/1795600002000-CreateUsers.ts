import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Users with a single role. Emails are stored lowercase (enforced by CHECK),
 * so a plain UNIQUE constraint is effectively case-insensitive without the
 * citext extension.
 */
export class CreateUsers1795600002000 implements MigrationInterface {
  name = 'CreateUsers1795600002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email          varchar(254) NOT NULL,
        password_hash  varchar(255) NOT NULL,
        role           varchar(16)  NOT NULL,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT ck_users_email_lowercase CHECK (email = lower(email)),
        CONSTRAINT ck_users_role CHECK (role IN ('admin', 'planner', 'operator'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE users`);
  }
}
