import { Injectable, Logger } from '@nestjs/common';
import { QueueService } from './queue.service';
import {
  QUEUE_NAMES,
  JOB_TYPES,
  DEFAULT_RETRY_OPTIONS,
} from './queue.constants';
import {
  SendNotificationJobData,
  DetectOverdueInstallmentsJobData,
  ServicePeriodReminderJobData,
  DailyReportReminderJobData,
  RetryStorageCleanupJobData,
} from './queue.types';
import { JobsOptions } from 'bullmq';

@Injectable()
export class QueueProducer {
  private readonly logger = new Logger(QueueProducer.name);

  constructor(private readonly queueService: QueueService) {}

  /**
   * Enqueue a notification delivery job with deterministic jobId for idempotency.
   */
  async enqueueNotification(
    data: Omit<SendNotificationJobData, 'jobType'>,
    options?: Partial<JobsOptions>,
  ): Promise<string | null> {
    try {
      const queue = this.queueService.getQueue(QUEUE_NAMES.NOTIFICATIONS);
      const payload: SendNotificationJobData = {
        ...data,
        jobType: 'send-notification',
        createdAt: new Date().toISOString(),
      };

      // Deterministic jobId: notification_employeeId_eventType_entityType_entityId
      const jobId =
        options?.jobId ||
        `notification_${data.employeeId}_${data.eventType}_${data.entityType || 'none'}_${data.entityId || 'none'}`;

      const jobOptions: JobsOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options,
        jobId,
      };

      const job = await queue.add(JOB_TYPES.SEND_NOTIFICATION, payload, jobOptions);
      this.logger.log(`Enqueued notification job: ${job.id} for employee ${data.employeeId}`);
      return job.id || null;
    } catch (err: any) {
      this.logger.error(`[QUEUE PRODUCER ERROR] Failed to enqueue notification: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Enqueue installment overdue detection job.
   */
  async enqueueOverdueDetection(
    data?: Partial<DetectOverdueInstallmentsJobData>,
    options?: Partial<JobsOptions>,
  ): Promise<string | null> {
    try {
      const queue = this.queueService.getQueue(QUEUE_NAMES.REMINDERS);
      const asOfDate = data?.asOfDate || new Date().toISOString().split('T')[0];
      const payload: DetectOverdueInstallmentsJobData = {
        jobType: 'detect-overdue-installments',
        asOfDate,
        createdAt: new Date().toISOString(),
      };

      const jobId = options?.jobId || `installment-overdue_${asOfDate}`;
      const jobOptions: JobsOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options,
        jobId,
      };

      const job = await queue.add(JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS, payload, jobOptions);
      this.logger.log(`Enqueued overdue detection job: ${job.id}`);
      return job.id || null;
    } catch (err: any) {
      this.logger.error(`[QUEUE PRODUCER ERROR] Failed to enqueue overdue detection: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Enqueue service period reminder job.
   */
  async enqueueServicePeriodReminder(
    data?: Partial<ServicePeriodReminderJobData>,
    options?: Partial<JobsOptions>,
  ): Promise<string | null> {
    try {
      const queue = this.queueService.getQueue(QUEUE_NAMES.REMINDERS);
      const asOfDate = data?.asOfDate || new Date().toISOString().split('T')[0];
      const payload: ServicePeriodReminderJobData = {
        jobType: 'service-period-reminder',
        leadDays: data?.leadDays || (process.env.REMINDER_LEAD_DAYS ? parseInt(process.env.REMINDER_LEAD_DAYS, 10) : undefined),
        asOfDate,
        createdAt: new Date().toISOString(),
      };

      const jobId = options?.jobId || `service-period-reminder_${asOfDate}`;
      const jobOptions: JobsOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options,
        jobId,
      };

      const job = await queue.add(JOB_TYPES.SERVICE_PERIOD_REMINDER, payload, jobOptions);
      this.logger.log(`Enqueued service period reminder job: ${job.id}`);
      return job.id || null;
    } catch (err: any) {
      this.logger.error(`[QUEUE PRODUCER ERROR] Failed to enqueue service period reminder: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Enqueue daily report reminder job.
   */
  async enqueueDailyReportReminder(
    data?: Partial<DailyReportReminderJobData>,
    options?: Partial<JobsOptions>,
  ): Promise<string | null> {
    try {
      const queue = this.queueService.getQueue(QUEUE_NAMES.REMINDERS);
      const reportDate = data?.reportDate || new Date().toISOString().split('T')[0];
      const payload: DailyReportReminderJobData = {
        jobType: 'daily-report-reminder',
        reportDate,
        createdAt: new Date().toISOString(),
      };

      const jobId = options?.jobId || `daily-report-reminder_${reportDate}`;
      const jobOptions: JobsOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options,
        jobId,
      };

      const job = await queue.add(JOB_TYPES.DAILY_REPORT_REMINDER, payload, jobOptions);
      this.logger.log(`Enqueued daily report reminder job: ${job.id}`);
      return job.id || null;
    } catch (err: any) {
      this.logger.error(`[QUEUE PRODUCER ERROR] Failed to enqueue daily report reminder: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Enqueue failed storage cleanup retry job.
   */
  async enqueueStorageCleanupRetry(
    data: Omit<RetryStorageCleanupJobData, 'jobType'>,
    options?: Partial<JobsOptions>,
  ): Promise<string | null> {
    try {
      const queue = this.queueService.getQueue(QUEUE_NAMES.MAINTENANCE);
      const payload: RetryStorageCleanupJobData = {
        ...data,
        jobType: 'retry-storage-cleanup',
        createdAt: new Date().toISOString(),
      };

      const safeKey = data.objectKey.replace(/[^a-zA-Z0-9_-]/g, '_');
      const jobId = options?.jobId || `storage-cleanup_${safeKey}`;
      const jobOptions: JobsOptions = {
        ...DEFAULT_RETRY_OPTIONS,
        ...options,
        jobId,
      };

      const job = await queue.add(JOB_TYPES.RETRY_STORAGE_CLEANUP, payload, jobOptions);
      this.logger.log(`Enqueued storage cleanup retry job: ${job.id} for key ${data.objectKey}`);
      return job.id || null;
    } catch (err: any) {
      this.logger.error(`[QUEUE PRODUCER ERROR] Failed to enqueue storage cleanup: ${err.message}`, err.stack);
      return null;
    }
  }
}
