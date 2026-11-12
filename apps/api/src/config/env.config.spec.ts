import * as assert from 'assert';
import { validateProductionEnv } from './env.config';

async function runEnvHardeningTests() {
  console.log('==================================================');
  console.log('STARTING PRODUCTION ENV HARDENING TEST SUITE');
  console.log('==================================================');

  const originalEnv = { ...process.env };

  try {
    // TEST 1: Default JWT secrets fail validation
    console.log('--- TEST 1: Default JWT secrets fail validation ---');
    const invalidJwtConfig = {
      database: { host: 'cloudsql.internal', name: 'crm_prod', user: 'crm_admin', password: 'SuperSecretProdPassword!@#' },
      redis: { host: '10.0.0.5' },
      jwt: { accessSecret: 'default_access_secret_for_dev_only', refreshSecret: 'default_refresh_secret_for_dev_only' },
      bootstrapAdmin: { password: 'StrongAdminPass123!@#' },
      frontendUrl: 'https://crm.company.com',
    };

    const res1 = validateProductionEnv(invalidJwtConfig);
    assert.strictEqual(res1.isValid, false, 'Expected res1 to be invalid');
    assert.ok(res1.errors.some((e) => e.includes('JWT_ACCESS_SECRET')), 'Expected error for JWT_ACCESS_SECRET');
    assert.ok(res1.errors.some((e) => e.includes('JWT_REFRESH_SECRET')), 'Expected error for JWT_REFRESH_SECRET');
    console.log('✅ PASS: Default JWT secrets properly rejected');

    // TEST 2: Insecure Bootstrap Admin password fails validation
    console.log('--- TEST 2: Insecure Bootstrap Admin password fails validation ---');
    const invalidAdminPassConfig = {
      database: { host: 'cloudsql.internal', name: 'crm_prod', user: 'crm_admin', password: 'SuperSecretProdPassword!@#' },
      redis: { host: '10.0.0.5' },
      jwt: {
        accessSecret: 'a_very_long_secure_production_access_secret_min_32_chars!',
        refreshSecret: 'a_very_long_secure_production_refresh_secret_min_32_chars!',
      },
      bootstrapAdmin: { password: 'AdminPass123!@#' },
      frontendUrl: 'https://crm.company.com',
    };

    const res2 = validateProductionEnv(invalidAdminPassConfig);
    assert.strictEqual(res2.isValid, false, 'Expected res2 to be invalid');
    assert.ok(res2.errors.some((e) => e.includes('BOOTSTRAP_ADMIN_PASSWORD')), 'Expected error for BOOTSTRAP_ADMIN_PASSWORD');
    console.log('✅ PASS: Default AdminPass123!@# properly rejected');

    // TEST 3: Default postgres password fails validation
    console.log('--- TEST 3: Default postgres password fails validation ---');
    const invalidDbConfig = {
      database: { host: 'cloudsql.internal', name: 'crm_prod', user: 'postgres', password: 'postgres_secret_dev' },
      redis: { host: '10.0.0.5' },
      jwt: {
        accessSecret: 'a_very_long_secure_production_access_secret_min_32_chars!',
        refreshSecret: 'a_very_long_secure_production_refresh_secret_min_32_chars!',
      },
      bootstrapAdmin: { password: 'StrongAdminPass123!@#' },
      frontendUrl: 'https://crm.company.com',
    };

    const res3 = validateProductionEnv(invalidDbConfig);
    assert.strictEqual(res3.isValid, false, 'Expected res3 to be invalid');
    assert.ok(res3.errors.some((e) => e.includes('DATABASE_PASSWORD')), 'Expected error for DATABASE_PASSWORD');
    console.log('✅ PASS: Default postgres_secret_dev properly rejected');

    // TEST 4: Placeholder R2 credentials fail validation
    console.log('--- TEST 4: Placeholder R2 credentials fail validation ---');
    delete process.env.DATABASE_URL;
    process.env.STORAGE_DRIVER = 'r2';
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'your_r2_access_key_id';
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'your_r2_secret_access_key';

    const invalidR2Config = {
      database: { host: 'cloudsql.internal', name: 'crm_prod', user: 'crm_admin', password: 'SuperSecretProdPassword!@#' },
      redis: { host: '10.0.0.5' },
      jwt: {
        accessSecret: 'a_very_long_secure_production_access_secret_min_32_chars!',
        refreshSecret: 'a_very_long_secure_production_refresh_secret_min_32_chars!',
      },
      bootstrapAdmin: { password: 'StrongAdminPass123!@#' },
      frontendUrl: 'https://crm.company.com',
    };

    const res4 = validateProductionEnv(invalidR2Config);
    assert.strictEqual(res4.isValid, false, 'Expected res4 to be invalid');
    assert.ok(res4.errors.some((e) => e.includes('Cloudflare R2')), 'Expected error for Cloudflare R2');
    console.log('✅ PASS: Placeholder R2 credentials properly rejected');

    // TEST 5: Complete valid production configuration passes validation
    console.log('--- TEST 5: Complete valid production configuration passes validation ---');
    process.env.DATABASE_URL = 'postgresql://crm_prod_user:StrongPass123!@cloudsql.internal:5432/crm_production_db';
    process.env.REDIS_URL = 'redis://10.0.0.5:6379';
    process.env.STORAGE_DRIVER = 'r2';
    process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'prod_account_id_12345';
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = 'prod_access_key_67890';
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = 'prod_secret_access_key_abcdef123456';
    process.env.FRONTEND_URL = 'https://crm.company.com';

    const validConfig = {
      database: {},
      redis: {},
      jwt: {
        accessSecret: 'a_very_long_secure_production_access_secret_min_32_chars!',
        refreshSecret: 'a_very_long_secure_production_refresh_secret_min_32_chars!',
      },
      bootstrapAdmin: { password: 'StrongProductionAdminPassword456!@#' },
      frontendUrl: 'https://crm.company.com',
    };

    const res5 = validateProductionEnv(validConfig);
    assert.strictEqual(res5.isValid, true, 'Expected res5 to be valid');
    assert.strictEqual(res5.errors.length, 0, 'Expected 0 errors');
    console.log('✅ PASS: Fully configured production environment passed validation');

    // TEST 6: Out-of-bounds DB pool configuration fails validation
    console.log('--- TEST 6: Out-of-bounds DB pool configuration fails validation ---');
    const invalidPoolConfig = {
      ...validConfig,
      database: { poolMax: 150, poolMin: 200 },
    };
    const res6 = validateProductionEnv(invalidPoolConfig);
    assert.strictEqual(res6.isValid, false, 'Expected invalid pool config to fail');
    assert.ok(res6.errors.some((e) => e.includes('DATABASE_POOL_MAX')), 'Expected error for DATABASE_POOL_MAX');
    assert.ok(res6.errors.some((e) => e.includes('DATABASE_POOL_MIN')), 'Expected error for DATABASE_POOL_MIN');
    console.log('✅ PASS: Out-of-bounds DB pool configuration properly rejected');

    console.log('==================================================');
    console.log('ALL PRODUCTION ENV HARDENING TESTS PASSED! ✅');
    console.log('==================================================');
  } finally {
    process.env = { ...originalEnv };
  }
}

runEnvHardeningTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Env Hardening Test Failed:', err);
    process.exit(1);
  });
