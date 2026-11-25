import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateDbEnv } from '../../src/config/env.validation';
import { buildDataSourceOptions } from '../../src/database/typeorm.config';
import { loadTestEnv } from './load-test-env';

/**
 * Runs once before all e2e files:
 *  1. CREATE DATABASE <name>_test if it doesn't exist (connects to "postgres")
 *  2. drop and recreate the public schema, so every run starts clean
 *  3. run the real migrations, so tests use exactly the production schema
 *     (never synchronize:true, which could hide a broken migration)
 */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const env = validateDbEnv(process.env);

  const admin = new DataSource({
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: 'postgres',
  });
  await admin.initialize();
  const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.DB_NAME]);
  if (rows.length === 0) {
    // Identifiers can't be bound as parameters; the name was validated to end with _test.
    await admin.query(`CREATE DATABASE "${env.DB_NAME.replace(/"/g, '')}"`);
  }
  await admin.destroy();

  const ds = new DataSource({ ...buildDataSourceOptions(env), logging: false });
  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE');
  await ds.query('CREATE SCHEMA public');
  await ds.runMigrations({ transaction: 'each' });
  await ds.destroy();
}
