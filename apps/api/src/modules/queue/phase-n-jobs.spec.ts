import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { QueueService } from './queue.service';
import { QueueProducer } from './queue.producer';
import { NotificationWorker } from './workers/notification.worker';
import { ReminderWorker } from './workers/reminder.worker';
import { MaintenanceWorker } from './workers/maintenance.worker';
import { StorageService } from '../storage/storage.service';
import { KyselyService } from '../../database/kysely.service';
import { QUEUE_NAMES, JOB_TYPES } from './queue.constants';
import { Worker, Job, Queue } from 'bullmq';

function assert(condition: boolean, message: string, detail?: any) {
  if (!condition) {
    const d = detail ? ` (Detail: ${JSON.stringify(detail)})` : '';
    throw new Error(`Assertion Failed: ${message}${d}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhaseNJobsSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE N: BULLMQ & BACKGROUND JOBS SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const queueService = app.get<QueueService>(QueueService);
  const queueProducer = app.get<QueueProducer>(QueueProducer);
  const notificationWorker = app.get<NotificationWorker>(NotificationWorker);
  const reminderWorker = app.get<ReminderWorker>(ReminderWorker);
  const maintenanceWorker = app.get<MaintenanceWorker>(MaintenanceWorker);
  const storageService = app.get<StorageService>(StorageService);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    console.log('--- Setting up test fixtures ---');
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const posDev = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    const posId = posDev ? posDev.id : (1 as any);

    // 1. Dev User & Employee
    const [devUser] = await db
      .insertInto('users')
      .values({ username: `dev_n_${runId}`, password_hash: 'hash', email: `dev_n_${runId}@test.com` })
      .returningAll()
      .execute();
    const [devEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DEV-N-${runId}`, full_name: `Dev User N ${runId}`, position_id: posId, user_id: devUser.id, status: 'ACTIVE' })
      .returningAll()
      .execute();
    const devRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    if (devRole) {
      await db.insertInto('user_roles').values({ user_id: devUser.id, role_id: devRole.id }).execute();
    }

    // 2. Accountant User & Employee
    const [accUser] = await db
      .insertInto('users')
      .values({ username: `acc_n_${runId}`, password_hash: 'hash', email: `acc_n_${runId}@test.com` })
      .returningAll()
      .execute();
    const [accEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-ACC-N-${runId}`, full_name: `Acc User N ${runId}`, position_id: posId, user_id: accUser.id, status: 'ACTIVE' })
      .returningAll()
      .execute();
    const accRole = await db.selectFrom('roles').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirst();
    if (accRole) {
      await db.insertInto('user_roles').values({ user_id: accUser.id, role_id: accRole.id }).execute();
    }

    // 3. Inactive Employee for isolation tests
    const [inactUser] = await db
      .insertInto('users')
      .values({ username: `inact_n_${runId}`, password_hash: 'hash', email: `inact_n_${runId}@test.com` })
      .returningAll()
      .execute();
    const [inactEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-INACT-N-${runId}`, full_name: `Inactive User N ${runId}`, position_id: posId, user_id: inactUser.id, status: 'TERMINATED' })
      .returningAll()
      .execute();

    console.log('--- Test fixtures ready ---');

    // =========================================================================
    // BQ-01: Enqueue Job
    // =========================================================================
    console.log('\n--- BQ-01: Enqueue Job Successfully ---');
    const jobId1 = await queueProducer.enqueueNotification({
      employeeId: devEmp.id,
      eventType: 'TASK_ASSIGNED',
      title: 'Task mới được giao',
      content: 'Bạn được phân công làm task #101',
      entityType: 'project_tasks',
      entityId: 101,
    });
    assert(!!jobId1, 'BQ-01: Job enqueued successfully and returned valid job ID');
    
    const notifQueue = queueService.getQueue(QUEUE_NAMES.NOTIFICATIONS);
    const queuedJob = await notifQueue.getJob(jobId1!);
    assert(!!queuedJob, 'BQ-01: Job exists in BullMQ notifications queue');
    assert(queuedJob?.name === JOB_TYPES.SEND_NOTIFICATION, 'BQ-01: Correct job type registered');

    // =========================================================================
    // BQ-02: Worker Process Job Successfully
    // =========================================================================
    console.log('\n--- BQ-02: Worker Process Job Successfully ---');
    // Wait for worker to pick up and process job
    let completed = false;
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const j = await notifQueue.getJob(jobId1!);
      if (j && (await j.isCompleted())) {
        completed = true;
        break;
      }
    }
    assert(completed, 'BQ-02: Worker processed job and marked as completed');

    // Verify DB in-app notification created
    const notifRecord = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'TASK_ASSIGNED')
      .where('entity_id', '=', 101 as any)
      .executeTakeFirst();
    assert(!!notifRecord, 'BQ-02: In-app notification record successfully persisted in PostgreSQL');
    assert(notifRecord?.title === 'Task mới được giao', 'BQ-02: Notification content matches job payload');

    // =========================================================================
    // BQ-03: Job Fail -> Retry With Backoff
    // =========================================================================
    console.log('\n--- BQ-03: Job Fail -> Retry with Exponential Backoff ---');
    const testQueueName = `test-retry-queue-${runId}`;
    const testQueue = new Queue(testQueueName, { connection: queueService.getRedisConnectionOptions() });

    let attemptsObserved = 0;
    const retryWorker = new Worker(
      testQueueName,
      async (job) => {
        attemptsObserved++;
        if (attemptsObserved < 2) {
          throw new Error('Simulated transient network failure');
        }
        return { success: true };
      },
      { connection: queueService.getRedisConnectionOptions() },
    );

    const retryJob = await testQueue.add(
      'retry-test',
      { data: 'retry-payload' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 100 },
      },
    );

    // Wait for retry to succeed
    let retrySucceeded = false;
    for (let i = 0; i < 25; i++) {
      await sleep(150);
      if (await retryJob.isCompleted()) {
        retrySucceeded = true;
        break;
      }
    }

    assert(attemptsObserved >= 2, 'BQ-03: Job failed on attempt 1 and was retried');
    assert(retrySucceeded, 'BQ-03: Job succeeded on subsequent retry attempt');
    await retryWorker.close();
    await testQueue.close();

    // =========================================================================
    // BQ-04: Max Attempts Exhaustion -> Failed State
    // =========================================================================
    console.log('\n--- BQ-04: Max Attempts Exhaustion -> Failed State ---');
    const testFailQueueName = `test-fail-queue-${runId}`;
    const testFailQueue = new Queue(testFailQueueName, { connection: queueService.getRedisConnectionOptions() });

    let failAttempts = 0;
    const failWorker = new Worker(
      testFailQueueName,
      async (job) => {
        failAttempts++;
        throw new Error('Permanent poison error');
      },
      { connection: queueService.getRedisConnectionOptions() },
    );

    const failJob = await testFailQueue.add(
      'permanent-fail-test',
      { data: 'poison' },
      {
        attempts: 2,
        backoff: { type: 'fixed', delay: 50 },
      },
    );

    let reachedFailedState = false;
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      if (await failJob.isFailed()) {
        reachedFailedState = true;
        break;
      }
    }

    assert(failAttempts === 2, 'BQ-04: Worker attempted job exact max attempts (2)');
    assert(reachedFailedState, 'BQ-04: Job moved to failed state after exhausting max attempts');
    await failWorker.close();
    await testFailQueue.close();

    // =========================================================================
    // BQ-05: Deduplication via Deterministic JobId
    // =========================================================================
    console.log('\n--- BQ-05: Deduplication via Deterministic JobId ---');
    const fixedJobId = `notif_dedupe_${runId}`;
    const enqueuedFirst = await queueProducer.enqueueNotification(
      {
        employeeId: devEmp.id,
        eventType: 'DEDUPE_TEST',
        title: 'Dedupe Test Title',
        content: 'Dedupe Content',
      },
      { jobId: fixedJobId },
    );

    // Wait a brief moment, then enqueue with EXACT same jobId
    const enqueuedSecond = await queueProducer.enqueueNotification(
      {
        employeeId: devEmp.id,
        eventType: 'DEDUPE_TEST',
        title: 'Dedupe Test Title',
        content: 'Dedupe Content',
      },
      { jobId: fixedJobId },
    );

    assert(enqueuedFirst === fixedJobId, 'BQ-05: First enqueue succeeded with deterministic ID');
    assert(enqueuedSecond === fixedJobId, 'BQ-05: Second enqueue returned existing job ID');

    // Wait for execution and verify DB has only 1 record
    await sleep(600);
    const dedupeRecords = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'DEDUPE_TEST')
      .execute();
    assert(dedupeRecords.length === 1, 'BQ-05: Exactly 1 notification created in DB (no duplicate side effect)');

    // =========================================================================
    // BQ-06: Worker Crash / Retry Does Not Corrupt Business State
    // =========================================================================
    console.log('\n--- BQ-06: Worker Re-execution Does Not Corrupt State ---');
    // Directly call worker handler multiple times with identical payload
    const mockJob: any = {
      name: JOB_TYPES.SEND_NOTIFICATION,
      data: {
        employeeId: devEmp.id,
        eventType: 'RE_EXEC_TEST',
        title: 'Re-exec Title',
        content: 'Re-exec Content',
      },
    };

    await (notificationWorker as any).handleSendNotification(mockJob);
    await (notificationWorker as any).handleSendNotification(mockJob);

    const reExecRecords = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'RE_EXEC_TEST')
      .execute();
    assert(reExecRecords.length === 1, 'BQ-06: Repeated job handler execution preserved idempotent single notification');

    // =========================================================================
    // BQ-07: Redis Unavailable Resilience
    // =========================================================================
    console.log('\n--- BQ-07: Redis Failure Handled Gracefully ---');
    // Enqueue with invalid queue or broken connection simulation
    const brokenQueueProducer = new QueueProducer({
      getQueue: () => {
        throw new Error('Connection refused to Redis');
      },
    } as any);

    const resultWhenRedisDown = await brokenQueueProducer.enqueueNotification({
      employeeId: devEmp.id,
      eventType: 'FAIL_TEST',
      title: 'Title',
      content: 'Content',
    });
    assert(resultWhenRedisDown === null, 'BQ-07: Redis error caught gracefully and returned null (no unhandled crash)');

    // =========================================================================
    // BQ-08: Repeatable Job Deduplication
    // =========================================================================
    console.log('\n--- BQ-08: Repeatable / Scheduled Job Deduplication ---');
    const remindersQueue = queueService.getQueue(QUEUE_NAMES.REMINDERS);
    
    // Add repeatable job twice
    await remindersQueue.add(
      JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS,
      { jobType: 'detect-overdue-installments' },
      {
        jobId: `repeat_test-overdue-${runId}`,
        repeat: { pattern: '0 2 * * *' },
      },
    );
    await remindersQueue.add(
      JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS,
      { jobType: 'detect-overdue-installments' },
      {
        jobId: `repeat_test-overdue-${runId}`,
        repeat: { pattern: '0 2 * * *' },
      },
    );

    const repeatableJobs = await remindersQueue.getRepeatableJobs();
    const matchingJobs = repeatableJobs.filter((r) => r.name === JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS && r.pattern === '0 2 * * *');
    assert(matchingJobs.length === 1, 'BQ-08: BullMQ repeatable scheduler registered exactly 1 recurring schedule (no duplicate)');

    // Clean up test repeatable job
    if (matchingJobs.length > 0) {
      await remindersQueue.removeRepeatableByKey(matchingJobs[0].key);
    }

    // =========================================================================
    // BQ-09: Recipient Isolation & Inactive Employee Handling
    // =========================================================================
    console.log('\n--- BQ-09: Recipient Isolation & Inactive Handling ---');
    const inactiveJob: any = {
      name: JOB_TYPES.SEND_NOTIFICATION,
      data: {
        employeeId: inactEmp.id,
        eventType: 'INACTIVE_TEST',
        title: 'Title',
        content: 'Content',
      },
    };
    const inactResult = await (notificationWorker as any).handleSendNotification(inactiveJob);
    assert(inactResult?.skipped === true && inactResult?.reason === 'EMPLOYEE_INACTIVE', 'BQ-09: Inactive employee notification was safely skipped');

    const nonExistentJob: any = {
      name: JOB_TYPES.SEND_NOTIFICATION,
      data: {
        employeeId: 9999999,
        eventType: 'GHOST_TEST',
        title: 'Title',
        content: 'Content',
      },
    };
    const ghostResult = await (notificationWorker as any).handleSendNotification(nonExistentJob);
    assert(ghostResult?.skipped === true && ghostResult?.reason === 'EMPLOYEE_NOT_FOUND', 'BQ-09: Non-existent employee notification was safely skipped without leaking');

    // =========================================================================
    // BQ-10: Storage Cleanup Safety
    // =========================================================================
    console.log('\n--- BQ-10: Storage Cleanup Active Reference Safety ---');
    // Upload a test file to storage
    const validUpload = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 901,
      filename: 'active_proof.pdf',
      buffer: Buffer.from('%PDF-1.4 active proof content'),
      claimedMimeType: 'application/pdf',
    });

    // Create active reference in payments table
    await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-SAFETY-${runId}`,
        gross_cash_amount: 1000000,
        payment_method: 'BANK_TRANSFER',
        evidence_url: validUpload.objectKey,
        created_by_employee_id: devEmp.id,
        status: 'PENDING_CONFIRMATION',
      })
      .execute();

    // Attempt maintenance cleanup on actively referenced object
    const cleanupJobActive: any = {
      name: JOB_TYPES.RETRY_STORAGE_CLEANUP,
      data: { objectKey: validUpload.objectKey },
    };
    const abortResult = await maintenanceWorker.handleRetryStorageCleanup(cleanupJobActive);
    assert(abortResult.deleted === false && abortResult.reason === 'ACTIVELY_REFERENCED_IN_DB', 'BQ-10: Maintenance worker ABORTED deletion of actively referenced object');
    
    // Verify file still exists in storage
    const existsStill = await storageService.exists(validUpload.objectKey);
    assert(existsStill, 'BQ-10: Referenced object remains completely intact in storage');

    // Now test deletion of an UNREFERENCED orphan key
    const orphanUpload = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 902,
      filename: 'orphan_proof.pdf',
      buffer: Buffer.from('%PDF-1.4 orphan proof content'),
      claimedMimeType: 'application/pdf',
    });
    const cleanupJobOrphan: any = {
      name: JOB_TYPES.RETRY_STORAGE_CLEANUP,
      data: { objectKey: orphanUpload.objectKey },
    };
    const orphanResult = await maintenanceWorker.handleRetryStorageCleanup(cleanupJobOrphan);
    assert(orphanResult.deleted === true, 'BQ-10: Unreferenced orphan object was safely deleted by maintenance worker');
    const orphanExists = await storageService.exists(orphanUpload.objectKey);
    assert(!orphanExists, 'BQ-10: Orphan object is no longer present in storage');

    // =========================================================================
    // BQ-11: Installment Overdue Detection
    // =========================================================================
    console.log('\n--- BQ-11: Installment Overdue Worker ---');
    // Setup Order, OrderItem, and PaymentPlan
    const [account] = await db
      .insertInto('accounts')
      .values({ company_name: `Corp BQ11 ${runId}`, phone: `0988${runId.toString().slice(0, 6)}`, email: `client_bq11_${runId}@test.com` })
      .returningAll()
      .execute();
    const [order] = await db
      .insertInto('orders')
      .values({ order_code: `ORD-BQ11-${runId}`, account_id: account.id, workflow_status: 'APPROVED' })
      .returningAll()
      .execute();
    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const [orderItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        service_id: (await db.selectFrom('services').select('id').executeTakeFirst())?.id || 1,
        closing_sale_id: devEmp.id,
        requirement_template_id: reqTemplate?.id || 1,
        requirement_template_version: 1,
        original_price: 5000000,
        discount_amount: 0,
        net_service_value: 5000000,
        vat_amount: 500000,
        approval_status: 'APPROVED',
        delivery_status: 'PENDING',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    const [plan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        version: 1,
        status: 'APPROVED',
        created_by_employee_id: devEmp.id,
        config_snapshot: JSON.stringify({}),
      })
      .returningAll()
      .execute();

    // Create an installment with due_date = YESTERDAY
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const [overdueInst] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan.id,
        installment_number: 1,
        due_date: yesterdayStr as any,
        gross_amount_due: 5500000,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    // Run overdue detection job as of TODAY
    const todayStr = new Date().toISOString().split('T')[0];
    const overdueJobMock: any = {
      name: JOB_TYPES.DETECT_OVERDUE_INSTALLMENTS,
      data: { asOfDate: todayStr },
    };
    const overdueResult = await reminderWorker.handleDetectOverdueInstallments(overdueJobMock);
    assert(overdueResult.updatedOverdue >= 1, 'BQ-11: Worker successfully identified overdue installment');

    // Verify DB status updated to OVERDUE
    const reloadedInst = await db
      .selectFrom('payment_installments')
      .selectAll()
      .where('id', '=', overdueInst.id)
      .executeTakeFirst();
    assert(reloadedInst?.status === 'OVERDUE', 'BQ-11: Installment status updated to OVERDUE in database');

    // Verify Accountant received in-app notification
    const accNotif = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', accEmp.id as any)
      .where('event_type', '=', 'INSTALLMENT_OVERDUE')
      .where('entity_id', '=', overdueInst.id as any)
      .executeTakeFirst();
    assert(!!accNotif, 'BQ-11: In-app notification received by Accountant for overdue installment');

    // =========================================================================
    // BQ-12: Daily Report Reminder
    // =========================================================================
    console.log('\n--- BQ-12: Daily Report Missing Reminder ---');
    const reportDateStr = new Date().toISOString().split('T')[0];
    const dailyReminderJobMock: any = {
      name: JOB_TYPES.DAILY_REPORT_REMINDER,
      data: { reportDate: reportDateStr },
    };
    const dailyResult = await reminderWorker.handleDailyReportReminder(dailyReminderJobMock);
    assert(dailyResult.missing >= 1, 'BQ-12: Worker identified missing daily reports for active employees');

    // Verify Dev employee received daily report reminder notification
    const devDailyNotif = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'DAILY_REPORT_MISSING')
      .executeTakeFirst();
    assert(!!devDailyNotif, 'BQ-12: Active Dev employee who missed report received reminder notification');

    // =========================================================================
    // REMINDER LEAD TIME OPEN RULE CHECK
    // =========================================================================
    console.log('\n--- Check: REMINDER LEAD TIME = OPEN BUSINESS RULE ---');
    const unconfiguredLeadJob: any = {
      name: JOB_TYPES.SERVICE_PERIOD_REMINDER,
      data: { asOfDate: reportDateStr }, // leadDays deliberately omitted
    };
    const openLeadResult = await reminderWorker.handleServicePeriodReminder(unconfiguredLeadJob);
    assert(
      openLeadResult.skipped === true && openLeadResult.reason === 'REMINDER_LEAD_TIME_OPEN',
      'Check: Service period reminder skipped when leadDays not configured (No assumed default 3 days)',
    );

    // =========================================================================
    // BQ-13: Re-enqueue Same Logical Reminder After Completed Job -> No Duplicate Side Effect
    // =========================================================================
    console.log('\n--- BQ-13: Re-enqueue Same Logical Reminder (Side Effect Idempotency) ---');
    // Re-run daily report reminder for the exact same reportDateStr
    const reRunDailyResult = await reminderWorker.handleDailyReportReminder(dailyReminderJobMock);
    
    // Query total notifications for devEmp on DAILY_REPORT_MISSING
    const allDevDailyNotifs = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'DAILY_REPORT_MISSING')
      .execute();
    assert(
      allDevDailyNotifs.length === 1,
      'BQ-13: Re-enqueueing same logical reminder produced NO duplicate notification in DB (Exact count: 1)',
    );

    // =========================================================================
    // BQ-14: Same Overdue Job Retry / Re-enqueue -> Idempotent State & No Duplicate Notif
    // =========================================================================
    console.log('\n--- BQ-14: Same Overdue Job Retry / Re-enqueue (Side Effect Idempotency) ---');
    // Re-run overdue detection
    const reRunOverdueResult = await reminderWorker.handleDetectOverdueInstallments(overdueJobMock);
    
    // Check installment remains OVERDUE
    const recheckedInst = await db
      .selectFrom('payment_installments')
      .selectAll()
      .where('id', '=', overdueInst.id)
      .executeTakeFirst();
    assert(recheckedInst?.status === 'OVERDUE', 'BQ-14: Installment remains in valid OVERDUE state upon re-run');

    // Check Accountant received exactly 1 notification for this overdue installment
    const allAccNotifs = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', accEmp.id as any)
      .where('event_type', '=', 'INSTALLMENT_OVERDUE')
      .where('entity_id', '=', overdueInst.id as any)
      .execute();
    assert(
      allAccNotifs.length === 1,
      'BQ-14: Re-running overdue detection produced NO duplicate notification for Accountant (Exact count: 1)',
    );

    // =========================================================================
    // Observability Endpoint Check
    // =========================================================================
    console.log('\n--- Observability: Queue Metrics ---');
    const metrics = await queueService.getQueueMetrics();
    assert(metrics.length === 3, 'Observability: Metrics returned for all 3 queues');
    for (const m of metrics) {
      console.log(`  Queue [${m.queueName}]: waiting=${m.waiting}, active=${m.active}, completed=${m.completed}, failed=${m.failed}`);
    }

    console.log('\n====================================================');
    console.log('✅ ALL BQ-01 THROUGH BQ-14 PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('❌ PHASE N INTEGRATION SUITE FAILED:', err);
    throw err;
  } finally {
    await app.close();
  }
}

runPhaseNJobsSuite()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
