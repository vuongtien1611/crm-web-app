import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

/**
 * Production-Grade Safe Database Migration Runner
 * 
 * Safety Invariants:
 * - Build -> Migrate -> Deploy pipeline step.
 * - Tracks applied migrations via `schema_migrations` table.
 * - Idempotent: Skips already-applied migrations.
 * - Transactional: Each migration file is wrapped in BEGIN ... COMMIT.
 * - Zero Destructive Drops: Never resets DB.
 * - Zero Test Seeds: Never executes test fixtures in production.
 */
export async function runMigrations() {
  console.log('==================================================');
  console.log('CRM PRODUCTION DATABASE MIGRATION RUNNER');
  console.log('==================================================');

  const databaseUrl = process.env.DATABASE_URL;
  const poolConfig: any = databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        database: process.env.DATABASE_NAME || 'crm_db',
        user: process.env.DATABASE_USER || 'postgres',
        password: process.env.DATABASE_PASSWORD || 'postgres_secret_dev',
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
      };

  const pool = new Pool(poolConfig);

  try {
    const client = await pool.connect();
    try {
      // 1. Ensure schema_migrations table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 2. Check if database is initialized (check if 'users' table exists)
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'users'
        );
      `);
      const isInitialized = tableCheck.rows[0]?.exists;

      // Locate project root database directory
      const baseDir = path.resolve(__dirname, '../../../../database');
      const schemaPath = path.join(baseDir, 'crm_order_schema.sql');
      const migrationsDir = path.join(baseDir, 'migrations');

      if (!isInitialized) {
        console.log('🌱 Fresh Database detected. Applying base schema (crm_order_schema.sql)...');
        if (!fs.existsSync(schemaPath)) {
          throw new Error(`Base schema file not found at ${schemaPath}`);
        }
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query('BEGIN');
        await client.query(schemaSql);
        await client.query(
          'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
          ['00000000_crm_order_schema']
        );
        await client.query('COMMIT');
        console.log('✅ Base schema successfully applied.');
      } else {
        console.log('ℹ️ Base schema already initialized. Checking pending incremental migrations...');
        // Ensure baseline marker exists
        await client.query(
          'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
          ['00000000_crm_order_schema']
        );
      }

      // 3. Scan migrations directory
      if (!fs.existsSync(migrationsDir)) {
        console.log(`ℹ️ No migrations directory found at ${migrationsDir}. Done.`);
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      const appliedResult = await client.query('SELECT version FROM schema_migrations');
      const appliedSet = new Set(appliedResult.rows.map((r: { version: string }) => r.version));

      let pendingCount = 0;
      for (const file of files) {
        if (appliedSet.has(file)) {
          console.log(`  [SKIP] ${file} (already applied)`);
          continue;
        }

        pendingCount++;
        console.log(`  [APPLYING] ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
            [file]
          );
          await client.query('COMMIT');
          console.log(`  [APPLIED]  ${file} ✅`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Migration failed in ${file}. Rolled back.`);
          throw err;
        }
      }

      if (pendingCount === 0) {
        console.log('✨ Database schema is completely up-to-date. No pending migrations.');
      } else {
        console.log(`🎉 Successfully applied ${pendingCount} pending migration(s).`);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  console.log('==================================================');
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration runner fatal error:', err);
      process.exit(1);
    });
}
