import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QueueService } from '../queue.service';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { SendNotificationJobData } from '../queue.types';
import { NotificationsService } from '../../notifications/notifications.service';
import { KyselyService } from '../../../database/kysely.service';

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private worker!: Worker;

  constructor(
    private readonly queueService: QueueService,
    private readonly notificationsService: NotificationsService,
    private readonly kysely: KyselyService,
  ) {}

  onModuleInit() {
    const connection = this.queueService.getRedisConnectionOptions();
    this.worker = new Worker(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job: Job<SendNotificationJobData>) => {
        this.logger.log(`[NotificationWorker] Processing job ${job.id} (type: ${job.name}, attempt: ${job.attemptsMade + 1})`);
        
        if (job.name === JOB_TYPES.SEND_NOTIFICATION) {
          return await this.handleSendNotification(job);
        } else {
          this.logger.warn(`[NotificationWorker] Unknown job name: ${job.name}`);
        }
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[NotificationWorker] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`[NotificationWorker] Job ${job?.id} failed with error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('NotificationWorker closed');
    }
  }

  private async handleSendNotification(job: Job<SendNotificationJobData>) {
    const { employeeId, eventType, title, content, deepLinkUrl, entityType, entityId } = job.data;

    // Verify recipient exists and is ACTIVE
    const employee = await this.kysely.db
      .selectFrom('employees')
      .select(['id', 'status'])
      .where('id', '=', employeeId as any)
      .executeTakeFirst();

    if (!employee) {
      this.logger.warn(`[NotificationWorker] Recipient employee ${employeeId} does not exist. Discarding job.`);
      return { skipped: true, reason: 'EMPLOYEE_NOT_FOUND' };
    }

    if (employee.status !== 'ACTIVE') {
      this.logger.warn(`[NotificationWorker] Recipient employee ${employeeId} is inactive. Skipping notification.`);
      return { skipped: true, reason: 'EMPLOYEE_INACTIVE' };
    }

    // Deliver notification with idempotent flag
    const result = await this.notificationsService.createNotification({
      employeeId,
      eventType,
      title,
      content,
      deepLinkUrl,
      entityType,
      entityId,
      idempotent: true,
    });

    return { delivered: true, notificationId: result.id };
  }
}
