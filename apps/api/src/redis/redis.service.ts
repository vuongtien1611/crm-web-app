import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisConfig = this.configService.get('redis') || {};
    if (redisConfig.url) {
      this.client = new Redis(redisConfig.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        tls: redisConfig.tls ? {} : undefined,
      });
    } else {
      this.client = new Redis({
        host: redisConfig.host || 'localhost',
        port: redisConfig.port || 6379,
        password: redisConfig.password,
        tls: redisConfig.tls ? {} : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      if (this.client.status !== 'ready') {
        await this.client.connect();
      }
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}
