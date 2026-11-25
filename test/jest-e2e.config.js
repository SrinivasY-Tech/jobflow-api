/**
 * E2E tests: the real Nest app + a real Postgres test database.
 * Run with --runInBand (see npm run test:e2e): every file shares one database.
 */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  // Once per run: create the test DB if needed, reset schema, run migrations.
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  // In every test worker: point env at the test DB before AppModule is imported.
  setupFiles: ['<rootDir>/test/setup/test-env.ts'],
  testTimeout: 60_000,
};
