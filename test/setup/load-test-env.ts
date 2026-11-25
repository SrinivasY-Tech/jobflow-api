/**
 * Builds the test environment from the normal one:
 *  - locally: values come from .env (if the shell hasn't set them already)
 *  - CI: values come from the workflow's env block (no .env file exists)
 * The database name gets a "_test" suffix, and we refuse to run against
 * anything else, because the suite TRUNCATEs tables.
 */
export function loadTestEnv(): void {
  if (!process.env.DB_HOST) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // no .env file: CI provides the variables
    }
  }

  process.env.NODE_ENV = 'test';
  // Computed once and kept, so running this twice (global setup + worker)
  // doesn't produce "jobflow_test_test".
  process.env.TEST_DB_NAME ??= `${process.env.DB_NAME ?? 'jobflow'}_test`;
  process.env.DB_NAME = process.env.TEST_DB_NAME;
  process.env.JWT_SECRET ??= 'test-only-jwt-secret-at-least-32-characters';

  if (!process.env.DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against "${process.env.DB_NAME}": name must end with _test`);
  }
}
