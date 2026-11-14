#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const DEFAULT_TEST_DB = 'crm_test_db';
const BLOCKED_DB_PATTERN = /^(crm_db|postgres|template0|template1)$/i;
const UNSAFE_ENV_PATTERN = /(prod|production|staging)/i;

async function main() {
  const databaseName = process.env.DATABASE_NAME || process.env.TEST_DATABASE_NAME || DEFAULT_TEST_DB;
  if (BLOCKED_DB_PATTERN.test(databaseName) || UNSAFE_ENV_PATTERN.test(databaseName)) {
    console.error(
      `[SEED GUARD ABORT] Refusing to run master seed against protected database '${databaseName}'.`,
    );
    process.exit(1);
  }

  const sqlPath = path.resolve(__dirname, '../../../database/crm_seed.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`[SEED ERROR] Master seed file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    database: databaseName,
    user: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres_secret_dev',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await client.query(sqlContent);
    console.log(`[SEED OK] Applied master seed (${path.basename(sqlPath)}) to '${databaseName}'.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('[SEED ERROR]', err);
  process.exit(1);
});
