#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const DEFAULT_TEST_DB = 'crm_test_db';
const BLOCKED_DB_PATTERN = /^(crm_db|postgres|template0|template1)$/i;
const UNSAFE_ENV_PATTERN = /(prod|production|staging)/i;

function resolveAndValidateTestDb() {
  const nodeEnv = process.env.NODE_ENV || 'test';
  const requestedTestDb = process.env.TEST_DATABASE_NAME || DEFAULT_TEST_DB;
  const requestedDb = process.env.DATABASE_NAME || requestedTestDb;

  if (nodeEnv !== 'test') {
    console.error(
      `[TEST DB GUARD ABORT] NODE_ENV must be 'test' (received '${nodeEnv}'). Refusing to run integration test.`,
    );
    process.exit(1);
  }

  for (const [label, value] of [
    ['TEST_DATABASE_NAME', requestedTestDb],
    ['DATABASE_NAME', requestedDb],
  ]) {
    if (BLOCKED_DB_PATTERN.test(value) || UNSAFE_ENV_PATTERN.test(value)) {
      console.error(
        `[TEST DB GUARD ABORT] ${label}='${value}' points to a protected/staging/production database. Only isolated test databases (e.g., '${DEFAULT_TEST_DB}') are allowed.`,
      );
      process.exit(1);
    }
  }

  if (requestedDb !== requestedTestDb) {
    console.error(
      `[TEST DB GUARD ABORT] DATABASE_NAME ('${requestedDb}') must match TEST_DATABASE_NAME ('${requestedTestDb}') to prevent mixed-database writes.`,
    );
    process.exit(1);
  }

  return requestedTestDb;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-isolated-test.js <spec-file> [args...]');
  process.exit(1);
}

const safeTestDb = resolveAndValidateTestDb();
const apiRoot = path.resolve(__dirname, '..');
const tsNodeBin = require.resolve('ts-node/dist/bin.js', { paths: [apiRoot] });

const result = spawnSync(process.execPath, [tsNodeBin, ...args], {
  cwd: apiRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    ALLOW_PRIVILEGED_TEST_TEARDOWN: 'true',
    DATABASE_NAME: safeTestDb,
    TEST_DATABASE_NAME: safeTestDb,
  },
});

if (result.error) {
  console.error('[TEST RUNNER ERROR]', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
