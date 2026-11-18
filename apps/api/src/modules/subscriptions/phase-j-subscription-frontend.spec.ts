import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';

function assert(condition: boolean, testName: string, extra?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${extra ? ' -> ' + extra : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

async function runPhaseJSubscriptionSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE J: SUBSCRIPTION FRONTEND CONTRACT SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const subService = app.get<SubscriptionsService>(SubscriptionsService);
  const subController = app.get<SubscriptionsController>(SubscriptionsController);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // 1. Fixture Customer (Account), Contact, Employees, Service, Order, OrderItem
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirst();

    const [emp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-SUB-J-${runId}`,
        full_name: `Sale Rep Sub J ${runId}`,
        phone: '0988111222',
        position_id: salePos ? salePos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEV-J-${runId}`,
        full_name: `Dev Eng Sub J ${runId}`,
        phone: '0988333444',
        position_id: devPos ? devPos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [account] = await db
      .insertInto('accounts')
      .values({
        company_name: `Corp Sub J ${runId}`,
        phone: '0281234567',
        email: `corp_sub_${runId}@crm.local`,
      })
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: `Contact Person ${runId}`,
        position: 'CEO',
        phone: '0988776655',
        email: `contact_${runId}@corp.local`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [srv] = await db
      .insertInto('services')
      .values({
        name: `Recurring SEO Suite ${runId}`,
        code: `SRV-SEO-${runId}`,
        service_type: 'RECURRING',
        is_active: true,
      })
      .returningAll()
      .execute();

    // Insert commission policies for this service to satisfy policy matcher
    await db.insertInto('commission_policies').values([
      {
        policy_name: `Sale Policy ${runId}`,
        policy_type: 'SALE',
        service_id: srv.id,
        position_id: salePos ? salePos.id : (1 as any),
        rate: 0.1 as any,
        effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any,
      },
      {
        policy_name: `Dev Delivery Policy ${runId}`,
        policy_type: 'PROJECT_DELIVERY',
        service_id: srv.id,
        position_id: devPos ? devPos.id : (1 as any),
        assignee_count: 1,
        rate: 0.05 as any,
        effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any,
      },
    ]).execute();

    const [order] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-SUB-J-${runId}`,
        account_id: account.id,
        primary_contact_id: contact.id,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const reqTemplateId = reqTemplate ? reqTemplate.id : (1 as any);

    const [orderItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        closing_sale_id: emp.id,
        service_id: srv.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 15000000,
        discount_amount: 0,
        net_service_value: 15000000,
        vat_amount: 1500000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    const accountantCandidateUser = { employeeId: emp.id, roles: ['ACCOUNTANT'] };
    const eligibleOrderItems = await subController.getEligibleOrderItems(accountantCandidateUser);
    assert(
      eligibleOrderItems.some((item) => item.orderItemId === String(orderItem.id)),
      'SUB-CREATE: Accountant sees approved recurring order items that have no subscription',
    );

    const [cancelledRecurringItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        closing_sale_id: emp.id,
        service_id: srv.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 1000000,
        discount_amount: 0,
        net_service_value: 1000000,
        vat_amount: 100000,
        approval_status: 'CANCELLED',
        delivery_status: 'CANCELLED',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();
    assert(
      !eligibleOrderItems.some((item) => item.orderItemId === String(cancelledRecurringItem.id)),
      'SUB-CREATE: Cancelled recurring order items are not offered for contract creation',
    );

    let nonAccountantCandidateAccessDenied = false;
    try {
      await subController.getEligibleOrderItems({ employeeId: emp.id, roles: ['SALE'] });
    } catch (error) {
      nonAccountantCandidateAccessDenied = error instanceof ForbiddenException;
    }
    assert(
      nonAccountantCandidateAccessDenied,
      'SUB-CREATE: Eligible order item list is restricted to accountants and administrators',
    );

    // 2. Create Subscription & generate 2 periods
    const sub = await subService.createSubscription({
      orderItemId: String(orderItem.id),
      billingInterval: 'MONTH',
      intervalCount: 1,
      autoRenew: true,
    });
    const subId = String(sub.id);
    const eligibleAfterCreate = await subController.getEligibleOrderItems(accountantCandidateUser);
    assert(
      !eligibleAfterCreate.some((item) => item.orderItemId === String(orderItem.id)),
      'SUB-CREATE: Order item disappears from eligible list after a subscription is created',
    );

    const [projectService] = await db
      .insertInto('services')
      .values({
        name: `Project Service ${runId}`,
        code: `SRV-PROJECT-${runId}`,
        service_type: 'PROJECT',
        is_active: true,
      })
      .returningAll()
      .execute();
    const [projectOrderItem] = await db
      .insertInto('order_items')
      .values({
        order_id: order.id,
        closing_sale_id: emp.id,
        service_id: projectService.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 1000000,
        discount_amount: 0,
        net_service_value: 1000000,
        vat_amount: 100000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();
    let nonRecurringSubscriptionRejected = false;
    try {
      await subService.createSubscription({ orderItemId: String(projectOrderItem.id) });
    } catch (error) {
      nonRecurringSubscriptionRejected = error instanceof BadRequestException;
    }
    assert(
      nonRecurringSubscriptionRejected,
      'SUB-CREATE: Project order items cannot be converted into subscriptions',
    );

    const periodsRes = await subService.generateServicePeriods(subId, 2);
    const period1 = periodsRes[0];
    const period2 = periodsRes[1];

    // Assign period 1 to devEmp
    await subService.assignServicePeriod(String(period1.id), String(devEmp.id), 'PRIMARY', 'Initial assignment');

    // Record acceptance for period 1
    await subService.recordServicePeriodAcceptance(
      String(period1.id),
      {
        customerContactId: String(contact.id),
        acceptedByName: 'CEO Acceptance Person',
        evidenceDocument: 'https://storage.crm.local/evidence-acceptance-p1.pdf',
      },
      String(emp.id),
    );

    // Record payment for period 1
    await subService.recordServicePeriodPayment(String(period1.id), undefined, true);

    // ----------------------------------------------------------------
    // ADMIN CONTEXT FOR BASE CONTRACT CHECKS (SUB-01 to SUB-10)
    // ----------------------------------------------------------------
    const userAdmin = {
      employeeId: emp.id,
      roles: ['ADMIN'],
      permissions: ['ORDER_VIEW_ALL'],
    };

    // SUB-01: List query returns paginated data with summary counts
    const list1 = await subController.getSubscriptions({ page: 1, limit: 10 }, userAdmin);
    assert(
      Array.isArray(list1.data) && list1.total >= 1 && list1.summary.totalActive >= 1,
      'SUB-01: Query subscriptions list returns paginated data and summary counts',
    );

    const foundItem = list1.data.find((item) => item.id === subId);
    assert(
      !!foundItem &&
        foundItem.customer.name === `Corp Sub J ${runId}` &&
        foundItem.service.code === `SRV-SEO-${runId}` &&
        foundItem.orderCode === `ORD-SUB-J-${runId}`,
      'SUB-01: List item contains accurate customer, service, and order mapping',
    );

    // SUB-02: Filter by status
    const listActive = await subController.getSubscriptions({ status: 'ACTIVE', page: 1, limit: 10 }, userAdmin);
    assert(
      listActive.data.every((i) => i.status === 'ACTIVE') && listActive.data.some((i) => i.id === subId),
      'SUB-02: Filter by status=ACTIVE returns matching subscriptions',
    );

    // SUB-03: Filter by billing_interval
    const listMonth = await subController.getSubscriptions({ billing_interval: 'MONTH', page: 1, limit: 10 }, userAdmin);
    assert(
      listMonth.data.every((i) => i.billingInterval === 'MONTH') && listMonth.data.some((i) => i.id === subId),
      'SUB-03: Filter by billing_interval=MONTH returns matching subscriptions',
    );

    // SUB-04: Search by customer name, service name, or order code
    const searchRes = await subController.getSubscriptions({ search: `Corp Sub J ${runId}`, page: 1, limit: 10 }, userAdmin);
    assert(
      searchRes.data.length === 1 && searchRes.data[0].id === subId,
      'SUB-04: Search by customer company name returns exact matching subscription',
    );

    const searchOrderRes = await subController.getSubscriptions({ search: `ORD-SUB-J-${runId}`, page: 1, limit: 10 }, userAdmin);
    assert(
      searchOrderRes.data.length === 1 && searchOrderRes.data[0].id === subId,
      'SUB-04: Search by order code returns exact matching subscription',
    );

    // SUB-05: Detailed query GET /subscriptions/:id
    const detail = await subController.getSubscriptionById(subId, userAdmin);
    assert(
      detail.id === subId &&
        detail.customer.name === `Corp Sub J ${runId}` &&
        detail.customer.contactName === `Contact Person ${runId}` &&
        detail.service.code === `SRV-SEO-${runId}` &&
        detail.closingSale?.employeeCode === `EMP-SUB-J-${runId}` &&
        detail.netServiceValue === 15000000,
      'SUB-05: Detailed subscription view returns complete contract, customer, service, and closing sale info',
    );

    // SUB-06: Periods history populated in chronological order
    assert(
      detail.periods.length >= 2 &&
        detail.periods[0].periodIndex === 1 &&
        detail.periods[1].periodIndex === 2,
      'SUB-06: Service periods are ordered chronologically by periodIndex ASC',
    );

    // SUB-07: Period assignments populated
    const p1Detail = detail.periods.find((p) => p.periodIndex === 1);
    assert(
      !!p1Detail &&
        p1Detail.assignments.length >= 1 &&
        p1Detail.assignments[0].assignmentType === 'PRIMARY' &&
        p1Detail.assignments[0].employeeCode === `EMP-DEV-J-${runId}`,
      'SUB-07: Service period assignments are accurately linked and returned',
    );

    // SUB-08: Period customer acceptance details
    assert(
      !!p1Detail &&
        !!p1Detail.acceptance &&
        p1Detail.acceptance.acceptedByName === 'CEO Acceptance Person' &&
        p1Detail.acceptance.evidenceDocument.includes('evidence-acceptance-p1.pdf') &&
        p1Detail.executionStatus === 'ACCEPTED' &&
        p1Detail.paymentStatus === 'FULLY_PAID',
      'SUB-08: Period acceptance and payment states accurately reflected in detail',
    );

    // SUB-09: Linked Project when created
    const [prj] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItem.id,
        project_name: `Project Delivery Sub J ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 50,
      })
      .returningAll()
      .execute();

    const detailWithPrj = await subController.getSubscriptionById(subId, userAdmin);
    assert(
      !!detailWithPrj.linkedProject &&
        detailWithPrj.linkedProject.projectName === `Project Delivery Sub J ${runId}` &&
        detailWithPrj.linkedProject.progressPercent === 50,
      'SUB-09: Linked project is dynamically retrieved and populated in subscription detail',
    );

    // SUB-10: Non-existent ID throws 404
    let notFoundCaught = false;
    try {
      await subController.getSubscriptionById('99999999', userAdmin);
    } catch (err: any) {
      if (err instanceof NotFoundException) notFoundCaught = true;
    }
    assert(notFoundCaught, 'SUB-10: Non-existent subscription ID returns 404 NotFoundException');

    // ================================================================
    // FIXTURES FOR SECURITY TESTS SUB-SEC-01 TO SUB-SEC-07
    // ================================================================
    // 1. Give Sub A an approved payment plan for accounting scope
    await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        version: 1,
        status: 'APPROVED',
        created_by_employee_id: emp.id,
        config_snapshot: JSON.stringify({ installments: [] }),
        approved_at: new Date() as any,
      })
      .execute();

    // 2. Fixture Sale B and Sub B (Different Sales ownership)
    const [empSaleB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-SALEB-${runId}`,
        full_name: `Sale B Sub J ${runId}`,
        phone: '0988000111',
        position_id: salePos ? salePos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [accountB] = await db
      .insertInto('accounts')
      .values({
        company_name: `Corp Sub B J ${runId}`,
        phone: '0281234999',
        email: `corp_sub_b_${runId}@crm.local`,
      })
      .returningAll()
      .execute();

    const [contactB] = await db
      .insertInto('contacts')
      .values({
        account_id: accountB.id,
        full_name: `Contact Person B ${runId}`,
        position: 'COO',
        phone: '0988776611',
        email: `contact_b_${runId}@corp.local`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [orderB] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-SUB-JB-${runId}`,
        account_id: accountB.id,
        primary_contact_id: contactB.id,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [orderItemB] = await db
      .insertInto('order_items')
      .values({
        order_id: orderB.id,
        closing_sale_id: empSaleB.id,
        service_id: srv.id,
        requirement_template_id: reqTemplateId,
        requirement_template_version: 1,
        original_price: 18000000,
        discount_amount: 0,
        net_service_value: 18000000,
        vat_amount: 1800000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    const subB = await subService.createSubscription({
      orderItemId: String(orderItemB.id),
      billingInterval: 'MONTH',
      intervalCount: 1,
      autoRenew: true,
    });
    const subBId = String(subB.id);

    // 3. Fixture Sales Team A (with emp/saleA) and Sales Team B (with empSaleB)
    const [empLeaderSalesA] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEADSA-${runId}`,
        full_name: `Leader Sales A ${runId}`,
        phone: '0988000222',
        position_id: salePos ? salePos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [empLeaderSalesB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEADSB-${runId}`,
        full_name: `Leader Sales B ${runId}`,
        phone: '0988000333',
        position_id: salePos ? salePos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [teamSalesA] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-SA-${runId}`,
        name: `Sales Team A ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    const [teamSalesB] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-SB-${runId}`,
        name: `Sales Team B ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    await db.insertInto('team_memberships').values([
      {
        team_id: teamSalesA.id,
        employee_id: empLeaderSalesA.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamSalesA.id,
        employee_id: emp.id, // saleA
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamSalesB.id,
        employee_id: empLeaderSalesB.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamSalesB.id,
        employee_id: empSaleB.id, // saleB
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
    ]).execute();

    // 4. Fixture Dev Team A (with devEmp assigned to subA) and Dev Team B (unassigned)
    const [empLeaderDevA] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEADDEVA-${runId}`,
        full_name: `Leader Dev A ${runId}`,
        phone: '0988000444',
        position_id: devPos ? devPos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [empLeaderDevB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEADDEVB-${runId}`,
        full_name: `Leader Dev B ${runId}`,
        phone: '0988000555',
        position_id: devPos ? devPos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [teamDevA] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-DA-${runId}`,
        name: `Dev Team A ${runId}`,
        department: 'DEV',
      })
      .returningAll()
      .execute();

    const [teamDevB] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-DB-${runId}`,
        name: `Dev Team B ${runId}`,
        department: 'DEV',
      })
      .returningAll()
      .execute();

    await db.insertInto('team_memberships').values([
      {
        team_id: teamDevA.id,
        employee_id: empLeaderDevA.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamDevA.id,
        employee_id: devEmp.id, // assigned to subA
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamDevB.id,
        employee_id: empLeaderDevB.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
    ]).execute();

    // 5. Fixture Accountant
    const acctPos = await db.selectFrom('positions').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirst();
    const [empAccountant] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-ACCT-${runId}`,
        full_name: `Accountant Staff ${runId}`,
        phone: '0988000666',
        position_id: acctPos ? acctPos.id : (1 as any),
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // User contexts
    const userSaleA = { employeeId: emp.id, roles: ['SALE'] };
    const userSaleB = { employeeId: empSaleB.id, roles: ['SALE'] };
    const userLeaderSalesA = { employeeId: empLeaderSalesA.id, roles: ['SALES_TEAM_LEADER'] };
    const userLeaderSalesB = { employeeId: empLeaderSalesB.id, roles: ['SALES_TEAM_LEADER'] };
    const userLeaderDevA = { employeeId: empLeaderDevA.id, roles: ['DEV_TEAM_LEADER'] };
    const userLeaderDevB = { employeeId: empLeaderDevB.id, roles: ['DEV_TEAM_LEADER'] };
    const userAccountant = { employeeId: empAccountant.id, roles: ['ACCOUNTANT'] };
    const userBoss = { employeeId: emp.id, roles: ['BOSS'] };

    // ----------------------------------------------------------------
    // SUB-SEC-01: SALE không được xem subscription ngoài scope
    // ----------------------------------------------------------------
    const resSaleA = await subController.getSubscriptions({ page: 1, limit: 50 }, userSaleA);
    assert(
      resSaleA.data.some((s) => s.id === subId) && !resSaleA.data.some((s) => s.id === subBId),
      'SUB-SEC-01: SALE A sees only own subscription (subId) and NOT other sale subscription (subBId)',
    );

    const resSaleB = await subController.getSubscriptions({ page: 1, limit: 50 }, userSaleB);
    assert(
      resSaleB.data.some((s) => s.id === subBId) && !resSaleB.data.some((s) => s.id === subId),
      'SUB-SEC-01: SALE B sees only own subscription (subBId) and NOT subId',
    );

    // ----------------------------------------------------------------
    // SUB-SEC-02: SALES_TEAM_LEADER Team A không xem subscription ngoài current team
    // ----------------------------------------------------------------
    const resLeaderA = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderSalesA);
    assert(
      resLeaderA.data.some((s) => s.id === subId) && !resLeaderA.data.some((s) => s.id === subBId),
      'SUB-SEC-02: SALES_TEAM_LEADER Team A sees only Team A subscriptions and NOT Team B',
    );

    const resLeaderB = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderSalesB);
    assert(
      resLeaderB.data.some((s) => s.id === subBId) && !resLeaderB.data.some((s) => s.id === subId),
      'SUB-SEC-02: SALES_TEAM_LEADER Team B sees only Team B subscriptions and NOT Team A',
    );

    // ----------------------------------------------------------------
    // SUB-SEC-03: DEV/SEO Leader không xem subscription/service period ngoài team assignment
    // ----------------------------------------------------------------
    const resDevA = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderDevA);
    assert(
      resDevA.data.some((s) => s.id === subId) && !resDevA.data.some((s) => s.id === subBId),
      'SUB-SEC-03: DEV Leader Team A sees subId (assigned to member devEmp) and NOT subBId',
    );

    const resDevB = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderDevB);
    assert(
      !resDevB.data.some((s) => s.id === subId) && !resDevB.data.some((s) => s.id === subBId),
      'SUB-SEC-03: DEV Leader Team B with zero assignments cannot see subId or subBId',
    );

    // ----------------------------------------------------------------
    // SUB-SEC-04: detail ID ngoài scope => 403 ForbiddenException
    // ----------------------------------------------------------------
    let caughtSaleAOnB = false;
    try {
      await subController.getSubscriptionById(subBId, userSaleA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleAOnB = true;
    }
    assert(caughtSaleAOnB, 'SUB-SEC-04: SALE A accessing out-of-scope subBId throws 403 ForbiddenException');

    let caughtLeaderAOnB = false;
    try {
      await subController.getSubscriptionById(subBId, userLeaderSalesA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtLeaderAOnB = true;
    }
    assert(caughtLeaderAOnB, 'SUB-SEC-04: SALES_TEAM_LEADER Team A accessing Team B subBId throws 403 ForbiddenException');

    let caughtDevBOnA = false;
    try {
      await subController.getSubscriptionById(subId, userLeaderDevB);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtDevBOnA = true;
    }
    assert(caughtDevBOnA, 'SUB-SEC-04: DEV Leader Team B accessing unassigned subId throws 403 ForbiddenException');

    // ----------------------------------------------------------------
    // SUB-SEC-05: ACCOUNTANT access đúng exact accounting scope, không accidental global
    // ----------------------------------------------------------------
    const resAcct = await subController.getSubscriptions({ page: 1, limit: 50 }, userAccountant);
    assert(
      resAcct.data.some((s) => s.id === subId) && !resAcct.data.some((s) => s.id === subBId),
      'SUB-SEC-05: ACCOUNTANT sees subId (approved payment plan) and NOT subBId (no accounting obligations)',
    );

    let caughtAcctOnB = false;
    try {
      await subController.getSubscriptionById(subBId, userAccountant);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtAcctOnB = true;
    }
    assert(caughtAcctOnB, 'SUB-SEC-05: ACCOUNTANT accessing subBId without payment obligations throws 403 ForbiddenException');

    // ----------------------------------------------------------------
    // SUB-SEC-06: read-only role không gọi được generate/cancel
    // ----------------------------------------------------------------
    let caughtSaleGen = false;
    try {
      await subController.generateServicePeriods(subId, { count: 1 }, userSaleA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleGen = true;
    }
    assert(caughtSaleGen, 'SUB-SEC-06: SALE cannot call generateServicePeriods (throws 403)');

    let caughtSaleCancel = false;
    try {
      await subController.cancelSubscription(subId, userSaleA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleCancel = true;
    }
    assert(caughtSaleCancel, 'SUB-SEC-06: SALE cannot call cancelSubscription (throws 403)');

    let caughtDevCancel = false;
    try {
      await subController.cancelSubscription(subId, userLeaderDevA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtDevCancel = true;
    }
    assert(caughtDevCancel, 'SUB-SEC-06: DEV Leader cannot call cancelSubscription (throws 403)');

    let caughtAcctGen = false;
    try {
      await subController.generateServicePeriods(subId, { count: 1 }, userAccountant);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtAcctGen = true;
    }
    assert(caughtAcctGen, 'SUB-SEC-06: ACCOUNTANT cannot call generateServicePeriods (throws 403)');

    // ----------------------------------------------------------------
    // SUB-SEC-07: ADMIN/BOSS vẫn đúng global access
    // ----------------------------------------------------------------
    const resBoss = await subController.getSubscriptions({ page: 1, limit: 50 }, userBoss);
    assert(
      resBoss.data.some((s) => s.id === subId) && resBoss.data.some((s) => s.id === subBId),
      'SUB-SEC-07: BOSS maintains global list access to both subId and subBId',
    );

    const bossDetailA = await subController.getSubscriptionById(subId, userBoss);
    assert(bossDetailA.id === subId, 'SUB-SEC-07: BOSS can view detail of subId');

    const bossDetailB = await subController.getSubscriptionById(subBId, userBoss);
    assert(bossDetailB.id === subBId, 'SUB-SEC-07: BOSS can view detail of subBId');

    const bossGenRes = await subController.generateServicePeriods(subBId, { count: 1 }, userBoss);
    assert(
      Array.isArray(bossGenRes) && bossGenRes.length >= 1,
      'SUB-SEC-07: BOSS can generate service periods for subscription',
    );
    // ----------------------------------------------------------------
    // SUB-SEC-08: Move member/team cập nhật scope ngay lập tức theo thời gian thực
    // ----------------------------------------------------------------
    // Chuyển devEmp từ Dev Team A sang Dev Team B
    await db
      .updateTable('team_memberships')
      .set({
        effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
      })
      .where('team_id', '=', teamDevA.id as any)
      .where('employee_id', '=', devEmp.id as any)
      .execute();

    await db
      .insertInto('team_memberships')
      .values({
        team_id: teamDevB.id,
        employee_id: devEmp.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW(), NULL, '[]')` as any,
      })
      .execute();

    // Dev Leader A mất quyền truy cập subId ngay lập tức
    const resDevAAfterMove = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderDevA);
    assert(
      !resDevAAfterMove.data.some((s) => s.id === subId),
      'SUB-SEC-08: DEV Leader Team A immediately loses list access to subId after member moves to Team B',
    );

    let caughtDevAAfterMove = false;
    try {
      await subController.getSubscriptionById(subId, userLeaderDevA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtDevAAfterMove = true;
    }
    assert(
      caughtDevAAfterMove,
      'SUB-SEC-08: DEV Leader Team A immediately receives 403 on subId detail after member moves to Team B',
    );

    // Dev Leader B được cấp quyền truy cập subId ngay lập tức
    const resDevBAfterMove = await subController.getSubscriptions({ page: 1, limit: 50 }, userLeaderDevB);
    assert(
      resDevBAfterMove.data.some((s) => s.id === subId),
      'SUB-SEC-08: DEV Leader Team B immediately gains list access to subId after member arrives in Team B',
    );

    const devBDetailAfterMove = await subController.getSubscriptionById(subId, userLeaderDevB);
    assert(
      devBDetailAfterMove.id === subId,
      'SUB-SEC-08: DEV Leader Team B immediately gains 200 OK access to subId detail after member arrives in Team B',
    );

    // ----------------------------------------------------------------
    // SUB-SEC-09: Data Minimization cho Tech Leader (Dev/SEO Leader)
    // ----------------------------------------------------------------
    // Tech Leader xem detail: paymentPlan được redact thành null
    assert(
      devBDetailAfterMove.paymentPlan === null,
      'SUB-SEC-09: Tech Leader response redacts sensitive financial paymentPlan to null (Data Minimization)',
    );
    assert(
      Array.isArray(devBDetailAfterMove.periods) && devBDetailAfterMove.periods.length > 0,
      'SUB-SEC-09: Tech Leader still receives full operational service periods and assignments',
    );

    // Accountant xem detail: paymentPlan hiển thị đầy đủ
    const acctDetailA = await subController.getSubscriptionById(subId, userAccountant);
    assert(
      acctDetailA.paymentPlan !== null && Array.isArray(acctDetailA.paymentPlan.installments),
      'SUB-SEC-09: ACCOUNTANT receives full payment plan with installments for accounting operations',
    );

    // Boss xem detail: paymentPlan hiển thị đầy đủ
    assert(
      bossDetailA.paymentPlan !== null && Array.isArray(bossDetailA.paymentPlan.installments),
      'SUB-SEC-09: BOSS receives full payment plan with installments',
    );

    console.log('====================================================');
    console.log('PHASE J SUBSCRIPTION SUITE FINISHED: ALL TESTS PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

runPhaseJSubscriptionSuite().catch((err) => {
  console.error('❌ Phase J test suite error:', err);
  process.exit(1);
});
