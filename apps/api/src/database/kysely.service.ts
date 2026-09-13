import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

@Injectable()
export class KyselyService implements OnModuleInit, OnModuleDestroy {
  public db!: Kysely<any>;
  private pool!: Pool;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const dbConfig = this.configService.get('database');
    const poolConfig: any = dbConfig.url
      ? { connectionString: dbConfig.url }
      : {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.name,
          user: dbConfig.user,
          password: dbConfig.password,
        };

    this.pool = new Pool({
      ...poolConfig,
      ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.db = new Kysely<any>({
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
