import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ProjectsService } from '../projects/projects.service';
import { LeadsService } from '../leads/leads.service';
import { DailyReportsService } from '../daily-reports/daily-reports.service';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { PaymentMethod } from '../payments/dto/create-payment.dto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';

function assert(condition: boolean, testName: string, extra?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${extra ? ' -> ' + extra : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

async function runPhaseLNotificationsSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE L: NOTIFICATIONS INTEGRATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const notifService = app.get<NotificationsService>(NotificationsService);
  const notifController = app.get<NotificationsController>(NotificationsController);
  const ordersService = app.get<OrdersService>(OrdersService);
  const paymentsService = app.get<PaymentsService>(PaymentsService);
  const projectsService = app.get<ProjectsService>(ProjectsService);
  const leadsService = app.get<LeadsService>(LeadsService);
  const dailyReportsService = app.get<DailyReportsService>(DailyReportsService);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // FIXTURE SETUP
    // ----------------------------------------------------------------
    console.log('--- Setting up test fixtures ---');

    // Roles
    const bossRole = await db.selectFrom('roles').selectAll().where('code', '=', 'BOSS').executeTakeFirst();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirst();

    // Positions
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    const devLeadPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV_LEADER').executeTakeFirst();
    const posId = salePos ? salePos.id : (1 as any);

    // 1. Boss user & employee
    const [bossUser] = await db
      .insertInto('users')
      .values({
        username: `boss_${runId}`,
        password_hash: 'hash',
        email: `boss_${runId}@test.com`,
      })
      .returningAll()
      .execute();

    const [bossEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-BOSS-${runId}`,
        full_name: `Boss User ${runId}`,
        position_id: posId,
        user_id: bossUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    if (bossRole) {
      await db
        .insertInto('user_roles')
        .values({ user_id: bossUser.id, role_id: bossRole.id })
        .execute();
    }

    // 2. Sale employee & user
    const [saleUser] = await db
      .insertInto('users')
      .values({
        username: `sale_${runId}`,
        password_hash: 'hash',
        email: `sale_${runId}@test.com`,
      })
      .returningAll()
      .execute();

    const [saleEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-SALE-${runId}`,
        full_name: `Sale User ${runId}`,
        position_id: posId,
        user_id: saleUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    if (saleRole) {
      await db
        .insertInto('user_roles')
        .values({ user_id: saleUser.id, role_id: saleRole.id })
        .execute();
    }

    // 3. Dev Team Leader & Employee
    const [leaderUser] = await db
      .insertInto('users')
      .values({
        username: `devleader_${runId}`,
        password_hash: 'hash',
        email: `devleader_${runId}@test.com`,
      })
      .returningAll()
      .execute();

    const [leaderEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEADER-${runId}`,
        full_name: `Dev Leader ${runId}`,
        position_id: devLeadPos ? devLeadPos.id : posId,
        user_id: leaderUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // 4. Dev Member
    const [devUser] = await db
      .insertInto('users')
      .values({
        username: `devmember_${runId}`,
        password_hash: 'hash',
        email: `devmember_${runId}@test.com`,
      })
      .returningAll()
      .execute();

    const [devEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEVMEMBER-${runId}`,
        full_name: `Dev Member ${runId}`,
        position_id: devPos ? devPos.id : posId,
        user_id: devUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // 5. Team & Team Memberships
    const [team] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-DEV-${runId}`,
        name: `Dev Team ${runId}`,
        department: 'DEV',
      })
      .returningAll()
      .execute();

    // Leader membership (active now)
    await db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: leaderEmp.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      })
      .execute();

    // Member membership (active now)
    await db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: devEmp.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      })
      .execute();

    // Account, Contact, Service for Order/Payment/Project
    const [account] = await db
      .insertInto('accounts')
      .values({
        company_name: `Company Test ${runId}`,
        phone: `0987${runId.toString().slice(0, 6)}`,
        email: `client_${runId}@test.com`,
      })
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: `Contact Test ${runId}`,
        phone: `0987${runId.toString().slice(0, 6)}`,
        email: `contact_${runId}@test.com`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [service] = await db
      .insertInto('services')
      .values({
        name: `Service Test ${runId}`,
        code: `SRV-${runId}`,
        service_type: 'PROJECT',
        is_active: true,
      })
      .returningAll()
      .execute();

    // Canonical Platform & Channel for Lead
    const platform = await db.selectFrom('platforms').selectAll().where('code', '=', 'FACEBOOK').executeTakeFirstOrThrow();
    const channel = await db.selectFrom('channels').selectAll().where('code', '=', 'PAID_ADS').executeTakeFirstOrThrow();

    console.log('--- Test Fixtures ready ---');

    // ----------------------------------------------------------------
    // NT-01: ORDER PENDING APPROVAL -> BOSS NHẬN
    // ----------------------------------------------------------------
    console.log('\n--- NT-01: Order Pending Approval -> Boss Nhận ---');
    const [order] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-TEST-${runId}`,
        account_id: account.id,
        primary_contact_id: contact.id,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    await ordersService.submitOrder(String(order.id), String(saleEmp.id));

    // Check notification received by Boss
    const bossNotifsAfterOrder = await notifService.getUserNotifications(String(bossEmp.id), { limit: 10 });
    const orderNotif = bossNotifsAfterOrder.data.find(
      (n) => n.event_type === 'ORDER_PENDING_APPROVAL' && String(n.entity_id) === String(order.id),
    );
    assert(!!orderNotif, 'NT-01: Order PENDING_APPROVAL creates in-app notification for BOSS', `found=${!!orderNotif}`);
    assert(orderNotif.employee_id === String(bossEmp.id), 'NT-01: Notification recipient is Boss');

    // ----------------------------------------------------------------
    // NT-02: PAYMENT PENDING -> BOSS NHẬN
    // ----------------------------------------------------------------
    console.log('\n--- NT-02: Payment Pending -> Boss Nhận ---');
    // First approve order so payment can be created
    await db.updateTable('orders').set({ workflow_status: 'APPROVED' }).where('id', '=', order.id).execute();

    const payment = await paymentsService.createPayment({
      grossCashAmount: 5000000,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    }, String(saleEmp.id));

    const bossNotifsAfterPayment = await notifService.getUserNotifications(String(bossEmp.id), { limit: 10 });
    const paymentNotif = bossNotifsAfterPayment.data.find(
      (n) => n.event_type === 'PAYMENT_PENDING_CONFIRMATION' && String(n.entity_id) === String(payment.id),
    );
    assert(!!paymentNotif, 'NT-02: Payment PENDING_CONFIRMATION creates in-app notification for BOSS', `found=${!!paymentNotif}`);

    // Confirm payment -> Sale creator should be notified
    await paymentsService.confirmPayment(String(payment.id), {}, String(bossEmp.id));
    const saleNotifsAfterConfirm = await notifService.getUserNotifications(String(saleEmp.id), { limit: 10 });
    const paymentConfirmedNotif = saleNotifsAfterConfirm.data.find(
      (n) => n.event_type === 'PAYMENT_CONFIRMED' && String(n.entity_id) === String(payment.id),
    );
    assert(!!paymentConfirmedNotif, 'NT-02: Payment CONFIRMED notifies payment creator (Sale)', `found=${!!paymentConfirmedNotif}`);

    // ----------------------------------------------------------------
    // NT-03: PROJECT ASSIGNMENT -> ASSIGNEE NHẬN
    // ----------------------------------------------------------------
    console.log('\n--- NT-03: Project Assignment -> Assignee Nhận ---');
    // Create order item
    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const reqTemplateId = reqTemplate ? reqTemplate.id : (1 as any);

    const [orderItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        closing_sale_id: saleEmp.id,
        service_id: service.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 15000000,
        discount_amount: 0,
        net_service_value: 15000000,
        vat_amount: 1500000,
        approval_status: 'APPROVED',
        delivery_status: 'PENDING',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    const projectResult = await projectsService.assignProject(String(orderItem.id), {
      employeeId: String(devEmp.id),
      assignmentType: AssignmentType.PRIMARY,
    }, String(bossEmp.id));

    const devNotifsAfterProject = await notifService.getUserNotifications(String(devEmp.id), { limit: 10 });
    const projectAssignedNotif = devNotifsAfterProject.data.find(
      (n) => n.event_type === 'PROJECT_ASSIGNED' && String(n.entity_id) === String(projectResult.project.id),
    );
    assert(!!projectAssignedNotif, 'NT-03: Project assignment creates in-app notification for primary assignee', `found=${!!projectAssignedNotif}`);
    assert(projectAssignedNotif.employee_id === String(devEmp.id), 'NT-03: Assignee is recipient');

    // ----------------------------------------------------------------
    // NT-04: LEAD ASSIGNMENT -> SALE NHẬN
    // ----------------------------------------------------------------
    console.log('\n--- NT-04: Lead Assignment -> Sale Nhận ---');
    // Market assignment for auto-assignment
    // Deactivate previous assignments for this platform/channel to ensure exactly 1 active assignment
    await db
      .updateTable('sale_market_assignments')
      .set({ is_active: false })
      .where('platform_id', '=', platform.id)
      .where('channel_id', '=', channel.id)
      .execute();

    await db
      .insertInto('sale_market_assignments')
      .values({
        platform_id: platform.id,
        channel_id: channel.id,
        employee_id: saleEmp.id,
        is_active: true,
      })
      .execute();

    const leadAuto = await leadsService.createLead({
      fullName: `Lead Auto ${runId}`,
      platformId: String(platform.id),
      channelId: String(channel.id),
    });

    const saleNotifsAfterLead = await notifService.getUserNotifications(String(saleEmp.id), { limit: 10 });
    const leadNotif = saleNotifsAfterLead.data.find(
      (n) => n.event_type === 'LEAD_AUTO_ASSIGNED' && String(n.entity_id) === String(leadAuto.id),
    );
    assert(!!leadNotif, 'NT-04: Auto-assigned lead sends notification to Sale owner', `found=${!!leadNotif}`);

    // ----------------------------------------------------------------
    // NT-05: SUPPORT_NEEDED -> CURRENT TEAM LEADER NHẬN
    // ----------------------------------------------------------------
    console.log('\n--- NT-05: Support Needed -> Current Team Leader Nhận ---');
    const today = new Date().toISOString().slice(0, 10);
    await dailyReportsService.createDailyReport({
      report_date: today,
      difficulty: 'Hard issue with Redis cache',
      support_needed: 'Need Team Leader review on cluster configuration',
      next_plan: 'Fix cluster nodes',
    }, String(devEmp.id));

    const leaderNotifs = await notifService.getUserNotifications(String(leaderEmp.id), { limit: 10 });
    const supportNotif = leaderNotifs.data.find(
      (n) => n.event_type === 'DAILY_REPORT_SUPPORT_NEEDED',
    );
    assert(!!supportNotif, 'NT-05: Daily report support_needed routes notification to current Team Leader', `found=${!!supportNotif}`);
    assert(supportNotif.employee_id === String(leaderEmp.id), 'NT-05: Leader is recipient');

    // ----------------------------------------------------------------
    // NT-06: RECIPIENT ISOLATION
    // ----------------------------------------------------------------
    console.log('\n--- NT-06: Recipient Isolation ---');
    const devNotifsAll = await notifService.getUserNotifications(String(devEmp.id));
    const hasOtherRecipientNotif = devNotifsAll.data.some((n) => String(n.employee_id) !== String(devEmp.id));
    assert(!hasOtherRecipientNotif, 'NT-06: Dev member only receives notifications addressed to self (no data leak)');

    // Ensure dev member cannot see Boss or Sale notifications
    const hasBossNotif = devNotifsAll.data.some((n) => n.event_type === 'ORDER_PENDING_APPROVAL');
    assert(!hasBossNotif, 'NT-06: Dev member does not receive elevated Boss notifications');

    // ----------------------------------------------------------------
    // NT-07: MARK READ / UNREAD COUNT
    // ----------------------------------------------------------------
    console.log('\n--- NT-07: Mark Read / Unread Count ---');
    const initialUnread = await notifService.getUnreadCount(String(devEmp.id));
    assert(initialUnread > 0, 'NT-07: Dev member has unread notifications');

    const firstUnread = devNotifsAll.data.find((n) => !n.is_read);
    assert(!!firstUnread, 'NT-07: Unread notification found');

    const marked = await notifService.markAsRead(String(firstUnread.id), String(devEmp.id));
    assert(marked.is_read === true, 'NT-07: Notification is marked as read');

    const newUnread = await notifService.getUnreadCount(String(devEmp.id));
    assert(newUnread === initialUnread - 1, 'NT-07: Unread count decremented by exactly 1', `was=${initialUnread}, now=${newUnread}`);

    // ----------------------------------------------------------------
    // NT-08: READ-ALL
    // ----------------------------------------------------------------
    console.log('\n--- NT-08: Read-All ---');
    // Ensure boss has unread notifications
    const bossUnreadBefore = await notifService.getUnreadCount(String(bossEmp.id));
    assert(bossUnreadBefore > 0, 'NT-08: Boss has unread notifications before read-all');

    const readAllResult = await notifService.markAllAsRead(String(bossEmp.id));
    assert(readAllResult.updatedCount >= 1, 'NT-08: markAllAsRead updated positive count', `count=${readAllResult.updatedCount}`);

    const bossUnreadAfter = await notifService.getUnreadCount(String(bossEmp.id));
    assert(bossUnreadAfter === 0, 'NT-08: Boss unread count is 0 after markAllAsRead');

    // ----------------------------------------------------------------
    // NT-09: DUPLICATE / IDEMPOTENCY
    // ----------------------------------------------------------------
    console.log('\n--- NT-09: Duplicate / Idempotency ---');
    const n1 = await notifService.createNotification({
      employeeId: devEmp.id,
      eventType: 'SYSTEM_ALERT',
      title: 'Idempotency test',
      content: 'Testing deduplication',
      entityType: 'TEST',
      entityId: runId,
      idempotent: true,
    });
    const n2 = await notifService.createNotification({
      employeeId: devEmp.id,
      eventType: 'SYSTEM_ALERT',
      title: 'Idempotency test duplicate',
      content: 'Testing deduplication 2',
      entityType: 'TEST',
      entityId: runId,
      idempotent: true,
    });
    assert(String(n1.id) === String(n2.id), 'NT-09: Duplicate creation with idempotent=true returns existing record without duplicating');

    // ----------------------------------------------------------------
    // NT-10: ADMIN/BOSS KHÔNG BYPASS NOTIFICATION OWNERSHIP
    // ----------------------------------------------------------------
    console.log('\n--- NT-10: Admin/Boss Không Bypass Notification Ownership ---');
    // Boss tries to mark Dev's personal notification as read using Dev's notification id but Boss's actor id
    let preventedUnauthorizedRead = false;
    try {
      await notifService.markAsRead(String(projectAssignedNotif.id), String(bossEmp.id));
    } catch (e: any) {
      if (e instanceof NotFoundException || e instanceof ForbiddenException) {
        preventedUnauthorizedRead = true;
      }
    }
    assert(
      preventedUnauthorizedRead,
      'NT-10: Strict recipient scoping prevents Boss from mutating Dev member personal notification without explicit ownership',
    );

    // Controller level check: simulate Dev calling controller
    const devJwtPayload: any = { sub: String(devUser.id), employeeId: String(devEmp.id), roles: ['DEV'] };
    const devNotificationsFromCtrl = await notifController.getNotifications(devJwtPayload);
    const ctrlHasOnlyDevNotifs = devNotificationsFromCtrl.data.every((n: any) => String(n.employee_id) === String(devEmp.id));
    assert(ctrlHasOnlyDevNotifs, 'NT-10: Controller strictly scopes by req.user.employeeId');

    // ----------------------------------------------------------------
    // NT-11: IDEMPOTENCY CONCURRENCY AUDIT
    // ----------------------------------------------------------------
    console.log('\n--- NT-11: Concurrency Idempotency Audit ---');
    const concurrentEntityId = runId + 9999;
    await Promise.all([
      notifService.createNotification({
        employeeId: devEmp.id,
        eventType: 'CONCURRENT_TEST',
        title: 'Concurrent 1',
        content: 'Concurrent Content 1',
        entityType: 'TEST',
        entityId: concurrentEntityId,
        idempotent: true,
      }),
      notifService.createNotification({
        employeeId: devEmp.id,
        eventType: 'CONCURRENT_TEST',
        title: 'Concurrent 2',
        content: 'Concurrent Content 2',
        entityType: 'TEST',
        entityId: concurrentEntityId,
        idempotent: true,
      }),
    ]);

    const concurrentRows = await db
      .selectFrom('notifications')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('event_type', '=', 'CONCURRENT_TEST')
      .where('entity_type', '=', 'TEST')
      .where('entity_id', '=', concurrentEntityId as any)
      .execute();

    console.log(`[NT-11 AUDIT] Concurrent requests resulted in ${concurrentRows.length} notification record(s) in DB.`);
    assert(concurrentRows.length === 1, 'NT-11: Exactly 1 notification created under concurrency with DB idempotency key');

    // ----------------------------------------------------------------
    // NT-12: BUSINESS TRANSACTION ROLLBACK -> NO ORPHAN NOTIFICATION
    // ----------------------------------------------------------------
    console.log('\n--- NT-12: Business Transaction Rollback -> No Orphan Notification ---');
    const [account12] = await db
      .insertInto('accounts')
      .values({
        company_name: `Company Test NT12 ${runId}`,
        phone: `0986${runId.toString().slice(0, 6)}`,
        email: `client_nt12_${runId}@test.com`,
      })
      .returningAll()
      .execute();
    const [contact12] = await db
      .insertInto('contacts')
      .values({
        account_id: account12.id,
        full_name: `Contact Test NT12 ${runId}`,
        phone: `0986${runId.toString().slice(0, 6)}`,
        email: `contact_nt12_${runId}@test.com`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [rollbackOrder] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-ROLLBACK-${runId}`,
        account_id: account12.id,
        primary_contact_id: contact12.id,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    let txRolledBack = false;
    try {
      await kysely.db.transaction().execute(async (trx) => {
        await trx
          .updateTable('orders')
          .set({ workflow_status: 'PENDING_APPROVAL' })
          .where('id', '=', rollbackOrder.id)
          .execute();

        await notifService.notifyRoles(
          ['BOSS', 'ADMIN'],
          {
            eventType: 'ORDER_PENDING_APPROVAL',
            title: `Order #${rollbackOrder.id} Rollback Test`,
            content: 'Testing rollback consistency',
            deepLinkUrl: `/orders/${rollbackOrder.id}`,
            entityType: 'orders',
            entityId: rollbackOrder.id,
          },
          trx,
        );

        // Force intentional rollback error after notification prepared
        throw new Error('INTENTIONAL_TX_ROLLBACK_AFTER_NOTIFICATION');
      });
    } catch (err: any) {
      if (err.message === 'INTENTIONAL_TX_ROLLBACK_AFTER_NOTIFICATION') {
        txRolledBack = true;
      }
    }
    assert(txRolledBack, 'NT-12: Business transaction intentionally forced rollback');

    const orderAfterRollback = await db
      .selectFrom('orders')
      .select('workflow_status')
      .where('id', '=', rollbackOrder.id)
      .executeTakeFirstOrThrow();
    assert(orderAfterRollback.workflow_status === 'DRAFT', 'NT-12: Order status rolled back cleanly to DRAFT');

    const orphanNotifs = await db
      .selectFrom('notifications')
      .selectAll()
      .where('entity_type', '=', 'orders')
      .where('entity_id', '=', rollbackOrder.id as any)
      .execute();
    assert(orphanNotifs.length === 0, 'NT-12: No orphan notifications exist in database after transaction rollback');

    // ----------------------------------------------------------------
    // NT-13: NOTIFICATION FAILURE DOES NOT LEAVE HALF-VALID BUSINESS STATE
    // ----------------------------------------------------------------
    console.log('\n--- NT-13: Notification Failure Does Not Leave Half-Valid Business State ---');
    const [account13] = await db
      .insertInto('accounts')
      .values({
        company_name: `Company Test NT13 ${runId}`,
        phone: `0985${runId.toString().slice(0, 6)}`,
        email: `client_nt13_${runId}@test.com`,
      })
      .returningAll()
      .execute();
    const [contact13] = await db
      .insertInto('contacts')
      .values({
        account_id: account13.id,
        full_name: `Contact Test NT13 ${runId}`,
        phone: `0985${runId.toString().slice(0, 6)}`,
        email: `contact_nt13_${runId}@test.com`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [failTestOrder] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-FAIL-NOTIF-${runId}`,
        account_id: account13.id,
        primary_contact_id: contact13.id,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    let notifErrorCaught = false;
    try {
      await kysely.db.transaction().execute(async (trx) => {
        // Business mutation
        await trx
          .updateTable('orders')
          .set({ workflow_status: 'PENDING_APPROVAL' })
          .where('id', '=', failTestOrder.id)
          .execute();

        // Simulate notification failure inside transaction (invalid FK employeeId)
        await notifService.createNotification(
          {
            employeeId: 999999999, // Non-existent employee ID violates FK
            eventType: 'ORDER_PENDING_APPROVAL',
            title: 'Should fail',
            content: 'Should trigger rollback',
            entityType: 'orders',
            entityId: failTestOrder.id,
          },
          trx,
        );
      });
    } catch (err: any) {
      notifErrorCaught = true;
    }
    assert(notifErrorCaught, 'NT-13: Notification failure triggered transactional error');

    const orderAfterFail = await db
      .selectFrom('orders')
      .select('workflow_status')
      .where('id', '=', failTestOrder.id)
      .executeTakeFirstOrThrow();
    assert(orderAfterFail.workflow_status === 'DRAFT', 'NT-13: Business state remains strictly valid (DRAFT), no half-valid mutation committed');

    console.log('\n====================================================');
    console.log('✅ ALL NT-01 THROUGH NT-13 PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test Suite execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhaseLNotificationsSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
