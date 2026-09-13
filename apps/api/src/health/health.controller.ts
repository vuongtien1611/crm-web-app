import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { KyselyService } from '../database/kysely.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../modules/auth/decorators/public.decorator';

@Controller()
export class HealthController {
  constructor(
    private readonly kyselyService: KyselyService,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get('health')
  async getHealth(@Res({ passthrough: true }) res: FastifyReply) {
    const dbHealthy = await this.kyselyService.checkHealth();
    const redisHealthy = await this.redisService.checkHealth();

    const isOk = dbHealthy && redisHealthy;
    if (!isOk) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    const mem = process.memoryUsage();

    return {
      status: isOk ? 'ok' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      redis: redisHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      },
    };
  }

  @Public()
  @Get('healthz')
  getLiveness() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) res: FastifyReply) {
    return this.getHealth(res);
  }
}
