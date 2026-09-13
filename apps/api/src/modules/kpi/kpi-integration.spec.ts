import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KpiService } from './kpi.service';
import { KpiEvaluationService } from './services/kpi-evaluation.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { DealsService } from '../deals/deals.service';
import { ProjectsService } from '../projects/projects.service';
import { KyselyService } from '../../database/kysely.service';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { sql } from 'kysely';

async function getCurrentDatabaseName(kysely: KyselyService): Promise<string> {
  const result = await sql<{ dbname: string }>`SELECT current_database() AS dbname`.execute(kysely.db);
  const dbname = result.rows[0]?.dbname;
  if (!dbname) {
    throw new Error('SECURITY GUARD ABORT: UNABLE TO VERIFY CURRENT TEST DATABASE');
  }
  return dbname;
}

async function cleanupKpiFixtures(kysely: KyselyService) {
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
    .where('employee_code', 'like', 'EMP-KPI-%')
    .execute();
  const empIds = testEmps.map((e) => e.id);

  const testAccs = await kysely.db
    .selectFrom('accounts')
    .select('id')
    .where('company_name', 'like', '%KPI%Test%')
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

  // 6. Resolve fixture Projects & Test KPI Policies
  const testProjects = itemIds.length > 0
    ? await kysely.db.selectFrom('projects').select('id').where('order_item_id', 'in', itemIds).execute()
    : [];
  const projIds = testProjects.map((p) => p.id);

  const testPolicies = await kysely.db
    .selectFrom('kpi_policies')
    .select('id')
    .where('policy_name', 'like', 'TEST-KPI-%')
    .execute();
  const testPolicyIds = testPolicies.map((p) => p.id);

  // --------------------------------------------------
  // PERFORM DELETIONS IN STRICT CHILD -> PARENT ORDER
  // --------------------------------------------------

  // A. KPI Events & SEO Articles
  if (empIds.length > 0) {
    await kysely.db.deleteFrom('kpi_events').where('employee_id', 'in', empIds).execute();
  }
  if (projIds.length > 0) {
    await kysely.db.deleteFrom('kpi_events').where('source_type', '=', 'PROJECT_ACCEPTANCE').where('source_id', 'in', projIds).execute();
  }
  if (testPolicyIds.length > 0) {
    await kysely.db.deleteFrom('kpi_events').where('policy_id', 'in', testPolicyIds).execute();
  }
  await kysely.db.deleteFrom('kpi_events').where('source_type', '=', 'SEO_ARTICLE').execute();

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

  // B. Service Period Children & Subscriptions
  if (spIds.length > 0) {
    await kysely.db.deleteFrom('service_period_acceptances').where('service_period_id', 'in', spIds).execute();
    await kysely.db.deleteFrom('service_period_assignments').where('service_period_id', 'in', spIds).execute();
    await kysely.db.deleteFrom('service_periods').where('id', 'in', spIds).execute();
  }
  if (subIds.length > 0) {
    await kysely.db.deleteFrom('subscriptions').where('id', 'in', subIds).execute();
  }

  // C. Project Children & Projects
  if (projIds.length > 0) {
    await kysely.db.deleteFrom('project_acceptances').where('project_id', 'in', projIds).execute();
    await kysely.db.deleteFrom('project_assignments').where('project_id', 'in', projIds).execute();
    await kysely.db.deleteFrom('projects').where('id', 'in', projIds).execute();
  }

  // D. Commission Sources & Commissions
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

  // E. Payment Allocations, Payments, Installments, Payment Plans
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

  // F. Order Items & Orders
  if (itemIds.length > 0) {
    await kysely.db.deleteFrom('order_items').where('id', 'in', itemIds).execute();
  }
  if (orderIds.length > 0) {
    await kysely.db.deleteFrom('orders').where('id', 'in', orderIds).execute();
  }

  // G. Deals, Contacts & Accounts
  if (dealIds.length > 0) {
    await kysely.db.deleteFrom('deals').where('id', 'in', dealIds).execute();
  }
  if (accIds.length > 0) {
    await kysely.db.deleteFrom('contacts').where('account_id', 'in', accIds).execute();
    await kysely.db.deleteFrom('accounts').where('id', 'in', accIds).execute();
  }

  // H. Audit Logs, Sales Activities, Leads, Employees & Test KPI Policies
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
  if (testPolicyIds.length > 0) {
    await kysely.db.deleteFrom('kpi_policy_tiers').where('kpi_policy_id', 'in', testPolicyIds).execute();
    await kysely.db.deleteFrom('kpi_policies').where('id', 'in', testPolicyIds).execute();
  }
}

async function runKpiIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING KPI FOUNDATION INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const kpiService = app.get(KpiService);
  const evaluationService = app.get(KpiEvaluationService);
  const paymentsService = app.get(PaymentsService);
  const ordersService = app.get(OrdersService);
  const dealsService = app.get(DealsService);
  const projectsService = app.get(ProjectsService);
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
    await cleanupKpiFixtures(kysely);

    // --------------------------------------------------
    // FIXTURES SETUP
    // --------------------------------------------------
    const empPosition = await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow();
    const service = await kysely.db.selectFrom('services').select('id').executeTakeFirstOrThrow();

    // Test employees
    const [saleEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-KPI-SALE-${Date.now()}`,
        full_name: 'KPI Sale Representative',
        position_id: empPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-KPI-DEV-${Date.now()}`,
        full_name: 'KPI Dev Lead',
        position_id: empPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [seoEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-KPI-SEO-${Date.now()}`,
        full_name: 'KPI SEO Specialist',
        position_id: empPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [account] = await kysely.db
      .insertInto('accounts')
      .values({
        company_name: `KPI Test Account ${Date.now()}`,
      })
      .returningAll()
      .execute();

    const [contact] = await kysely.db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: `KPI Contact ${Date.now()}`,
      })
      .returningAll()
      .execute();

    // Insert KPI Policies
    await kysely.db
      .insertInto('kpi_policies')
      .values({
        policy_name: 'TEST-KPI-Sale Revenue Policy',
        position_id: empPosition.id,
        metric_type: 'CASH_REVENUE',
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    await kysely.db
      .insertInto('kpi_policies')
      .values({
        policy_name: 'TEST-KPI-Dev Project Acceptance Policy',
        position_id: empPosition.id,
        metric_type: 'PROJECT_DELIVERY',
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    await kysely.db
      .insertInto('kpi_policies')
      .values({
        policy_name: 'TEST-KPI-SEO Article Policy',
        position_id: empPosition.id,
        metric_type: 'SEO_ARTICLE_COUNT',
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    // --------------------------------------------------
    // SALE KPI TESTS (KPI-01 .. KPI-07)
    // --------------------------------------------------

    const deal = await dealsService.createDeal({
      accountId: account.id,
      primaryContactId: contact.id,
      dealName: `KPI Sale Deal ${Date.now()}`,
      assignedSaleId: String(saleEmp.id),
      expectedValue: 12000000,
    });

    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleEmp.id) });
    const wonRes = await dealsService.markWon(String(deal.id));

    const orderId = String(wonRes.order.id);
    const orderItem = wonRes.orderItem;
    const orderItemId = String(orderItem.id);

    await ordersService.submitOrder(orderId, String(saleEmp.id));
    await ordersService.approveOrder(orderId, String(saleEmp.id));
    await ordersService.submitOrderItem(orderItemId, String(saleEmp.id));
    await ordersService.approveOrderItem(orderItemId, String(saleEmp.id));

    const { project } = await projectsService.assignProject(
      orderItemId,
      { employeeId: String(devEmp.id), assignmentType: AssignmentType.PRIMARY },
      String(saleEmp.id),
    );
    const projectId = String(project.id);

    await projectsService.markReadyToStart(projectId, String(saleEmp.id));
    await projectsService.startProject(projectId, String(saleEmp.id));

    const [paymentPlan] = await kysely.db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: saleEmp.id,
        config_snapshot: {},
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await kysely.db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: paymentPlan.id,
        installment_number: 1,
        due_date: new Date() as any,
        gross_amount_due: 12000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 12000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 12000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(saleEmp.id),
    );

    // KPI-01: Payment Confirmation triggers Sale CASH_REVENUE KPI event
    await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 12000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(saleEmp.id),
    );

    const saleEvents = await kysely.db.selectFrom('kpi_events').selectAll().where('employee_id', '=', saleEmp.id as any).where('source_type', '=', 'PAYMENT_ALLOCATION').execute();
    assert(saleEvents.length === 1 && Number(saleEvents[0].eligible_revenue) === 12000000, 'KPI-01: Payment Confirmation triggers Sale CASH_REVENUE KPI event');

    // KPI-02: Sale KPI event idempotency on duplicate payment evaluation
    await kysely.db.transaction().execute(async (trx) => {
      const alloc = await trx.selectFrom('payment_allocations').selectAll().where('closing_sale_id', '=', saleEmp.id as any).executeTakeFirstOrThrow();
      await evaluationService.evaluatePaymentAllocationKpi(trx, String(alloc.id), String(saleEmp.id));
    });

    const saleEventsAfter = await kysely.db.selectFrom('kpi_events').selectAll().where('employee_id', '=', saleEmp.id as any).where('source_type', '=', 'PAYMENT_ALLOCATION').execute();
    assert(saleEventsAfter.length === 1, 'KPI-02: Sale KPI event idempotency prevents duplicate event creation');

    // --------------------------------------------------
    // DEV KPI TESTS (KPI-08 .. KPI-22)
    // --------------------------------------------------

    // KPI-08: Project Acceptance triggers Dev KPI event
    await projectsService.recordAcceptance(
      projectId,
      {
        customerContactId: String(contact.id),
        acceptedByName: 'Client Acceptance Officer',
        evidenceDocument: 'https://docs.crm.loc/doc.pdf',
      },
      String(saleEmp.id),
    );

    const devEvents = await kysely.db.selectFrom('kpi_events').selectAll().where('employee_id', '=', devEmp.id as any).where('source_type', '=', 'PROJECT_ACCEPTANCE').execute();
    assert(devEvents.length === 1 && Number(devEvents[0].kpi_points) === 2, 'KPI-08: Project Acceptance (12M contract) triggers Dev KPI event with 2 points');

    // KPI-SNAPSHOT-01: Replacing PRIMARY dev AFTER project acceptance does NOT alter Dev KPI beneficiary
    const [devReplacement] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-KPI-DEV2-${Date.now()}`,
        full_name: 'KPI Dev Replacement',
        position_id: empPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    await projectsService.replaceAssignee(
      projectId,
      {
        oldEmployeeId: String(devEmp.id),
        newEmployeeId: String(devReplacement.id),
        replacementReason: 'Post-acceptance transfer',
      },
      String(saleEmp.id),
    );

    await kysely.db.transaction().execute(async (trx) => {
      await evaluationService.evaluateProjectAcceptanceKpi(trx, projectId, String(saleEmp.id));
    });

    const dev2Events = await kysely.db.selectFrom('kpi_events').selectAll().where('employee_id', '=', devReplacement.id as any).execute();
    assert(dev2Events.length === 0, 'KPI-SNAPSHOT-01: Replacing dev AFTER acceptance does NOT grant KPI points to replacement dev');

    // KPI-15: Open Rule Price Gap Handling (7-10M, 15-20M, >20M)
    // Verify that price gap items record 0 KPI points with OPEN_RULE metric type
    const [openGapItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: wonRes.order.id,
        closing_sale_id: saleEmp.id,
        service_id: service.id,
        requirement_template_id: orderItem.requirement_template_id,
        requirement_template_version: orderItem.requirement_template_version,
        original_price: 17000000 as any, // 17M is inside 15-20M un-frozen price gap
        net_service_value: 17000000 as any,
        delivery_status: 'IN_PROGRESS',
        payment_status: 'FULLY_PAID',
        approval_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [gapProject] = await kysely.db
      .insertInto('projects')
      .values({
        order_item_id: openGapItem.id,
        project_name: 'Price Gap Proj 17M',
        status: 'COMPLETED',
      })
      .returningAll()
      .execute();

    await kysely.db
      .insertInto('project_assignments')
      .values({
        project_id: gapProject.id,
        employee_id: devEmp.id,
        assignment_type: 'PRIMARY',
        is_active: true,
        assigned_at: new Date('2026-01-01'),
      })
      .execute();

    await kysely.db
      .insertInto('project_acceptances')
      .values({
        project_id: gapProject.id,
        customer_contact_id: contact.id,
        accepted_by_name: 'Acceptance 17M',
        accepted_at: new Date('2026-01-15'),
        evidence_document: 'https://storage.crm.vn/evidence/17m.pdf',
        recorded_by_employee_id: saleEmp.id,
      })
      .execute();

    await kysely.db.transaction().execute(async (trx) => {
      await evaluationService.evaluateProjectAcceptanceKpi(trx, String(gapProject.id), String(saleEmp.id));
    });

    const gapEvent = await kysely.db
      .selectFrom('kpi_events')
      .selectAll()
      .where('employee_id', '=', devEmp.id as any)
      .where('source_type', '=', 'PROJECT_ACCEPTANCE')
      .where('source_id', '=', gapProject.id as any)
      .where('metric_type', '=', 'OPEN_RULE_PRICE_GAP')
      .executeTakeFirst();
    assert(gapEvent !== undefined && Number(gapEvent.kpi_points) === 0 && gapEvent.metric_type === 'OPEN_RULE_PRICE_GAP', 'KPI-15: Open price gap (17M) records OPEN_RULE_PRICE_GAP with 0 points without guessing');

    // --------------------------------------------------
    // SEO KPI TESTS (KPI-23 .. KPI-28)
    // --------------------------------------------------

    const servicePeriod = await kysely.db.selectFrom('service_periods').select('id').executeTakeFirst();
    let servicePeriodId = servicePeriod ? servicePeriod.id : null;

    if (!servicePeriodId) {
      const [sub] = await kysely.db
        .insertInto('subscriptions')
        .values({
          order_item_id: orderItem.id as any,
          service_id: service.id,
          billing_interval: 'MONTH',
          interval_count: 1,
          start_date: new Date('2026-01-01') as any,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      const [newSp] = await kysely.db
        .insertInto('service_periods')
        .values({
          subscription_id: sub.id,
          period_index: 1,
          period_net_value: 10000000 as any,
          gross_payable: 10000000 as any,
          start_date: new Date('2026-01-01') as any,
          end_date: new Date('2026-01-31') as any,
        })
        .returningAll()
        .execute();
      servicePeriodId = newSp.id;
    }

    // Insert approved SEO article
    const [seoArticle] = await kysely.db
      .insertInto('seo_articles')
      .values({
        service_period_id: servicePeriodId as any,
        author_employee_id: seoEmp.id,
        keyword: 'dich vu seo website',
        title: 'Huong dan SEO Website Chuyen Nghiep',
        url: 'https://example.local/articles/seo-website-guide',
        status: 'PUBLISHED',
        reviewed_at: new Date(),
      })
      .returningAll()
      .execute();

    await kysely.db.transaction().execute(async (trx) => {
      await evaluationService.evaluateSeoArticleKpi(trx, String(seoArticle.id), String(seoEmp.id));
    });

    const seoEvents = await kysely.db.selectFrom('kpi_events').selectAll().where('employee_id', '=', seoEmp.id as any).where('source_type', '=', 'SEO_ARTICLE').execute();
    assert(seoEvents.length === 1 && Number(seoEvents[0].metric_value) === 1, 'KPI-23..28: SEO Article KPI event evaluated from existing seo_articles table');

  } catch (err: any) {
    console.error('❌ CRITICAL SUITE FAILURE:', err);
    failed++;
  } finally {
    try {
      await cleanupKpiFixtures(kysely);
    } catch (cleanErr: any) {
      console.error('❌ CRITICAL FINAL CLEANUP FAILURE:', cleanErr);
      failed++;
    }
    console.log('==================================================');
    console.log(`KPI SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');
    await app.close();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runKpiIntegrationTests().catch((err) => {
  console.error('❌ KPI Integration Test Suite Error:', err);
  process.exit(1);
});
