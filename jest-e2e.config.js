/**
 * E2E: boots the real Nest application against a real PostgreSQL, but with
 * mocked external providers (SMS/LLM). What is verified is our own code and
 * its use of the database, not whether someone else's API is reachable.
 *
 * runInBand - the suites share one database and truncate it between cases.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFiles: ['<rootDir>/test/setup-e2e-env.ts'],
};
