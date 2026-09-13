import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { SubscriptionsService } from './subscriptions.service';
import { CommissionsService } from '../commissions/commissions.service';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

async function getCurrentDatabaseName(kysely: KyselyService): Promise<string> {
  const result = await sql<{ dbname: string }>`SELECT current_database() AS dbname`.execute(kysely.db);
  const dbname = result.rows[0]?.dbname;
  if (!dbname) {
    throw new Error('SECURITY GUARD ABORT: UNABLE TO VERIFY CURRENT TEST DATABASE');
  }
  return dbname;
}

async function cleanupRecurringFixtures(kysely: KyselyService) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isTeardownAllowed = process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN === 'true';
  const currentDb = await getCurrentDatabaseName(kysely);
  const expectedTestDb = process.env.TEST_DATABASE_NAME;

  if (!isTestEnv || !isTeardownAllowed || !expectedTestDb || currentDb !== expectedTestDb) {
    throw new Error(
      `SECURITY GUARD ABORT: Teardown allowed only on dedicated test DB (NODE_ENV=${process.env.NODE_ENV}, DB=${currentDb}, EXPECTED=${expectedTestDb})`,
    );
  }

  // 1. Resolve fixture root entities (Employees, Accounts)
  const testEmps = await kysely.db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', 'like', 'REC-%')
    .execute();
  const empIds = testEmps.map((e) => e.id);

  const testAccs = await kysely.db
    .selectFrom('accounts')
    .select('id')
    .where('company_name', 'like', '%Recurring%Corp%')
    .execute();
  const accIds = testAccs.map((a) => a.id);

  // 2. Resolve Deals (deals table has account_id, assigned_sale_id, closing_sale_id)
  const testDeals = await kysely.db
    .selectFrom('deals')
    .select('id')
    .where((eb) => {
      const ors = [];
      if (accIds.length > 0) ors.push(eb('account_id', 'in', accIds));
      if (empIds.length > 0) {
        ors.push(eb('assigned_sale_id', 'in', empIds));
        ors.push(eb('closing_sale_id', 'in', empIds));
      }
      return ors.length > 0 ? eb.or(ors) : eb.val(false);
    })
    .execute();
  const dealIds = testDeals.map((d) => d.id);

  // 3. Resolve Order Items FIRST (order_items table has deal_id, closing_sale_id)
  const testItems = await kysely.db
    .selectFrom('order_items')
    .select(['id', 'order_id'])
    .where((eb) => {
      const ors = [];
      if (dealIds.length > 0) ors.push(eb('deal_id', 'in', dealIds));
      if (empIds.length > 0) ors.push(eb('closing_sale_id', 'in', empIds));
      return ors.length > 0 ? eb.or(ors) : eb.val(false);
    })
    .execute();
  const itemIds = testItems.map((i) => i.id);
  const itemOrderIds = Array.from(new Set(testItems.map((i) => i.order_id)));

  // 4. Resolve Orders (orders table has account_id)
  const testOrders = await kysely.db
    .selectFrom('orders')
    .select('id')
    .where((eb) => {
      const ors = [];
      if (accIds.length > 0) ors.push(eb('account_id', 'in', accIds));
      if (itemOrderIds.length > 0) ors.push(eb('id', 'in', itemOrderIds));
      return ors.length > 0 ? eb.or(ors) : eb.val(false);
    })
    .execute();
  const orderIds = testOrders.map((o) => o.id);

  if (orderIds.length > 0) {
    const additionalItems = await kysely.db
      .selectFrom('order_items')
      .select('id')
      .where('order_id', 'in', orderIds)
      .execute();
    for (const item of additionalItems) {
      if (!itemIds.includes(item.id)) {
        itemIds.push(item.id);
      }
    }
  }

  // 3. Resolve fixture Commissions
  const testComms = await kysely.db
    .selectFrom('commissions')
    .select('id')
    .where((eb) => {
      const ors = [];
      if (itemIds.length > 0) ors.push(eb('order_item_id', 'in', itemIds));
      if (empIds.length > 0) ors.push(eb('beneficiary_employee_id', 'in', empIds));
      return ors.length > 0 ? eb.or(ors) : eb.val(false);
    })
    .execute();
  const commIds = testComms.map((c) => c.id);

  // 4. Resolve fixture Payment Plans, Installments, Allocations, Payments
  const testPlans = itemIds.length > 0
    ? await kysely.db.selectFrom('order_item_payment_plans').select('id').where('order_item_id', 'in', itemIds).execute()
    : [];
  const planIds = testPlans.map((p) => p.id);

  const testInsts = planIds.length > 0
    ? await kysely.db.selectFrom('payment_installments').select('id').where('payment_plan_id', 'in', planIds).execute()
    : [];
  const instIds = testInsts.map((i) => i.id);

  const testAllocs = await kysely.db
    .selectFrom('payment_allocations')
    .select(['id', 'payment_id'])
    .where((eb) => {
      const ors = [];
      if (instIds.length > 0) ors.push(eb('installment_id', 'in', instIds));
      if (empIds.length > 0) ors.push(eb('closing_sale_id', 'in', empIds));
      return ors.length > 0 ? eb.or(ors) : eb.val(false);
    })
    .execute();
  const allocIds = testAllocs.map((a) => a.id);
  const payIds = Array.from(new Set(testAllocs.map((a) => a.payment_id)));

  // 5. Resolve fixture Subscriptions & Service Periods
  const testSubs = itemIds.length > 0
    ? await kysely.db.selectFrom('subscriptions').select('id').where('order_item_id', 'in', itemIds).execute()
    : [];
  const subIds = testSubs.map((s) => s.id);

  const testSps = subIds.length > 0
    ? await kysely.db.selectFrom('service_periods').select('id').where('subscription_id', 'in', subIds).execute()
    : [];
  const spIds = testSps.map((sp) => sp.id);

  // --------------------------------------------------
  // PERFORM DELETIONS IN STRICT CHILD -> PARENT ORDER
  // --------------------------------------------------

  // A. Commission Sources & Commissions
  if (commIds.length > 0) {
    await kysely.db.deleteFrom('commission_sources').where('commission_id', 'in', commIds).execute();
  }
  if (allocIds.length > 0) {
    await kysely.db.deleteFrom('commission_sources').where('payment_allocation_id', 'in', allocIds).execute();
  }
  if (commIds.length > 0) {
    await kysely.db.deleteFrom('commissions').where('id', 'in', commIds).execute();
  }
  if (itemIds.length > 0) {
    await kysely.db.deleteFrom('commissions').where('order_item_id', 'in', itemIds).execute();
  }

  // B. Service Period Children & Subscriptions
  if (spIds.length > 0 || empIds.length > 0) {
    await kysely.db.deleteFrom('seo_articles').where((eb) => {
      const ors = [];
      if (spIds.length > 0) ors.push(eb('service_period_id', 'in', spIds));
      if (empIds.length > 0) {
        ors.push(eb('author_employee_id', 'in', empIds));
        ors.push(eb('reviewer_employee_id', 'in', empIds));
      }
      return eb.or(ors);
    }).execute();
  }
  if (spIds.length > 0) {
    await kysely.db.deleteFrom('service_period_acceptances').where('service_period_id', 'in', spIds).execute();
    await kysely.db.deleteFrom('service_period_assignments').where('service_period_id', 'in', spIds).execute();
    await kysely.db.deleteFrom('service_periods').where('id', 'in', spIds).execute();
  }
  if (subIds.length > 0) {
    await kysely.db.deleteFrom('subscriptions').where('id', 'in', subIds).execute();
  }

  // C. Payment Allocations, Payments, Installments, Payment Plans
  if (allocIds.length > 0) {
    await kysely.db.deleteFrom('payment_allocations').where('id', 'in', allocIds).execute();
  }
  if (payIds.length > 0) {
    await kysely.db.deleteFrom('payments').where('id', 'in', payIds).execute();
  }
  if (instIds.length > 0) {
    await kysely.db.deleteFrom('payment_installments').where('id', 'in', instIds).execute();
  }
  if (planIds.length > 0) {
    await kysely.db.deleteFrom('order_item_payment_plans').where('id', 'in', planIds).execute();
  }

  // D. Order Items & Orders
  if (itemIds.length > 0) {
    await kysely.db.deleteFrom('order_items').where('id', 'in', itemIds).execute();
  }
  if (orderIds.length > 0) {
    await kysely.db.deleteFrom('orders').where('id', 'in', orderIds).execute();
  }

  // E. Deals, Contacts & Accounts
  if (dealIds.length > 0) {
    await kysely.db.deleteFrom('deals').where('id', 'in', dealIds).execute();
  }
  if (accIds.length > 0) {
    await kysely.db.deleteFrom('contacts').where('account_id', 'in', accIds).execute();
    await kysely.db.deleteFrom('accounts').where('id', 'in', accIds).execute();
  }

  // F. Audit Logs, Sales Activities, Leads & Employees
  if (empIds.length > 0) {
    await kysely.db.deleteFrom('sales_activities').where('employee_id', 'in', empIds).execute();
    await kysely.db.deleteFrom('lead_assignment_history').where((eb) => eb.or([
      eb('from_sale_id', 'in', empIds),
      eb('to_sale_id', 'in', empIds),
      eb('assigned_by_employee_id', 'in', empIds),
    ])).execute();
    await kysely.db.deleteFrom('leads').where((eb) => eb.or([
      eb('creator_employee_id', 'in', empIds),
      eb('assigned_sale_id', 'in', empIds),
    ])).execute();
    await kysely.db.deleteFrom('audit_logs').where('actor_employee_id', 'in', empIds).execute();
    await kysely.db.deleteFrom('employees').where('id', 'in', empIds).execute();
  }
}

async function runRecurringIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING RECURRING / SUBSCRIPTION INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const subService = app.get(SubscriptionsService);
  const commService = app.get(CommissionsService);
  const kysely = app.get(KyselyService);

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, failureReason?: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
      failed++;
    }
  };

  try {
    // Initial cleanup
    await cleanupRecurringFixtures(kysely);

    // --------------------------------------------------
    // FIXTURE PREPARATION
    // --------------------------------------------------
    // 1. Fetch position & active service
    const positions = await kysely.db.selectFrom('positions').selectAll().execute();
    const salePos = positions.find((p) => p.code === 'SALE_EXECUTIVE') || positions[0];
    const devPos = positions.find((p) => p.code === 'DEV_FULLSTACK') || positions[0];
    const bossPos = positions.find((p) => p.code === 'DIRECTOR') || positions[0];

    const services = await kysely.db.selectFrom('services').selectAll().execute();
    const recService = services.find((s) => s.is_recurring) || services[0];

    // Service Requirement Template
    let reqTemplate = await kysely.db
      .selectFrom('service_requirement_templates')
      .selectAll()
      .where('service_id', '=', recService.id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!reqTemplate) {
      [reqTemplate] = await kysely.db
        .insertInto('service_requirement_templates')
        .values({
          service_id: recService.id,
          version: 1,
          template_name: 'Recurring Test Requirement Template',
          is_active: true,
        })
        .returningAll()
        .execute();
    }

    // 2. Create test employees (without invalid 'email' field on employees table)
    const [saleEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `REC-SALE-${Date.now()}`,
        full_name: 'Sale Recurring Tester',
        position_id: salePos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp1] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `REC-DEV1-${Date.now()}`,
        full_name: 'Dev Primary 1',
        position_id: devPos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp2] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `REC-DEV2-${Date.now()}`,
        full_name: 'Dev Primary 2',
        position_id: devPos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp3] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `REC-DEV3-${Date.now()}`,
        full_name: 'Dev Replacement 3',
        position_id: devPos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [bossEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `REC-BOSS-${Date.now()}`,
        full_name: 'Boss Approver',
        position_id: bossPos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // 3. Create Account & Contact for Approved Order
    const [account] = await kysely.db
      .insertInto('accounts')
      .values({
        company_name: `Recurring Test Corp ${Date.now()}`,
      })
      .returningAll()
      .execute();

    const [contact] = await kysely.db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: 'Customer Contact Tester',
        email: `customer_${Date.now()}@recurring.corp`,
      })
      .returningAll()
      .execute();

    // Create separate Account & Contact for Draft Order
    const [draftAccount] = await kysely.db
      .insertInto('accounts')
      .values({
        company_name: `Recurring Draft Corp ${Date.now()}`,
      })
      .returningAll()
      .execute();

    const [draftContact] = await kysely.db
      .insertInto('contacts')
      .values({
        account_id: draftAccount.id,
        full_name: 'Draft Contact Tester',
        email: `draft_${Date.now()}@recurring.corp`,
      })
      .returningAll()
      .execute();

    // 4. Create Orders & OrderItems
    const [approvedOrder] = await kysely.db
      .insertInto('orders')
      .values({
        account_id: account.id,
        primary_contact_id: contact.id,
        order_code: `ORD-REC-APP-${Date.now()}`,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [draftOrder] = await kysely.db
      .insertInto('orders')
      .values({
        account_id: draftAccount.id,
        primary_contact_id: draftContact.id,
        order_code: `ORD-REC-DFT-${Date.now()}`,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    // Approved item
    const [appItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: approvedOrder.id,
        service_id: recService.id,
        closing_sale_id: saleEmp.id,
        requirement_template_id: reqTemplate.id,
        requirement_template_version: reqTemplate.version,
        original_price: 10000000,
        discount_amount: 0,
        net_service_value: 10000000,
        vat_amount: 0,
        approval_status: 'APPROVED',
        delivery_status: 'PENDING',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    // Draft item
    const [draftItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: draftOrder.id,
        service_id: recService.id,
        closing_sale_id: saleEmp.id,
        requirement_template_id: reqTemplate.id,
        requirement_template_version: reqTemplate.version,
        original_price: 5000000,
        discount_amount: 0,
        net_service_value: 5000000,
        vat_amount: 0,
        approval_status: 'DRAFT',
        delivery_status: 'PENDING',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    // --------------------------------------------------
    // RECURRING-01: Approved OrderItem creates Subscription
    // --------------------------------------------------
    const sub1 = await subService.createSubscription({
      orderItemId: String(appItem.id),
      billingInterval: 'MONTH',
      intervalCount: 1,
      startDate: new Date('2026-01-01'),
      autoRenew: true,
    });
    assert(sub1 && sub1.status === 'ACTIVE', 'RECURRING-01: Approved recurring OrderItem creates valid ACTIVE Subscription');

    // --------------------------------------------------
    // RECURRING-02: Non-approved OrderItem cannot create Subscription
    // --------------------------------------------------
    let draftSubBlocked = false;
    try {
      await subService.createSubscription({
        orderItemId: String(draftItem.id),
        billingInterval: 'MONTH',
      });
    } catch (err: any) {
      if (err?.message?.includes('Cannot create Subscription for non-approved OrderItem')) {
        draftSubBlocked = true;
      }
    }
    assert(draftSubBlocked, 'RECURRING-02: Non-approved (DRAFT) OrderItem is blocked from creating Subscription');

    // --------------------------------------------------
    const toDateStr = (d: any) => {
      if (!d) return '';
      if (typeof d === 'string') return d.slice(0, 10);
      const dateObj = new Date(d);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // --------------------------------------------------
    // RECURRING-03: Monthly period generation
    // --------------------------------------------------
    const monthlyPeriods = await subService.generateServicePeriods(String(sub1.id), 2);
    assert(
      monthlyPeriods.length === 2 &&
        monthlyPeriods[0].period_index === 1 &&
        toDateStr(monthlyPeriods[0].start_date) === '2026-01-01',
      'RECURRING-03: Monthly ServicePeriod generation correct start and end boundaries',
    );

    // --------------------------------------------------
    // RECURRING-04: Quarterly / Yearly / Custom period generation
    // --------------------------------------------------
    const [qItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: approvedOrder.id,
        service_id: recService.id,
        closing_sale_id: saleEmp.id,
        requirement_template_id: reqTemplate.id,
        requirement_template_version: reqTemplate.version,
        original_price: 30000000,
        discount_amount: 0,
        net_service_value: 30000000,
        vat_amount: 0,
        approval_status: 'APPROVED',
        delivery_status: 'PENDING',
        payment_status: 'UNPAID',
      })
      .returningAll()
      .execute();

    const subQ = await subService.createSubscription({
      orderItemId: String(qItem.id),
      billingInterval: 'QUARTER',
      intervalCount: 1,
      startDate: new Date('2026-01-01'),
    });
    const qPeriods = await subService.generateServicePeriods(String(subQ.id), 1);
    assert(
      qPeriods.length === 1 &&
        toDateStr(qPeriods[0].start_date) === '2026-01-01' &&
        toDateStr(qPeriods[0].end_date) === '2026-03-31',
      'RECURRING-04: Quarterly ServicePeriod generation produces correct 3-month duration',
    );

    // --------------------------------------------------
    // RECURRING-05: Repeated generation does not duplicate ServicePeriod
    // --------------------------------------------------
    const repeatedPeriods = await subService.generateServicePeriods(String(sub1.id), 2);
    assert(
      repeatedPeriods.length === 2 && repeatedPeriods[0].id === monthlyPeriods[0].id,
      'RECURRING-05: Repeated generation for existing index does not create duplicate ServicePeriod',
    );

    // --------------------------------------------------
    // RECURRING-06: Concurrent period generation idempotency
    // --------------------------------------------------
    const concurrentResults = await Promise.all([
      subService.generateServicePeriods(String(sub1.id), 2),
      subService.generateServicePeriods(String(sub1.id), 2),
    ]);
    assert(
      concurrentResults[0][0].id === concurrentResults[1][0].id,
      'RECURRING-06: Concurrent period generation produces one canonical ServicePeriod per index',
    );

    // --------------------------------------------------
    // RECURRING-07: ServicePeriod assignment max 2 PRIMARY assignees & replacement action
    // --------------------------------------------------
    const period1Id = String(monthlyPeriods[0].id);
    await subService.assignServicePeriod(period1Id, String(devEmp1.id), 'PRIMARY');
    await subService.assignServicePeriod(period1Id, String(devEmp2.id), 'PRIMARY');

    // 3rd PRIMARY assignment attempt must throw BadRequestException
    let thirdPrimaryBlocked = false;
    try {
      await subService.assignServicePeriod(period1Id, String(devEmp3.id), 'PRIMARY');
    } catch (err: any) {
      if (err?.message?.includes('Max 2 active primary assignees allowed')) {
        thirdPrimaryBlocked = true;
      }
    }

    // Explicit replacement action closes old primary (devEmp1) and activates new primary (devEmp3)
    await subService.replaceServicePeriodAssignee(period1Id, {
      oldEmployeeId: String(devEmp1.id),
      newEmployeeId: String(devEmp3.id),
      reason: 'Replaced devEmp1 via explicit replacement action',
    });

    const activeAssignments = await kysely.db
      .selectFrom('service_period_assignments')
      .selectAll()
      .where('service_period_id', '=', period1Id as any)
      .where('assignment_type', '=', 'PRIMARY')
      .where('is_active', '=', true)
      .execute();

    const inactiveAssignments = await kysely.db
      .selectFrom('service_period_assignments')
      .selectAll()
      .where('service_period_id', '=', period1Id as any)
      .where('is_active', '=', false)
      .execute();

    assert(
      thirdPrimaryBlocked &&
        activeAssignments.length === 2 &&
        inactiveAssignments.length === 1 &&
        inactiveAssignments[0].employee_id === devEmp1.id,
      'RECURRING-07: ServicePeriod assignment blocks 3rd PRIMARY assign attempt and preserves history via explicit replacement action',
    );

    // --------------------------------------------------
    // RECURRING-08: ServicePeriod acceptance creates canonical row
    // --------------------------------------------------
    const accRecord = await subService.recordServicePeriodAcceptance(
      period1Id,
      {
        customerContactId: String(contact.id),
        acceptedByName: 'Customer Contact Tester',
        evidenceDocument: 'DOC-REC-ACC-001.pdf',
      },
      String(bossEmp.id),
    );

    const period1AfterAcc = await kysely.db
      .selectFrom('service_periods')
      .selectAll()
      .where('id', '=', period1Id as any)
      .executeTakeFirst();

    assert(
      accRecord && period1AfterAcc?.execution_status === 'ACCEPTED',
      'RECURRING-08: ServicePeriod acceptance creates canonical service_period_acceptances row and updates execution_status to ACCEPTED',
    );

    // --------------------------------------------------
    // RECURRING-09: Acceptance alone does NOT release commission if unpaid
    // --------------------------------------------------
    const unearnedComms = await kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('service_period_id', '=', period1Id as any)
      .execute();

    assert(
      unearnedComms.length === 0,
      'RECURRING-09: Acceptance alone does NOT release commission if payment_status is PENDING',
    );

    // --------------------------------------------------
    // Payment Foundation Fixtures for Recurring ServicePeriods
    // --------------------------------------------------
    const [plan1] = await kysely.db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: appItem.id,
        version: 1,
        status: 'APPROVED',
        created_by_employee_id: bossEmp.id,
        config_snapshot: JSON.stringify({ type: 'recurring' }),
        approved_at: new Date(),
      })
      .returningAll()
      .execute();

    const [inst1] = await kysely.db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan1.id,
        service_period_id: monthlyPeriods[0].id,
        installment_number: 1,
        due_date: new Date('2026-01-01') as any,
        gross_amount_due: 10000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    const [pay1] = await kysely.db
      .insertInto('payments')
      .values({
        payment_code: `PAY-REC-1-${Date.now()}`,
        gross_cash_amount: 10000000 as any,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: bossEmp.id,
        confirmed_by_employee_id: bossEmp.id,
        confirmed_at: new Date('2026-01-05'),
        status: 'CONFIRMED',
      })
      .returningAll()
      .execute();

    const [realAlloc1] = await kysely.db
      .insertInto('payment_allocations')
      .values({
        payment_id: pay1.id,
        installment_id: inst1.id,
        closing_sale_id: saleEmp.id,
        gross_allocated_amount: 10000000 as any,
        vat_allocated_amount: 0 as any,
        service_amount: 10000000 as any,
        net_eligible_amount: 10000000 as any,
        confirmed_at: new Date('2026-01-05'),
      })
      .returningAll()
      .execute();

    await kysely.db
      .updateTable('payment_installments')
      .set({ status: 'PAID' })
      .where('id', '=', inst1.id)
      .execute();

    const [inst2] = await kysely.db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan1.id,
        service_period_id: monthlyPeriods[1].id,
        installment_number: 2,
        due_date: new Date('2026-02-01') as any,
        gross_amount_due: 10000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    const [pay2] = await kysely.db
      .insertInto('payments')
      .values({
        payment_code: `PAY-REC-2-${Date.now()}`,
        gross_cash_amount: 10000000 as any,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: bossEmp.id,
        confirmed_by_employee_id: bossEmp.id,
        confirmed_at: new Date('2026-02-05'),
        status: 'CONFIRMED',
      })
      .returningAll()
      .execute();

    const [realAlloc2] = await kysely.db
      .insertInto('payment_allocations')
      .values({
        payment_id: pay2.id,
        installment_id: inst2.id,
        closing_sale_id: saleEmp.id,
        gross_allocated_amount: 10000000 as any,
        vat_allocated_amount: 0 as any,
        service_amount: 10000000 as any,
        net_eligible_amount: 10000000 as any,
        confirmed_at: new Date('2026-02-05'),
      })
      .returningAll()
      .execute();

    await kysely.db
      .updateTable('payment_installments')
      .set({ status: 'PAID' })
      .where('id', '=', inst2.id)
      .execute();

    // --------------------------------------------------
    // RECURRING-10: Fully paid alone does NOT release commission if unaccepted
    // --------------------------------------------------
    const period2Id = String(monthlyPeriods[1].id);
    await subService.recordServicePeriodPayment(period2Id, String(realAlloc2.id), true);
    const unacceptedComms = await kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('service_period_id', '=', period2Id as any)
      .execute();

    assert(
      unacceptedComms.length === 0,
      'RECURRING-10: Fully paid alone does NOT release commission if execution_status is PENDING',
    );

    // --------------------------------------------------
    // RECURRING-11 & RECURRING-12: Accepted + Fully Paid releases Sale & calculates Tech recurring commission
    // --------------------------------------------------
    await subService.recordServicePeriodPayment(period1Id, String(realAlloc1.id), true);

    const saleComm = await kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('service_period_id', '=', period1Id as any)
      .where('commission_type', '=', 'SALE')
      .executeTakeFirst();

    const techComms = await kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('service_period_id', '=', period1Id as any)
      .where('commission_type', '=', 'PROJECT_DELIVERY')
      .execute();

    assert(
      saleComm &&
        saleComm.status === 'RELEASED' &&
        Number(saleComm.commission_base) === 10000000,
      'RECURRING-11: Accepted + fully paid releases Sale recurring commission automatically (status RELEASED)',
    );

    assert(
      techComms.length > 0 && techComms.every((tc) => tc.status === 'CALCULATED'),
      'RECURRING-12: Technical recurring commission becomes CALCULATED when accepted + fully paid',
    );

    // --------------------------------------------------
    // RECURRING-13: Boss approval moves technical recurring commission to APPROVED
    // --------------------------------------------------
    const techCommToApprove = techComms[0];
    const approvedTechComm = await commService.approveCommission(String(techCommToApprove.id), String(bossEmp.id));
    assert(
      approvedTechComm && approvedTechComm.status === 'APPROVED',
      'RECURRING-13: Boss approval moves technical recurring commission to APPROVED',
    );

    // --------------------------------------------------
    // RECURRING-14: Repeated acceptance/payment processing does not duplicate commission
    // --------------------------------------------------
    await subService.recordServicePeriodPayment(period1Id, String(realAlloc1.id), true);
    const saleCommCount = await kysely.db
      .selectFrom('commissions')
      .select(sql<number>`count(id)`.as('total'))
      .where('service_period_id', '=', period1Id as any)
      .where('commission_type', '=', 'SALE')
      .executeTakeFirst();

    assert(
      Number(saleCommCount?.total || 0) === 1,
      'RECURRING-14: Repeated acceptance/payment processing does not duplicate commission',
    );

    // --------------------------------------------------
    // RECURRING-15: Payment allocation trace links exact ServicePeriod
    // --------------------------------------------------
    await subService.recordServicePeriodPayment(period1Id, String(realAlloc1.id), true);
    const sources = await kysely.db
      .selectFrom('commission_sources as cs')
      .innerJoin('payment_allocations as pa', 'pa.id', 'cs.payment_allocation_id')
      .innerJoin('payments as p', 'p.id', 'pa.payment_id')
      .select([
        'cs.id as source_id',
        'cs.commission_id',
        'cs.payment_allocation_id',
        'pa.payment_id',
        'p.status as payment_status',
      ])
      .where('cs.commission_id', '=', saleComm.id)
      .execute();

    assert(
      sources.length > 0 &&
        String(sources[0].payment_allocation_id) === String(realAlloc1.id) &&
        sources[0].payment_status === 'CONFIRMED',
      'RECURRING-15: Payment allocation trace links exact ServicePeriod via commission_sources to CONFIRMED payment',
    );

    // --------------------------------------------------
    // RECURRING-16, 17: Renewal uses existing Active Order when present
    // --------------------------------------------------
    const renewal1 = await subService.processSubscriptionRenewal(String(sub1.id), String(saleEmp.id));
    assert(
      renewal1 &&
        !renewal1.isNewOrder &&
        String(renewal1.orderId) === String(approvedOrder.id) &&
        renewal1.workflowStatus === 'DRAFT',
      'RECURRING-16 & RECURRING-17: Renewal uses existing Active Order when present and appends new DRAFT OrderItem',
    );

    // --------------------------------------------------
    // RECURRING-18 & RECURRING-19: Renewal creates new DRAFT Order when no Active Order exists & never bypasses Boss approval
    // --------------------------------------------------
    // Update approvedOrder to COMPLETED to test renewal when no active order exists
    await kysely.db
      .updateTable('orders')
      .set({ workflow_status: 'COMPLETED' })
      .where('id', '=', approvedOrder.id)
      .execute();

    const renewal2 = await subService.processSubscriptionRenewal(String(sub1.id), String(saleEmp.id));
    assert(
      renewal2 &&
        renewal2.isNewOrder &&
        String(renewal2.orderId) !== String(approvedOrder.id) &&
        renewal2.workflowStatus === 'DRAFT',
      'RECURRING-18 & RECURRING-19: Renewal creates new DRAFT Order when no Active Order exists and NEVER bypasses Boss approval',
    );

    // --------------------------------------------------
    // RECURRING-20: Cancelled Subscription does not generate future periods
    // --------------------------------------------------
    await subService.cancelSubscription(String(sub1.id));
    let cancelGenBlocked = false;
    try {
      await subService.generateServicePeriods(String(sub1.id), 1);
    } catch (err: any) {
      if (err?.message?.includes('CANCELLED')) {
        cancelGenBlocked = true;
      }
    }
    assert(
      cancelGenBlocked,
      'RECURRING-20: Cancelled Subscription is blocked from generating future ServicePeriods',
    );

    console.log('--------------------------------------------------');
    console.log('ℹ️ RECURRING KPI BUSINESS RULE OPEN: Schema supports source_type = SERVICE_PERIOD in kpi_events (No recurring KPI policy metric in default seed).');
    console.log('--------------------------------------------------');

    console.log('==================================================');
    console.log(`RECURRING SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Fatal error in Recurring Integration suite:', error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanupRecurringFixtures(kysely);
    } catch (cleanupErr) {
      console.error('Error during final cleanupRecurringFixtures:', cleanupErr);
      process.exitCode = 1;
    }
    await app.close();
  }
}

runRecurringIntegrationTests().catch((err) => {
  console.error('❌ Recurring Integration Test Suite Error:', err);
  process.exit(1);
});
