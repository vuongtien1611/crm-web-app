import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { KyselyService } from '../../database/kysely.service';
import { ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';

async function runPhaseHExecutiveDashboardSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE H: EXECUTIVE DASHBOARD SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dashboardService = app.get(DashboardService);
  const dashboardController = app.get(DashboardController);
  const kyselyService = app.get(KyselyService);
  const db = kyselyService.db;

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failCount++;
    }
  }

  const runId = Date.now().toString().slice(-6);

  try {
    // ----------------------------------------------------------------
    // Setup Mock JWT Payloads
    // ----------------------------------------------------------------
    const userAdmin: any = {
      sub: 'admin-id',
      employeeId: '1',
      roles: ['ADMIN'],
      permissions: ['ALL'],
    };

    const userBoss: any = {
      sub: 'boss-id',
      employeeId: '2',
      roles: ['BOSS'],
      permissions: ['ALL'],
    };

    const userSale: any = {
      sub: 'sale-id',
      employeeId: '10',
      roles: ['SALE'],
      permissions: ['LEAD_READ', 'DEAL_READ'],
    };

    const userDevLeader: any = {
      sub: 'dev-leader-id',
      employeeId: '20',
      roles: ['DEV_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ'],
    };

    const userSeoLeader: any = {
      sub: 'seo-leader-id',
      employeeId: '30',
      roles: ['SEO_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ'],
    };

    // ----------------------------------------------------------------
    // ED-01: ADMIN & BOSS Access Allowed
    // ----------------------------------------------------------------
    const adminData = await dashboardController.getExecutiveDashboard(undefined, userAdmin);
    const bossData = await dashboardController.getExecutiveDashboard(undefined, userBoss);

    const ed01Passed =
      adminData &&
      bossData &&
      typeof adminData.cashReceivable.grossCashConfirmedTotal === 'number' &&
      typeof bossData.cashReceivable.grossCashConfirmedTotal === 'number';

    assert(ed01Passed, 'ED-01: ADMIN and BOSS can access Executive Dashboard');

    // ----------------------------------------------------------------
    // ED-02: Non-Executives Blocked with 403 Forbidden
    // ----------------------------------------------------------------
    let saleBlocked = false;
    let devLeaderBlocked = false;
    let seoLeaderBlocked = false;

    try {
      await dashboardController.getExecutiveDashboard(undefined, userSale);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) saleBlocked = true;
    }

    try {
      await dashboardController.getExecutiveDashboard(undefined, userDevLeader);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) devLeaderBlocked = true;
    }

    try {
      await dashboardController.getExecutiveDashboard(undefined, userSeoLeader);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) seoLeaderBlocked = true;
    }

    const ed02Passed = saleBlocked && devLeaderBlocked && seoLeaderBlocked;
    assert(ed02Passed, 'ED-02: Non-executive roles (SALE, DEV_TEAM_LEADER, SEO_TEAM_LEADER) receive 403 Forbidden');

    // ----------------------------------------------------------------
    // ED-03: Gross Cash Confirmed Matches Real Database Payments
    // ----------------------------------------------------------------
    const targetPeriod = '2026-09';

    // Insert 1 confirmed payment and 1 pending payment for test verification
    const adminEmp = await db.selectFrom('employees').select('id').executeTakeFirst();
    const actorId = adminEmp ? adminEmp.id : (1 as any);

    const [testConfirmedPayment] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-ED-CONF-${runId}`,
        gross_cash_amount: 50000000,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: actorId,
        confirmed_by_employee_id: actorId,
        confirmed_at: new Date('2026-09-08T10:00:00Z'),
        status: 'CONFIRMED',
      })
      .returningAll()
      .execute();

    const [testPendingPayment] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-ED-PEND-${runId}`,
        gross_cash_amount: 15000000,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: actorId,
        status: 'PENDING_CONFIRMATION',
      })
      .returningAll()
      .execute();

    const dataAfterPayment = await dashboardService.getExecutiveDashboard(targetPeriod);

    const ed03Passed =
      dataAfterPayment.cashReceivable.grossCashConfirmedPeriod >= 50000000 &&
      dataAfterPayment.cashReceivable.grossCashConfirmedTotal >= 50000000;

    assert(ed03Passed, 'ED-03: Gross Cash Confirmed aggregates real database payments accurately');

    // ----------------------------------------------------------------
    // ED-04: Accounts Receivable (AR) from Approved Payment Plans
    // ----------------------------------------------------------------
    // Setup Account, Order, OrderItem, and Approved Payment Plan
    const [testAccount] = await db
      .insertInto('accounts')
      .values({ company_name: `Dashboard Corp ${runId}` })
      .returningAll()
      .execute();

    const [testContact] = await db
      .insertInto('contacts')
      .values({
        account_id: testAccount.id,
        full_name: `Dashboard Contact ${runId}`,
        phone: '0988776655',
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [testOrder] = await db
      .insertInto('orders')
      .values({
        account_id: testAccount.id,
        primary_contact_id: testContact.id,
        order_code: `ORD-ED-${runId}`,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const service = await db.selectFrom('services').selectAll().executeTakeFirst();
    const serviceId = service ? service.id : (1 as any);

    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const templateId = reqTemplate ? reqTemplate.id : (6 as any);
    const templateVersion = reqTemplate ? reqTemplate.version : 1;

    const [testItem] = await db
      .insertInto('order_items')
      .values({
        order_id: testOrder.id,
        service_id: serviceId,
        closing_sale_id: actorId,
        requirement_template_id: templateId,
        requirement_template_version: templateVersion,
        original_price: 100000000,
        discount_amount: 0,
        net_service_value: 100000000,
        vat_amount: 10000000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'PARTIALLY_PAID',
      })
      .returningAll()
      .execute();

    const [approvedPlan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: testItem.id,
        status: 'APPROVED',
        created_by_employee_id: actorId,
        config_snapshot: JSON.stringify({ type: 'CUSTOM', installments: 2 }),
      })
      .returningAll()
      .execute();

    // Installment 1: 60M (Paid 50M)
    const [inst1] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: approvedPlan.id,
        installment_number: 1,
        due_date: '2026-09-15' as any,
        gross_amount_due: 60000000,
        status: 'PARTIALLY_PAID',
      })
      .returningAll()
      .execute();

    // Installment 2: 50M (Due later)
    const [inst2] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: approvedPlan.id,
        installment_number: 2,
        due_date: '2026-10-15' as any,
        gross_amount_due: 50000000,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    // Allocate 50M from testConfirmedPayment to inst1
    await db
      .insertInto('payment_allocations')
      .values({
        payment_id: testConfirmedPayment.id,
        installment_id: inst1.id,
        closing_sale_id: actorId,
        gross_allocated_amount: 50000000,
        vat_allocated_amount: 5000000,
        service_amount: 45000000,
        net_eligible_amount: 45000000,
        confirmed_at: new Date(),
      })
      .execute();

    // ----------------------------------------------------------------
    // VERIFY HISTORICAL PLAN DOES NOT DOUBLE-SUBTRACT OR CARRY FORWARD
    // Create an item with a SUPERSEDED plan (historical) + an APPROVED current plan
    // ----------------------------------------------------------------
    const [testItemHist] = await db
      .insertInto('order_items')
      .values({
        order_id: testOrder.id,
        service_id: serviceId,
        closing_sale_id: actorId,
        requirement_template_id: templateId,
        requirement_template_version: templateVersion,
        original_price: 40000000,
        discount_amount: 0,
        net_service_value: 40000000,
        vat_amount: 4000000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'PARTIALLY_PAID',
      })
      .returningAll()
      .execute();

    // Historical Plan (SUPERSEDED) - 20M due, 15M allocated
    const [histPlan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: testItemHist.id,
        status: 'SUPERSEDED',
        created_by_employee_id: actorId,
        config_snapshot: JSON.stringify({ type: 'OLD_PLAN' }),
      })
      .returningAll()
      .execute();

    const [histInst] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: histPlan.id,
        installment_number: 1,
        due_date: '2026-08-01' as any,
        gross_amount_due: 20000000,
        status: 'PARTIALLY_PAID',
      })
      .returningAll()
      .execute();

    const [histPayment] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-HIST-${runId}`,
        gross_cash_amount: 15000000,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: actorId,
        confirmed_by_employee_id: actorId,
        confirmed_at: new Date('2026-08-05T10:00:00Z'),
        status: 'CONFIRMED',
      })
      .returningAll()
      .execute();

    await db
      .insertInto('payment_allocations')
      .values({
        payment_id: histPayment.id,
        installment_id: histInst.id,
        closing_sale_id: actorId,
        gross_allocated_amount: 15000000,
        vat_allocated_amount: 1500000,
        service_amount: 13500000,
        net_eligible_amount: 13500000,
        confirmed_at: new Date(),
      })
      .execute();

    // Current Approved Plan for testItemHist - 40M due, 10M allocated
    const [currPlan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: testItemHist.id,
        version: 2,
        status: 'APPROVED',
        created_by_employee_id: actorId,
        config_snapshot: JSON.stringify({ type: 'NEW_CURRENT_PLAN' }),
      })
      .returningAll()
      .execute();

    const [currInst] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: currPlan.id,
        installment_number: 1,
        due_date: '2026-09-30' as any,
        gross_amount_due: 40000000,
        status: 'PARTIALLY_PAID',
      })
      .returningAll()
      .execute();

    const [currPayment] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-CURR-${runId}`,
        gross_cash_amount: 10000000,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: actorId,
        confirmed_by_employee_id: actorId,
        confirmed_at: new Date('2026-09-08T10:00:00Z'),
        status: 'CONFIRMED',
      })
      .returningAll()
      .execute();

    await db
      .insertInto('payment_allocations')
      .values({
        payment_id: currPayment.id,
        installment_id: currInst.id,
        closing_sale_id: actorId,
        gross_allocated_amount: 10000000,
        vat_allocated_amount: 1000000,
        service_amount: 9000000,
        net_eligible_amount: 9000000,
        confirmed_at: new Date(),
      })
      .execute();

    const dataAfterAr = await dashboardService.getExecutiveDashboard(targetPeriod);
    // Item 1 AR: 110M due - 50M paid = 60M
    // Item Hist AR: 40M due - 10M paid = 30M (The 15M from historical plan is NOT subtracted!)
    // Total AR >= 60M + 30M = 90M
    const ed04Passed = dataAfterAr.cashReceivable.accountsReceivable >= 90000000;

    assert(
      ed04Passed,
      'ED-04: Accounts Receivable (AR) computed via current approved payment plan minus confirmed allocations without historical carry-forward',
      `Got AR=${dataAfterAr.cashReceivable.accountsReceivable}`,
    );

    // ----------------------------------------------------------------
    // ED-05: Payment Pending Confirmation
    // ----------------------------------------------------------------
    const ed05Passed =
      dataAfterAr.cashReceivable.paymentPendingConfirmationCount >= 1 &&
      dataAfterAr.cashReceivable.paymentPendingConfirmationAmount >= 15000000;

    assert(ed05Passed, 'ED-05: Payments pending confirmation tracked accurately');

    // ----------------------------------------------------------------
    // ED-06: Sales Metrics (Leads, Open/Won Deals, Pending Orders)
    // ----------------------------------------------------------------
    // Insert a pending order with its own account for testing pending approval count
    const [accountPending] = await db
      .insertInto('accounts')
      .values({ company_name: `Pending Corp ${runId}` })
      .returningAll()
      .execute();

    const [contactPending] = await db
      .insertInto('contacts')
      .values({
        account_id: accountPending.id,
        full_name: `Contact Pending ${runId}`,
        phone: '0977665544',
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [pendingOrder] = await db
      .insertInto('orders')
      .values({
        account_id: accountPending.id,
        primary_contact_id: contactPending.id,
        order_code: `ORD-PENDING-${runId}`,
        workflow_status: 'PENDING_APPROVAL',
      })
      .returningAll()
      .execute();

    // Insert an OPEN deal and a NEGOTIATING deal
    await db
      .insertInto('deals')
      .values([
        {
          account_id: accountPending.id,
          primary_contact_id: contactPending.id,
          assigned_sale_id: actorId,
          deal_name: `Deal Open ${runId}`,
          expected_value: 50000000,
          status: 'OPEN',
        },
        {
          account_id: accountPending.id,
          primary_contact_id: contactPending.id,
          assigned_sale_id: actorId,
          deal_name: `Deal Negotiating ${runId}`,
          expected_value: 80000000,
          status: 'NEGOTIATING',
        },
      ])
      .execute();

    const dataSales = await dashboardService.getExecutiveDashboard(targetPeriod);

    const ed06Passed =
      dataSales.sales.totalLeads >= 0 &&
      dataSales.sales.openDeals >= 2 &&
      dataSales.sales.ordersPendingApproval >= 1;

    assert(ed06Passed, 'ED-06: Sales metrics and pending approval orders aggregated accurately');

    // ----------------------------------------------------------------
    // ED-07: Delivery Metrics (Projects breakdown)
    // ----------------------------------------------------------------
    // Insert a BLOCKED project
    const [blockedProject] = await db
      .insertInto('projects')
      .values({
        order_item_id: testItem.id,
        project_name: `Blocked Project ${runId}`,
        status: 'BLOCKED',
        materialized_progress_percent: 20,
      })
      .returningAll()
      .execute();

    // Insert a milestone and a blocked task with reason
    const [ms] = await db
      .insertInto('project_milestones')
      .values({
        project_id: blockedProject.id,
        title: `Milestone Blocked ${runId}`,
        weight: 50,
      })
      .returningAll()
      .execute();

    await db
      .insertInto('project_tasks')
      .values({
        milestone_id: ms.id,
        title: `Task Blocked Reason ${runId}`,
        weight: 50,
        status: 'BLOCKED',
        blocked_reason: 'Chờ đối tác cấp quyền API Gateway',
        blocked_since: new Date(),
      })
      .execute();

    const dataDelivery = await dashboardService.getExecutiveDashboard(targetPeriod);

    const ed07Passed =
      dataDelivery.delivery.blockedWaitingProjects >= 1 &&
      dataDelivery.delivery.activeProjects >= 0;

    assert(ed07Passed, 'ED-07: Delivery project status counts reflect real database records');

    // ----------------------------------------------------------------
    // ED-08: People, Teams & Canonical Commission Breakdown
    // ----------------------------------------------------------------
    // Insert canonical commission records (RELEASED, CALCULATED, APPROVED, ADJUSTED, REJECTED, IN_PAYROLL, PAID)
    // Note: order_item_id unique constraint requires distinct beneficiaries or types
    const employees = await db.selectFrom('employees').select('id').limit(4).execute();
    const b1 = employees[0]?.id || actorId;
    const b2 = employees[1]?.id || actorId;

    await db
      .insertInto('commissions')
      .values([
        {
          order_item_id: testItem.id,
          beneficiary_employee_id: b1,
          commission_type: 'SALE',
          rate_snapshot: 0.05,
          commission_base: 10000000,
          calculated_amount: 500000,
          status: 'RELEASED',
        },
        {
          order_item_id: testItem.id,
          beneficiary_employee_id: b2,
          commission_type: 'PROJECT_DELIVERY',
          rate_snapshot: 0.03,
          commission_base: 10000000,
          calculated_amount: 300000,
          status: 'CALCULATED',
        },
      ])
      .execute();

    const dataPeople = await dashboardService.getExecutiveDashboard(targetPeriod);

    const ed08Passed =
      dataPeople.people.totalActiveEmployees > 0 &&
      typeof dataPeople.people.departments.sales === 'number' &&
      typeof dataPeople.people.departments.dev === 'number' &&
      typeof dataPeople.people.departments.seo === 'number' &&
      typeof dataPeople.people.departments.operation === 'number' &&
      dataPeople.people.totalTeams > 0 &&
      dataPeople.people.commissions.releasedAmount >= 500000 &&
      dataPeople.people.commissions.calculatedAmount >= 300000 &&
      typeof dataPeople.people.commissions.adjustedAmount === 'number' &&
      typeof dataPeople.people.commissions.rejectedAmount === 'number' &&
      typeof dataPeople.people.commissions.inPayrollAmount === 'number' &&
      typeof dataPeople.people.commissions.paidAmount === 'number';

    assert(ed08Passed, 'ED-08: People breakdown, total teams, and canonical commission statuses verified');

    // ----------------------------------------------------------------
    // ED-09: Payroll & Expense Overview
    // ----------------------------------------------------------------
    // Insert an expense
    const expCat = await db.selectFrom('expense_categories').selectAll().executeTakeFirst();
    const catId = expCat ? expCat.id : (1 as any);

    await db
      .insertInto('expenses')
      .values({
        category_id: catId,
        amount: 8500000,
        expense_date: '2026-09-05' as any,
        created_by_employee_id: actorId,
        approved_by_employee_id: actorId,
        source_type: 'INFRASTRUCTURE',
        note: `Server Cloud Hosting ${runId}`,
      })
      .execute();

    const dataPayrollExpense = await dashboardService.getExecutiveDashboard(targetPeriod);

    const ed09Passed = dataPayrollExpense.payrollExpense.expensesInPeriod >= 8500000;

    assert(ed09Passed, 'ED-09: Real expenses in period and payroll status reflected from real records');

    // ----------------------------------------------------------------
    // ED-10: Actionable Alerts (Pending Orders, Payments, Blocked Projects)
    // ----------------------------------------------------------------
    const dataAlerts = await dashboardService.getExecutiveDashboard(targetPeriod);

    const hasPendingOrderAlert = dataAlerts.alerts.pendingOrders.some(
      (o) => o.id === String(pendingOrder.id),
    );
    const hasPendingPaymentAlert = dataAlerts.alerts.pendingPayments.some(
      (p) => p.id === String(testPendingPayment.id),
    );
    const hasBlockedProjectAlert = dataAlerts.alerts.blockedProjects.some(
      (b) => b.id === String(blockedProject.id) && b.blockedReason === 'Chờ đối tác cấp quyền API Gateway',
    );

    const ed10Passed = hasPendingOrderAlert && hasPendingPaymentAlert && hasBlockedProjectAlert;

    assert(
      ed10Passed,
      'ED-10: Actionable alerts capture pending orders, pending payments, and blocked projects with task reason',
    );
  } catch (error: any) {
    console.error('Fatal error in Phase H test suite:', error);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('====================================================');
  console.log(`PHASE H EXECUTIVE DASHBOARD SUITE FINISHED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhaseHExecutiveDashboardSuite();
}
