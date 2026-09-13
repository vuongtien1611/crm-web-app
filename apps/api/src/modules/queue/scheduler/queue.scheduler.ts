import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { QueueService } from '../queue.service';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';

@Injectable()
export class QueueScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueueScheduler.name);

  constructor(private readonly queueService: QueueService) {}

  async onModuleInit() {
    // Only register automated cron schedules in non-test runtime
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    await this.registerRepeatableJobs();
  }

  /**
   * Registers BullMQ repeatable jobs using Redis-backed distributed scheduling.
   * Multi-instance Cloud Run containers will safely deduplicate execution.
   */
  async registerRepeatableJobs() {
    try {
      const remindersQueue = this.queueService.getQueue(QUEUE_NAMES.REMINDERS);

      // 1. Installment overdue check:
      // Note: SCHEDULER EXECUTION TIME = CONFIGURATION / OPEN (Default 01:00 AM is non-canonical configuration)
      const cronOverdue = process.env.CRON_OVERDUE_DETECTION || '0 1 * * *';
      await remindersQueue.add(
        JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS,
        { jobType: 'detect-overdue-installments' },
        {
          jobId: 'repeat_detect-overdue-installments',
          repeat: { pattern: cronOverdue },
        },
      );
      this.logger.log(`Repeatable overdue check scheduled with cron=${cronOverdue}`);

      // 2. Service period reminder:
      // REMINDER LEAD TIME = OPEN BUSINESS RULE (Must not assume 3 days)
      const configuredLeadDays = process.env.REMINDER_LEAD_DAYS ? parseInt(process.env.REMINDER_LEAD_DAYS, 10) : undefined;
      if (configuredLeadDays && configuredLeadDays > 0) {
        const cronServicePeriod = process.env.CRON_SERVICE_PERIOD_REMINDER || '0 7 * * *';
        await remindersQueue.add(
          JOB_TYPES.SERVICE_PERIOD_REMINDER,
          { jobType: 'service-period-reminder', leadDays: configuredLeadDays },
          {
            jobId: 'repeat_service-period-reminder',
            repeat: { pattern: cronServicePeriod },
          },
        );
        this.logger.log(`Repeatable service period reminder scheduled with leadDays=${configuredLeadDays}`);
      } else {
        this.logger.log(
          'Service period reminder NOT scheduled: REMINDER LEAD TIME = OPEN BUSINESS RULE (waiting for user configuration via REMINDER_LEAD_DAYS)',
        );
      }

      // 3. Daily report reminder:
      // DAILY REPORT REMINDER SCHEDULE = OPEN BUSINESS RULE (User has not confirmed 17:30 Mon-Fri)
      const cronDailyReport = process.env.CRON_DAILY_REPORT_REMINDER;
      if (cronDailyReport) {
        await remindersQueue.add(
          JOB_TYPES.DAILY_REPORT_REMINDER,
          { jobType: 'daily-report-reminder' },
          {
            jobId: 'repeat_daily-report-reminder',
            repeat: { pattern: cronDailyReport },
          },
        );
        this.logger.log(`Repeatable daily report reminder scheduled with cron=${cronDailyReport}`);
      } else {
        this.logger.log(
          'Daily report reminder NOT scheduled: DAILY REPORT REMINDER SCHEDULE = OPEN BUSINESS RULE (waiting for user configuration via CRON_DAILY_REPORT_REMINDER)',
        );
      }

      this.logger.log('BullMQ Repeatable jobs registered successfully');
    } catch (err: any) {
      this.logger.error(`Failed to register repeatable jobs: ${err.message}`, err.stack);
    }
  }
}
