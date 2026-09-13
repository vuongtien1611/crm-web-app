import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueOptions } from 'bullmq';
import { QUEUE_NAMES, QueueName } from './queue.constants';
import { QueueMetrics } from './queue.types';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queues: Map<QueueName, Queue> = new Map();
  private redisConnectionOptions: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisConfig = this.configService.get('redis') || {};
    this.redisConnectionOptions = redisConfig.url
      ? {
          url: redisConfig.url,
          maxRetriesPerRequest: null,
          tls: redisConfig.tls ? {} : undefined,
        }
      : {
          host: redisConfig.host || process.env.REDIS_HOST || 'localhost',
          port: redisConfig.port || parseInt(process.env.REDIS_PORT || '6379', 10),
          password: redisConfig.password || process.env.REDIS_PASSWORD || undefined,
          tls: redisConfig.tls ? {} : undefined,
          maxRetriesPerRequest: null,
        };

    const queueOptions: QueueOptions = {
      connection: this.redisConnectionOptions,
    };

    for (const queueName of Object.values(QUEUE_NAMES)) {
      try {
        const queue = new Queue(queueName, queueOptions);
        this.queues.set(queueName, queue);
        this.logger.log(`BullMQ Queue registered: ${queueName}`);
      } catch (err) {
        this.logger.error(`Failed to register BullMQ queue ${queueName}`, err);
      }
    }
  }

  async onModuleDestroy() {
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
        this.logger.log(`BullMQ Queue closed: ${name}`);
      } catch (err) {
        this.logger.error(`Error closing queue ${name}`, err);
      }
    }
    this.queues.clear();
  }

  getQueue(name: QueueName): Queue {
    const q = this.queues.get(name);
    if (!q) {
      throw new Error(`Queue ${name} is not initialized`);
    }
    return q;
  }

  getRedisConnectionOptions() {
    return this.redisConnectionOptions;
  }

  async getQueueMetrics(): Promise<QueueMetrics[]> {
    const metrics: QueueMetrics[] = [];
    for (const [name, queue] of this.queues.entries()) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
        const isPaused = await queue.isPaused();
        metrics.push({
          queueName: name,
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
          paused: isPaused,
        });
      } catch (err) {
        this.logger.error(`Failed to get metrics for queue ${name}`, err);
      }
    }
    return metrics;
  }

  async cleanOldJobs(name: QueueName, graceMs: number = 24 * 3600 * 1000): Promise<number> {
    const queue = this.getQueue(name);
    const cleaned = await queue.clean(graceMs, 1000, 'completed');
    return cleaned.length;
  }
}
