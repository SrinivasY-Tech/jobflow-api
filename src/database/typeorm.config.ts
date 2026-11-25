import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { EnvConfig } from '../config/env.validation';

/**
 * Single source of truth for the database connection. Used by:
 *  - AppModule (TypeOrmModule.forRootAsync) at runtime
 *  - data-source.ts for the TypeORM CLI (migrations)
 * Keeping one builder prevents the classic bug where the app and the CLI
 * point at different databases or migration folders.
 */
export function buildDataSourceOptions(env: EnvConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    // Globs work for both ts-node (src/**/*.ts) and compiled output (dist/**/*.js).
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'typeorm_migrations',
    // Schema changes only ever happen through reviewed migration files.
    synchronize: false,
    migrationsRun: false,
    logging: env.NODE_ENV === 'development' ? ['error', 'warn', 'migration'] : ['error'],
    extra: {
      max: 10, // pg connection pool size
      connectionTimeoutMillis: 5_000,
    },
  };
}
