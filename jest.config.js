/** Unit tests: fast, no database. Files next to the code: src/**\/*.spec.ts */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/*.module.ts', '!main.ts', '!database/migrations/**', '!scripts/**'],
  coverageDirectory: '../coverage',
};
