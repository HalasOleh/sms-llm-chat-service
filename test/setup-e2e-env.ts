/**
 * Environment for the e2e suites.
 *
 * A separate database: the tests truncate the table between cases, and doing
 * that against the development database would mean losing your own data every
 * time you debug.
 *
 * Providers are mocked not for convenience but because e2e here verifies OUR
 * code and its use of the database. Whether someone else's API is reachable
 * is not what these tests are about.
 */
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'mock';
process.env.LLM_PROVIDER = 'mock';
process.env.DATABASE_URL ??=
  'postgresql://sms:sms@localhost:5432/sms_llm_chat_test?schema=public';
process.env.ADMIN_USERNAME ??= 'admin';
process.env.ADMIN_PASSWORD_HASH ??=
  '$2b$10$28HuUTmTzaj.MOYprCKF/uQEmxQWsdQU3NHZNFRjiwbG1htP0Pj1C';
process.env.JWT_SECRET ??= 'test-secret';
process.env.SMS_MAX_LENGTH ??= '320';
