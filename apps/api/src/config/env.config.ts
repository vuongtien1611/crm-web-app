import { Logger } from '@nestjs/common';

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
}

export const validateProductionEnv = (env: Record<string, any>): EnvValidationResult => {
  const errors: string[] = [];

  // 1. Database validation
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const dbUser = process.env.DATABASE_USER || env.database?.user;
  const dbPass = process.env.DATABASE_PASSWORD || env.database?.password;
  const dbHost = process.env.DATABASE_HOST || env.database?.host;

  if (!hasDbUrl) {
    if (!dbHost || dbHost === 'localhost') {
      errors.push('Production requires DATABASE_URL or remote DATABASE_HOST (localhost not allowed in production).');
    }
    if (!dbPass || dbPass === 'postgres_secret_dev') {
      errors.push('Production cannot use default or empty DATABASE_PASSWORD.');
    }
    if (!dbUser) {
      errors.push('Production requires DATABASE_USER.');
    }
  }

  // 1.1 Database connection pool bounds validation
  const poolMax = env.database?.poolMax;
  if (poolMax !== undefined && (isNaN(poolMax) || poolMax < 1 || poolMax > 100)) {
    errors.push('DATABASE_POOL_MAX must be a valid integer between 1 and 100.');
  }
  const poolMin = env.database?.poolMin;
  if (poolMin !== undefined && (isNaN(poolMin) || poolMin < 0 || (typeof poolMax === 'number' && !isNaN(poolMax) && poolMin > poolMax))) {
    errors.push('DATABASE_POOL_MIN must be a non-negative integer less than or equal to DATABASE_POOL_MAX.');
  }

  // 2. Redis validation
  const hasRedisUrl = Boolean(process.env.REDIS_URL);
  const redisHost = process.env.REDIS_HOST || env.redis?.host;
  if (!hasRedisUrl && (!redisHost || redisHost === 'localhost')) {
    errors.push('Production requires REDIS_URL or remote REDIS_HOST (e.g., Memorystore IP).');
  }

  // 3. JWT secrets validation
  const jwtAccess = process.env.JWT_ACCESS_SECRET || env.jwt?.accessSecret;
  const jwtRefresh = process.env.JWT_REFRESH_SECRET || env.jwt?.refreshSecret;

  if (!jwtAccess || jwtAccess === 'default_access_secret_for_dev_only' || jwtAccess.length < 32) {
    errors.push('Production requires strong JWT_ACCESS_SECRET (min 32 chars, default dev secret forbidden).');
  }
  if (!jwtRefresh || jwtRefresh === 'default_refresh_secret_for_dev_only' || jwtRefresh.length < 32) {
    errors.push('Production requires strong JWT_REFRESH_SECRET (min 32 chars, default dev secret forbidden).');
  }

  // 4. Bootstrap Admin Password validation
  const bootstrapPass = process.env.BOOTSTRAP_ADMIN_PASSWORD || env.bootstrapAdmin?.password;
  if (bootstrapPass === 'AdminPass123!@#' || (bootstrapPass && bootstrapPass.length < 12)) {
    errors.push('Production BOOTSTRAP_ADMIN_PASSWORD cannot use default "AdminPass123!@#" and must be >= 12 chars.');
  }

  // 5. Cloudflare R2 Storage validation
  const storageDriver = process.env.STORAGE_DRIVER;
  if (storageDriver !== 'local') {
    const r2Account = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const r2Key = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const r2Secret = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    if (!r2Account || !r2Key || !r2Secret || r2Key === 'your_r2_access_key_id' || r2Secret === 'your_r2_secret_access_key') {
      errors.push('Production requires valid Cloudflare R2 credentials (ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY).');
    }
  }

  // 6. CORS / Frontend URL
  const frontendUrl = process.env.FRONTEND_URL || env.frontendUrl;
  if (!frontendUrl || frontendUrl.includes('localhost')) {
    errors.push('Production FRONTEND_URL must be specified and cannot point to localhost.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const envConfig = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const config = {
    nodeEnv,
    port: parseInt(process.env.PORT || process.env.API_PORT || '3000', 10),
    database: {
      url: process.env.DATABASE_URL,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      name: process.env.DATABASE_NAME || 'crm_db',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres_secret_dev',
      ssl: process.env.DATABASE_SSL === 'true',
      poolMax: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
      poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
      idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONN_TIMEOUT_MS || '5000', 10),
    },
    redis: {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      tls: process.env.REDIS_TLS === 'true',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret_for_dev_only',
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_for_dev_only',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
    bootstrapAdmin: {
      username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@crm.local',
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD || 'AdminPass123!@#',
      employeeCode: process.env.BOOTSTRAP_ADMIN_EMPLOYEE_CODE || 'EMP-ADMIN-001',
    },
    storage: {
      driver: process.env.STORAGE_DRIVER || (isProduction ? 'r2' : 'local'),
      r2: {
        accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID,
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        bucket: process.env.CLOUDFLARE_R2_BUCKET || 'crm-uploads',
        endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      },
    },
  };

  if (isProduction || process.env.STRICT_ENV_VALIDATION === 'true') {
    const validation = validateProductionEnv(config);
    if (!validation.isValid) {
      const formattedErrors = validation.errors.map((err) => `  - ${err}`).join('\n');
      const errorMessage = `\n==================================================\n🚨 [FATAL] PRODUCTION ENVIRONMENT HARDENING FAILED:\n==================================================\n${formattedErrors}\n\nTerminating application immediately (fail-fast rule).\n==================================================\n`;
      new Logger('EnvConfig').error(errorMessage);
      throw new Error('Production environment validation failed.');
    }
  }

  return config;
};
