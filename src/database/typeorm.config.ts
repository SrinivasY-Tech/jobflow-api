import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Assignment } from '../assignments/assignment.entity';
import { DbEnvConfig } from '../config/env.validation';
import { Job } from '../jobs/job.entity';
import { User } from '../users/user.entity';
import { Workstation } from '../workstations/workstation.entity';

/**
 * Entities are listed explicitly rather than found with a glob. A glob loads
 * files by a path string that can differ from the normal import path (on
 * Windows `e:\` vs `E:\`), and Node then loads the module twice. That gives two
 * different `User` classes, and TypeORM reports "No metadata for User".
 */
export const ENTITIES = [Workstation, Job, User, Assignment];

/**
 * Single source of truth for the database connection. Used by:
 *  - AppModule (TypeOrmModule.forRootAsync) at runtime
 *  - data-source.ts for the TypeORM CLI (migrations)
 * Keeping one builder prevents the classic bug where the app and the CLI
 * point at different databases or migration folders.
 */
export function buildDataSourceOptions(env: DbEnvConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: ENTITIES,
    // Migrations are never imported elsewhere, so a glob is safe here. It
    // matches both ts-node (src/**/*.ts) and compiled output (dist/**/*.js).
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    // Schema changes only ever happen through reviewed migration files.
    synchronize: false,
    migrationsRun: false,
    // TypeORM's 'error' logging prints the failed query WITH its parameters
    // (password hashes, emails). So outside development it is off, and
    // PgErrorFilter logs unexpected DB errors without parameters.
    logging: env.NODE_ENV === 'development' ? ['error', 'warn', 'migration'] : false,
    extra: {
      max: 10, // pg connection pool size
      connectionTimeoutMillis: 5_000,
    },
  };
}
