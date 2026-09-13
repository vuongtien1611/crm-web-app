import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { QueueService } from '../queue.service';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import {
  DetectOverdueInstallmentsJobData,
  ServicePeriodReminderJobData,
  DailyReportReminderJobData,
} from '../queue.types';
import { NotificationsService } from '../../notifications/notifications.service';
import { KyselyService } from '../../../database/kysely.service';
import { sql } from 'kysely';

@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderWorker.name);
  private worker!: Worker;

  constructor(
    private readonly queueService: QueueService,
    private readonly notificationsService: NotificationsService,
    private readonly kysely: KyselyService,
  ) {}

  onModuleInit() {
    const connection = this.queueService.getRedisConnectionOptions();
    this.worker = new Worker(
      QUEUE_NAMES.REMINDERS,
      async (job: Job) => {
        this.logger.log(`[ReminderWorker] Processing job ${job.id} (type: ${job.name}, attempt: ${job.attemptsMade + 1})`);

        switch (job.name) {
          case JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS:
            return await this.handleDetectOverdueInstallments(job as Job<DetectOverdueInstallmentsJobData>);
          case JOB_TYPES.SERVICE_PERIOD_REMINDER:
            return await this.handleServicePeriodReminder(job as Job<ServicePeriodReminderJobData>);
          case JOB_TYPES.DAILY_REPORT_REMINDER:
            return await this.handleDailyReportReminder(job as Job<DailyReportReminderJobData>);
          default:
            this.logger.warn(`[ReminderWorker] Unknown job name: ${job.name}`);
        }
      },
      {
        connection,
        concurrency: 3,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`[ReminderWorker] Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`[ReminderWorker] Job ${job?.id} failed with error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
      this.logger.log('ReminderWorker closed');
    }
  }

  /**
   * Detects overdue installments:
   * Condition: due_date < asOfDate AND status IN ('PENDING', 'PARTIALLY_PAID') AND outstanding amount > 0
   */
  async handleDetectOverdueInstallments(job: Job<DetectOverdueInstallmentsJobData>) {
    const asOfDate = job.data.asOfDate || new Date().toISOString().split('T')[0];
    this.logger.log(`[ReminderWorker] Scanning overdue installments as of ${asOfDate}`);

    const candidates = await this.kysely.db
      .selectFrom('payment_installments as pi')
      .selectAll('pi')
      .where('pi.due_date', '<', asOfDate as any)
      .where('pi.status', 'in', ['PENDING', 'PARTIALLY_PAID'])
      .execute();

    let updatedCount = 0;
    for (const inst of candidates) {
      // Calculate confirmed allocations
      const allocation = await this.kysely.db
        .selectFrom('payment_allocations as pa')
        .innerJoin('payments as p', 'p.id', 'pa.payment_id')
        .where('pa.installment_id', '=', inst.id)
        .where('p.status', '=', 'CONFIRMED')
        .select((eb) => eb.fn.sum<number>('pa.gross_allocated_amount').as('sumPaid'))
        .executeTakeFirst();

      const totalPaid = Number(allocation?.sumPaid || 0);
      const grossDue = Number(inst.gross_amount_due);

      if (totalPaid < grossDue) {
        // Mark OVERDUE in database
        await this.kysely.db
          .updateTable('payment_installments')
          .set({ status: 'OVERDUE' })
          .where('id', '=', inst.id)
          .execute();

        updatedCount++;

        // Notify Accountant roles
        await this.notificationsService.notifyRoles(['ACCOUNTANT', 'BOSS'], {
          eventType: 'INSTALLMENT_OVERDUE',
          title: `Đợt thanh toán #${inst.installment_number} quá hạn`,
          content: `Đợt thanh toán #${inst.installment_number} số tiền ${grossDue.toLocaleString()} VND (đã thanh toán ${totalPaid.toLocaleString()} VND) đã quá hạn từ ngày ${inst.due_date}.`,
          entityType: 'payment_installments',
          entityId: inst.id,
          idempotent: true,
        });
      }
    }

    this.logger.log(`[ReminderWorker] Updated ${updatedCount} overdue installments as of ${asOfDate}`);
    return { scanned: candidates.length, updatedOverdue: updatedCount };
  }

  /**
   * Service Period Ending Reminder:
   * Detects service periods ending within leadDays window.
   */
  async handleServicePeriodReminder(job: Job<ServicePeriodReminderJobData>) {
    const configuredLead = job.data.leadDays || (process.env.REMINDER_LEAD_DAYS ? parseInt(process.env.REMINDER_LEAD_DAYS, 10) : undefined);
    if (!configuredLead || isNaN(configuredLead) || configuredLead <= 0) {
      this.logger.warn(
        '[ReminderWorker] Service period reminder skipped: REMINDER LEAD TIME = OPEN BUSINESS RULE (leadDays is not configured by user)',
      );
      return { skipped: true, reason: 'REMINDER_LEAD_TIME_OPEN' };
    }

    const leadDays = configuredLead;
    const asOfDate = job.data.asOfDate || new Date().toISOString().split('T')[0];

    const periods = await this.kysely.db
      .selectFrom('service_periods as sp')
      .selectAll('sp')
      .where('sp.end_date', '>=', asOfDate as any)
      .where(sql<boolean>`sp.end_date <= (${asOfDate}::DATE + INTERVAL '${sql.raw(String(leadDays))} days')`)
      .where('sp.execution_status', 'in', ['PENDING', 'IN_PROGRESS'])
      .execute();

    let notifiedCount = 0;
    for (const period of periods) {
      // Find active primary assignees
      const assignments = await this.kysely.db
        .selectFrom('service_period_assignments')
        .select(['employee_id'])
        .where('service_period_id', '=', period.id)
        .where('is_active', '=', true)
        .execute();

      for (const assign of assignments) {
        await this.notificationsService.createNotification({
          employeeId: assign.employee_id,
          eventType: 'SERVICE_PERIOD_ENDING_SOON',
          title: `Kỳ dịch vụ #${period.period_index} sắp kết thúc`,
          content: `Kỳ dịch vụ #${period.period_index} sẽ kết thúc vào ngày ${period.end_date}. Vui lòng kiểm tra tiến độ thực hiện.`,
          entityType: 'service_periods',
          entityId: period.id,
          idempotent: true,
        });
        notifiedCount++;
      }
    }

    return { periodsScanned: periods.length, notificationsSent: notifiedCount };
  }

  /**
   * Daily Report Missing Reminder:
   * Reminds active employees who have not submitted daily report for reportDate.
   */
  async handleDailyReportReminder(job: Job<DailyReportReminderJobData>) {
    const reportDate = job.data.reportDate || new Date().toISOString().split('T')[0];

    // Find all active employees who must submit daily reports (DEV, SEO, SALE)
    const employees = await this.kysely.db
      .selectFrom('employees as e')
      .innerJoin('users as u', 'u.id', 'e.user_id')
      .innerJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('e.id')
      .where('e.status', '=', 'ACTIVE')
      .where('r.code', 'in', ['DEV', 'SEO', 'SALE', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER', 'SALES_TEAM_LEADER'])
      .distinct()
      .execute();

    // Find employees who already submitted
    const submitted = await this.kysely.db
      .selectFrom('daily_reports')
      .select('employee_id')
      .where('report_date', '=', reportDate as any)
      .execute();

    const submittedSet = new Set(submitted.map((s) => String(s.employee_id)));
    const missingEmployees = employees.filter((e) => !submittedSet.has(String(e.id)));

    let sentCount = 0;
    for (const emp of missingEmployees) {
      await this.notificationsService.createNotification({
        employeeId: emp.id,
        eventType: 'DAILY_REPORT_MISSING',
        title: 'Nhắc nhở nộp báo cáo ngày',
        content: `Bạn chưa hoàn thành báo cáo ngày cho ngày ${reportDate}. Vui lòng nộp báo cáo trước khi kết thúc ca làm việc.`,
        entityType: 'daily_reports',
        entityId: emp.id,
        deepLinkUrl: '/daily-reports',
        idempotent: true,
      });
      sentCount++;
    }

    return { totalEligible: employees.length, missing: missingEmployees.length, sentCount };
  }
}
