import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect, Transaction } from 'kysely';
import { Pool, PoolConfig } from 'pg';

/**
 * Shared dynamic Kysely schema bridge until full generated DB table interfaces
 * (kysely-codegen) are adopted across all modules (AUD-016).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CrmDynamicRow = Record<string, any>;
export type CrmDatabase = Record<string, CrmDynamicRow>;
export type CrmTransaction = Transaction<CrmDatabase>;

@Injectable()
export class KyselyService implements OnModuleInit, OnModuleDestroy {
  public db!: Kysely<CrmDatabase>;
  private pool!: Pool;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const dbConfig = this.configService.get('database');
    const poolConfig: PoolConfig = dbConfig.url
      ? { connectionString: dbConfig.url }
      : {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.name,
          user: dbConfig.user,
          password: dbConfig.password,
        };

    const rawMax = Number(dbConfig.poolMax ?? process.env.DATABASE_POOL_MAX ?? 20);
    const rawMin = Number(dbConfig.poolMin ?? process.env.DATABASE_POOL_MIN ?? 2);
    const idleTimeoutMillis = Number(dbConfig.idleTimeoutMillis ?? process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? 30000);
    const connectionTimeoutMillis = Number(dbConfig.connectionTimeoutMillis ?? process.env.DATABASE_POOL_CONN_TIMEOUT_MS ?? 5000);

    const max = isNaN(rawMax) || rawMax < 1 ? 20 : Math.min(Math.max(1, rawMax), 100);
    const min = isNaN(rawMin) || rawMin < 0 ? 2 : Math.min(rawMin, max);

    this.pool = new Pool({
      ...poolConfig,
      ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
      max,
      min,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    });

    this.db = new Kysely<CrmDatabase>({
      dialect: new PostgresDialect({
        pool: this.pool,
      }),
    });
  }

  async onModuleDestroy() {
    if (this.db) {
      await this.db.destroy();
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
