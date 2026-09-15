import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { PayrollService } from './payroll.service';
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

async function applyPayrollPeriodLockedMigration(kysely: KyselyService) {
  await sql`
    CREATE OR REPLACE FUNCTION fn_check_payroll_period_locked()
    RETURNS TRIGGER AS $$
    BEGIN
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
            IF OLD.status = 'LOCKED' THEN
                RAISE EXCEPTION 'CANNOT MODIFY OR DELETE LOCKED PAYROLL PERIOD (Period ID: %).', OLD.id;
            END IF;
        END IF;
        IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(kysely.db);

  await sql`
    DROP TRIGGER IF EXISTS trg_protect_locked_payroll_periods ON payroll_periods;
  `.execute(kysely.db);

  await sql`
    CREATE TRIGGER trg_protect_locked_payroll_periods
    BEFORE UPDATE OR DELETE ON payroll_periods
    FOR EACH ROW EXECUTE FUNCTION fn_check_payroll_period_locked();
  `.execute(kysely.db);
}

async function cleanupPayrollFixtures(kysely: KyselyService) {
  // POSITIVE ALLOWLIST SECURITY GUARD FOR TEST-ONLY TEARDOWN
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isTeardownAllowed = process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN === 'true';

  const currentDb = await getCurrentDatabaseName(kysely);
  const expectedTestDb = process.env.TEST_DATABASE_NAME;

  if (
    !isTestEnv ||
    !isTeardownAllowed ||
    !expectedTestDb ||
    currentDb !== expectedTestDb
  ) {
    throw new Error(
      `SECURITY GUARD ABORT: Privileged payroll fixture teardown is allowed only on dedicated test database with explicit positive allowlist (NODE_ENV=${process.env.NODE_ENV}, ALLOW_PRIVILEGED_TEST_TEARDOWN=${process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN}, DB=${currentDb}, EXPECTED_DB=${expectedTestDb})`,
    );
  }

  // 1. Delete payrolls and payroll_periods
  const testPeriods = await kysely.db
    .selectFrom('payroll_periods')
    .select('id')
    .where((eb) =>
      eb.or([
        eb('period_key', 'like', '%PAY%'),
        eb('start_date', '>=', '2026-01-01' as any),
      ]),
    )
    .execute();

  const periodIds = testPeriods.map((p) => p.id);
  if (periodIds.length > 0) {
    const testPayrolls = await kysely.db
      .selectFrom('payrolls')
      .select('id')
      .where('payroll_period_id', 'in', periodIds)
      .execute();
    const payrollIds = testPayrolls.map((p) => p.id);

    // PRIVILEGED TEST-ONLY TEARDOWN: Disable exact payroll protection triggers strictly in test DB during teardown
    await sql`ALTER TABLE payroll_periods DISABLE TRIGGER trg_protect_locked_payroll_periods`.execute(kysely.db);
    await sql`ALTER TABLE payrolls DISABLE TRIGGER trg_protect_locked_payrolls`.execute(kysely.db);
    await sql`ALTER TABLE payroll_items DISABLE TRIGGER trg_protect_locked_payroll_items`.execute(kysely.db);
    await sql`ALTER TABLE payroll_adjustments DISABLE TRIGGER trg_protect_locked_payroll_adjustments`.execute(kysely.db);

    try {
      await kysely.db
        .deleteFrom('expenses')
        .where('source_payroll_period_id', 'in', periodIds)
        .execute();

      if (payrollIds.length > 0) {
        await kysely.db
          .deleteFrom('payroll_adjustments')
          .where((eb) =>
            eb.or([
              eb('origin_payroll_period_id', 'in', periodIds),
              eb('target_payroll_id', 'in', payrollIds),
            ]),
          )
          .execute();

        await kysely.db
          .deleteFrom('payroll_items')
          .where('payroll_id', 'in', payrollIds)
          .execute();
      } else {
        await kysely.db
          .deleteFrom('payroll_adjustments')
          .where('origin_payroll_period_id', 'in', periodIds)
          .execute();
      }

      await kysely.db.deleteFrom('payrolls').where('payroll_period_id', 'in', periodIds).execute();
      await kysely.db.deleteFrom('payroll_periods').where('id', 'in', periodIds).execute();
    } finally {
      // Re-enable exact protection triggers immediately after deletion
      await sql`ALTER TABLE payroll_periods ENABLE TRIGGER trg_protect_locked_payroll_periods`.execute(kysely.db);
      await sql`ALTER TABLE payrolls ENABLE TRIGGER trg_protect_locked_payrolls`.execute(kysely.db);
      await sql`ALTER TABLE payroll_items ENABLE TRIGGER trg_protect_locked_payroll_items`.execute(kysely.db);
      await sql`ALTER TABLE payroll_adjustments ENABLE TRIGGER trg_protect_locked_payroll_adjustments`.execute(kysely.db);
    }
  }

  // 2. Find test employees
  const testEmps = await kysely.db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', 'like', 'PAY-%')
    .execute();
  const empIds = testEmps.map((e) => e.id);

  if (empIds.length > 0) {
    await kysely.db.deleteFrom('commissions').where('beneficiary_employee_id', 'in', empIds).execute();
    await kysely.db.deleteFrom('salary_history').where('employee_id', 'in', empIds).execute();
    await kysely.db.deleteFrom('team_memberships').where('employee_id', 'in', empIds).execute();
  }

  // 3. Delete test teams (only payroll test fixtures)
  const testTeams = await kysely.db
    .selectFrom('teams')
    .select('id')
    .where('code', 'like', 'PAY-TEAM-%')
    .execute();
  const teamIds = testTeams.map((t) => t.id);
  if (teamIds.length > 0) {
    await kysely.db.deleteFrom('team_memberships').where('team_id', 'in', teamIds).execute();
    await kysely.db.deleteFrom('teams').where('id', 'in', teamIds).execute();
  }

  // 4. Delete test accounts and associated order hierarchy
  const testAccounts = await kysely.db
    .selectFrom('accounts')
    .select('id')
    .where('company_name', 'like', '%Payroll Test Corp%')
    .execute();
  const accountIds = testAccounts.map((a) => a.id);

  if (accountIds.length > 0) {
    const testOrders = await kysely.db
      .selectFrom('orders')
      .select('id')
      .where('account_id', 'in', accountIds)
      .execute();
    const orderIds = testOrders.map((o) => o.id);

    if (orderIds.length > 0) {
      const testItems = await kysely.db
        .selectFrom('order_items')
        .select('id')
        .where('order_id', 'in', orderIds)
        .execute();
      const itemIds = testItems.map((i) => i.id);

      if (itemIds.length > 0) {
        const testProjects = await kysely.db
          .selectFrom('projects')
          .select('id')
          .where('order_item_id', 'in', itemIds)
          .execute();
        const projectIds = testProjects.map((p) => p.id);

        if (projectIds.length > 0) {
          await kysely.db.deleteFrom('project_acceptances').where('project_id', 'in', projectIds).execute();
          await kysely.db.deleteFrom('projects').where('id', 'in', projectIds).execute();
        }

        await kysely.db.deleteFrom('commissions').where('order_item_id', 'in', itemIds).execute();

        const testPlans = await kysely.db
          .selectFrom('order_item_payment_plans')
          .select('id')
          .where('order_item_id', 'in', itemIds)
          .execute();
        const planIds = testPlans.map((pl) => pl.id);

        if (planIds.length > 0) {
          const testInsts = await kysely.db
            .selectFrom('payment_installments')
            .select('id')
            .where('payment_plan_id', 'in', planIds)
            .execute();
          const instIds = testInsts.map((i) => i.id);

          if (instIds.length > 0) {
            await kysely.db.deleteFrom('payment_allocations').where('installment_id', 'in', instIds).execute();
            await kysely.db.deleteFrom('payment_installments').where('id', 'in', instIds).execute();
          }

          await kysely.db.deleteFrom('order_item_payment_plans').where('id', 'in', planIds).execute();
        }

        await kysely.db.deleteFrom('order_items').where('id', 'in', itemIds).execute();
      }

      await kysely.db.deleteFrom('orders').where('id', 'in', orderIds).execute();
    }

    await kysely.db.deleteFrom('contacts').where('account_id', 'in', accountIds).execute();
    await kysely.db.deleteFrom('accounts').where('id', 'in', accountIds).execute();
  }

  // 5. Delete test payments
  const testPayments = await kysely.db
    .selectFrom('payments')
    .select('id')
    .where('payment_code', 'like', 'P%-%')
    .execute();
  const payIds = testPayments.map((p) => p.id);
  if (payIds.length > 0) {
    await kysely.db.deleteFrom('payment_allocations').where('payment_id', 'in', payIds).execute();
    await kysely.db.deleteFrom('payments').where('id', 'in', payIds).execute();
  }

  if (empIds.length > 0) {
    await kysely.db.deleteFrom('employees').where('id', 'in', empIds).execute();
  }
}

async function runPayrollIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING PAYROLL FOUNDATION INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const payrollService = app.get(PayrollService);
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
    // Install DB Trigger for LOCKED payroll_periods protection
    await applyPayrollPeriodLockedMigration(kysely);

    // Initial cleanup before setup - MUST FAIL FAST IF FAILED
    await cleanupPayrollFixtures(kysely);

    const runId = Date.now();
    const position = await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow();
    const service = await kysely.db.selectFrom('services').select('id').executeTakeFirstOrThrow();

    const account = await kysely.db
      .insertInto('accounts')
      .values({
        company_name: `Payroll Test Corp ${runId}`,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const [contact] = await kysely.db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: 'Payroll Client Contact',
        email: `client-${runId}@test.com`,
        phone: '0988776655',
        is_primary: true,
      })
      .returningAll()
      .execute();

    // Create test employees
    const [saleEmp1] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `PAY-SALE1-${runId}`,
        full_name: 'Payroll Sale Agent 1',
        position_id: position.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `PAY-DEV-${runId}`,
        full_name: 'Payroll Dev Specialist',
        position_id: position.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [tlEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `PAY-TL-${runId}`,
        full_name: 'Payroll Team Leader',
        position_id: position.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Setup Team & Memberships
    const [testTeam] = await kysely.db
      .insertInto('teams')
      .values({
        name: `Payroll Team ${runId}`,
        code: `PAY-TEAM-${runId}`,
      })
      .returningAll()
      .execute();

    await kysely.db
      .insertInto('team_memberships')
      .values([
        { team_id: testTeam.id, employee_id: tlEmp.id, is_leader: true, effective_range: '[2026-01-01,)' as any },
        { team_id: testTeam.id, employee_id: saleEmp1.id, is_leader: false, effective_range: '[2026-01-01,)' as any },
      ])
      .execute();

    // Salary History
    await kysely.db
      .insertInto('salary_history')
      .values([
        { employee_id: saleEmp1.id, base_salary: 10000000, effective_range: '[2026-01-01, 2026-12-31]' as any },
        { employee_id: devEmp.id, base_salary: 15000000, effective_range: '[2026-01-01, 2026-12-31]' as any },
      ])
      .execute();

    // Service Requirement Template
    let template = await kysely.db
      .selectFrom('service_requirement_templates')
      .selectAll()
      .where('service_id', '=', service.id)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!template) {
      [template] = await kysely.db
        .insertInto('service_requirement_templates')
        .values({
          service_id: service.id,
          version: 1,
          template_name: 'Default Requirement Template',
          is_active: true,
        })
        .returningAll()
        .execute();
    }

    // Periods
    const pJan = await payrollService.createPeriod({ periodKey: `2026-01-PAY-${runId}`, startDate: '2026-01-01', endDate: '2026-01-31' });
    const pFeb = await payrollService.createPeriod({ periodKey: `2026-02-PAY-${runId}`, startDate: '2026-02-01', endDate: '2026-02-28' });

    // --------------------------------------------------
    // SALE-FULLPAY-01 & SALE-FULLPAY-02: Respect current approved payment plan
    // --------------------------------------------------
    const [orderQ1] = await kysely.db
      .insertInto('orders')
      .values({
        account_id: account.id,
        primary_contact_id: contact.id,
        order_code: `ORD-Q1-${runId}`,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [itemQ1] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: orderQ1.id,
        closing_sale_id: saleEmp1.id,
        service_id: service.id,
        requirement_template_id: template.id,
        requirement_template_version: template.version,
        original_price: 10000000,
        discount_amount: 0,
        net_service_value: 10000000,
        vat_amount: 1000000,
        approval_status: 'APPROVED',
        delivery_status: 'COMPLETED',
        payment_status: 'FULLY_PAID',
      })
      .returningAll()
      .execute();

    // Approved Payment Plan with installments: 30% Jan 5, 20% Jan 10, 50% Feb 15
    const [approvedPlan] = await kysely.db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: itemQ1.id,
        version: 1,
        status: 'APPROVED',
        created_by_employee_id: saleEmp1.id,
        config_snapshot: JSON.stringify({ type: 'CUSTOM' }),
        approved_at: new Date('2026-01-01'),
      })
      .returningAll()
      .execute();

    const [inst1] = await kysely.db.insertInto('payment_installments').values({ payment_plan_id: approvedPlan.id, installment_number: 1, gross_amount_due: 3300000, due_date: new Date('2026-01-05') as any, status: 'PAID' }).returningAll().execute();
    const [inst2] = await kysely.db.insertInto('payment_installments').values({ payment_plan_id: approvedPlan.id, installment_number: 2, gross_amount_due: 2200000, due_date: new Date('2026-01-10') as any, status: 'PAID' }).returningAll().execute();
    const [inst3] = await kysely.db.insertInto('payment_installments').values({ payment_plan_id: approvedPlan.id, installment_number: 3, gross_amount_due: 5500000, due_date: new Date('2026-02-15') as any, status: 'PAID' }).returningAll().execute();

    // Payments and Allocations
    const [pay1] = await kysely.db.insertInto('payments').values({ payment_code: `P1-${runId}`, gross_cash_amount: 3300000, payment_method: 'BANK_TRANSFER', created_by_employee_id: saleEmp1.id, confirmed_by_employee_id: tlEmp.id, confirmed_at: new Date('2026-01-05') as any, status: 'CONFIRMED' }).returningAll().execute();
    await kysely.db.insertInto('payment_allocations').values({ payment_id: pay1.id, installment_id: inst1.id, closing_sale_id: saleEmp1.id, gross_allocated_amount: 3300000, vat_allocated_amount: 300000, service_amount: 3000000, net_eligible_amount: 3000000, confirmed_at: new Date('2026-01-05') as any }).execute();

    const [pay2] = await kysely.db.insertInto('payments').values({ payment_code: `P2-${runId}`, gross_cash_amount: 2200000, payment_method: 'BANK_TRANSFER', created_by_employee_id: saleEmp1.id, confirmed_by_employee_id: tlEmp.id, confirmed_at: new Date('2026-01-10') as any, status: 'CONFIRMED' }).returningAll().execute();
    await kysely.db.insertInto('payment_allocations').values({ payment_id: pay2.id, installment_id: inst2.id, closing_sale_id: saleEmp1.id, gross_allocated_amount: 2200000, vat_allocated_amount: 200000, service_amount: 2000000, net_eligible_amount: 2000000, confirmed_at: new Date('2026-01-10') as any }).execute();

    const [pay3] = await kysely.db.insertInto('payments').values({ payment_code: `P3-${runId}`, gross_cash_amount: 5500000, payment_method: 'BANK_TRANSFER', created_by_employee_id: saleEmp1.id, confirmed_by_employee_id: tlEmp.id, confirmed_at: new Date('2026-02-15') as any, status: 'CONFIRMED' }).returningAll().execute();
    await kysely.db.insertInto('payment_allocations').values({ payment_id: pay3.id, installment_id: inst3.id, closing_sale_id: saleEmp1.id, gross_allocated_amount: 5500000, vat_allocated_amount: 500000, service_amount: 5000000, net_eligible_amount: 5000000, confirmed_at: new Date('2026-02-15') as any }).execute();

    // Project & Acceptance in Jan
    const [projQ1] = await kysely.db.insertInto('projects').values({ order_item_id: itemQ1.id, project_name: `Project Q1 ${runId}`, status: 'COMPLETED' }).returningAll().execute();
    await kysely.db.insertInto('project_acceptances').values({ project_id: projQ1.id, customer_contact_id: contact.id, accepted_by_name: 'Payroll Contact', accepted_at: new Date('2026-01-20') as any, evidence_document: 'doc', recorded_by_employee_id: devEmp.id }).execute();

    await kysely.db
      .insertInto('commissions')
      .values({ beneficiary_employee_id: saleEmp1.id, order_item_id: itemQ1.id, commission_type: 'SALE', rate_snapshot: 0.06 as any, commission_base: 10000000, calculated_amount: 600000, status: 'RELEASED', created_at: new Date('2026-01-05') as any, updated_at: new Date('2026-02-15') as any })
      .execute();

    await payrollService.calculatePayrollPeriod(pJan.id);
    await payrollService.calculatePayrollPeriod(pFeb.id);

    const janSaleStmt1 = await kysely.db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', pJan.id).where('employee_id', '=', saleEmp1.id).executeTakeFirst();
    const febSaleStmt1 = await kysely.db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', pFeb.id).where('employee_id', '=', saleEmp1.id).executeTakeFirst();

    assert(
      Number(janSaleStmt1?.released_commission_amount || 0) === 0 && Number(febSaleStmt1?.released_commission_amount || 0) === 600000,
      'SALE-FULLPAY-02 & QUALIFICATION-01: 30% Jan + 20% Jan + 50% Feb (Acceptance Jan) qualifies in February at current plan fully_paid_at timestamp',
    );

    // --------------------------------------------------
    // TECH-QUALIFICATION-01 & TECH-QUALIFICATION-02: Boss approved_at timestamp
    // --------------------------------------------------
    await kysely.db
      .insertInto('commissions')
      .values({
        beneficiary_employee_id: devEmp.id,
        order_item_id: itemQ1.id,
        commission_type: 'PROJECT_DELIVERY',
        rate_snapshot: 0.02 as any,
        commission_base: 10000000,
        calculated_amount: 200000,
        approved_amount: 200000,
        approved_by_employee_id: tlEmp.id,
        approved_at: new Date('2026-02-05') as any, // Boss approval date in February
        status: 'APPROVED',
        created_at: new Date('2026-01-20') as any, // CALCULATED date
        updated_at: new Date('2026-02-20') as any, // Metadata update date in February
      })
      .execute();

    await payrollService.calculatePayrollPeriod(pJan.id);
    await payrollService.calculatePayrollPeriod(pFeb.id);

    const janDevStmt = await kysely.db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', pJan.id).where('employee_id', '=', devEmp.id).executeTakeFirst();
    const febDevStmt = await kysely.db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', pFeb.id).where('employee_id', '=', devEmp.id).executeTakeFirst();

    assert(
      Number(janDevStmt?.released_commission_amount || 0) === 0 && Number(febDevStmt?.released_commission_amount || 0) === 200000,
      'TECH-QUALIFICATION-01 & TECH-QUALIFICATION-02: Technical commission CALCULATED in Jan but APPROVED on Feb 5 qualifies in February payroll',
    );

    // --------------------------------------------------
    // LOCK & Immutability Protections (LOCK-IMMUTABILITY-01 .. 05)
    // --------------------------------------------------
    await payrollService.approvePeriod(pFeb.id, String(tlEmp.id));
    const pFebLocked = await payrollService.lockPeriod(pFeb.id, String(tlEmp.id));
    assert(pFebLocked.status === 'LOCKED', 'LOCK-01: February Payroll period successfully LOCKED');

    // LOCK-IMMUTABILITY-01: Attempt recalculate/update payroll data on locked period via PayrollService => blocked
    let lockUpdateBlocked = false;
    try {
      await payrollService.calculatePayrollPeriod(pFeb.id);
    } catch (err: any) {
      if (err?.message?.includes('LOCKED') || err?.response?.message?.includes('LOCKED')) {
        lockUpdateBlocked = true;
      }
    }
    assert(lockUpdateBlocked, 'LOCK-IMMUTABILITY-01: Recalculating/updating payroll data in a LOCKED period is blocked by PayrollService');

    // LOCK-IMMUTABILITY-02: Attempt delete payroll statement directly via DB on locked period => blocked by DB Trigger
    let lockDeleteBlocked = false;
    try {
      await kysely.db.deleteFrom('payrolls').where('payroll_period_id', '=', pFeb.id).execute();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD')) {
        lockDeleteBlocked = true;
      }
    }
    assert(lockDeleteBlocked, 'LOCK-IMMUTABILITY-02: Direct DB DELETE on payrolls under a LOCKED period is blocked by DB trigger fn_check_payroll_locked()');

    // LOCK-IMMUTABILITY-03: Direct SQL UPDATE status (LOCKED -> OPEN) on payroll_periods => blocked by DB Trigger
    let lockReversalBlocked = false;
    try {
      await kysely.db
        .updateTable('payroll_periods')
        .set({ status: 'OPEN' })
        .where('id', '=', pFeb.id)
        .execute();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT MODIFY OR DELETE LOCKED PAYROLL PERIOD')) {
        lockReversalBlocked = true;
      }
    }
    assert(lockReversalBlocked, 'LOCK-IMMUTABILITY-03: Direct DB UPDATE status (LOCKED -> OPEN) on payroll_periods is blocked by DB trigger fn_check_payroll_period_locked()');

    // LOCK-IMMUTABILITY-04: Direct SQL DELETE on a LOCKED payroll_periods row => blocked by DB Trigger
    let lockPeriodDeleteBlocked = false;
    try {
      await kysely.db
        .deleteFrom('payroll_periods')
        .where('id', '=', pFeb.id)
        .execute();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT MODIFY OR DELETE LOCKED PAYROLL PERIOD')) {
        lockPeriodDeleteBlocked = true;
      }
    }
    assert(lockPeriodDeleteBlocked, 'LOCK-IMMUTABILITY-04: Direct DB DELETE on a LOCKED payroll_periods row is blocked by DB trigger fn_check_payroll_period_locked()');

    // LOCK-IMMUTABILITY-05: Direct SQL UPDATE of metadata/date on a LOCKED payroll_periods row => blocked by DB Trigger
    let lockMetadataChangeBlocked = false;
    try {
      await kysely.db
        .updateTable('payroll_periods')
        .set({ start_date: '2026-01-15' as any })
        .where('id', '=', pFeb.id)
        .execute();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT MODIFY OR DELETE LOCKED PAYROLL PERIOD')) {
        lockMetadataChangeBlocked = true;
      }
    }
    assert(lockMetadataChangeBlocked, 'LOCK-IMMUTABILITY-05: Direct DB UPDATE of metadata/date on a LOCKED payroll_periods row is blocked by DB trigger fn_check_payroll_period_locked()');

    // --------------------------------------------------
    // TEARDOWN SECURITY GUARD TESTS (TEARDOWN-GUARD-01..03)
    // --------------------------------------------------
    const origNodeEnv = process.env.NODE_ENV;
    const origAllowTeardown = process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN;
    const origTestDbName = process.env.TEST_DATABASE_NAME;

    // TEARDOWN-GUARD-01: TEST_DATABASE_NAME mismatch current_database() => ABORTS
    let guard01Aborted = false;
    try {
      process.env.TEST_DATABASE_NAME = 'invalid_mismatched_db_name';
      await cleanupPayrollFixtures(kysely);
    } catch (err: any) {
      if (err?.message?.includes('SECURITY GUARD ABORT')) {
        guard01Aborted = true;
      }
    } finally {
      process.env.TEST_DATABASE_NAME = origTestDbName;
    }
    assert(guard01Aborted, 'TEARDOWN-GUARD-01: TEST_DATABASE_NAME mismatch with current_database() aborts teardown and prevents trigger disable');

    // TEARDOWN-GUARD-02: ALLOW_PRIVILEGED_TEST_TEARDOWN != true => ABORTS
    let guard02Aborted = false;
    try {
      process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN = 'false';
      await cleanupPayrollFixtures(kysely);
    } catch (err: any) {
      if (err?.message?.includes('SECURITY GUARD ABORT')) {
        guard02Aborted = true;
      }
    } finally {
      process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN = origAllowTeardown;
    }
    assert(guard02Aborted, 'TEARDOWN-GUARD-02: ALLOW_PRIVILEGED_TEST_TEARDOWN !== true aborts teardown');

    // TEARDOWN-GUARD-03: NODE_ENV != test => ABORTS
    let guard03Aborted = false;
    try {
      process.env.NODE_ENV = 'production';
      await cleanupPayrollFixtures(kysely);
    } catch (err: any) {
      if (err?.message?.includes('SECURITY GUARD ABORT')) {
        guard03Aborted = true;
      }
    } finally {
      process.env.NODE_ENV = origNodeEnv;
    }
    assert(guard03Aborted, 'TEARDOWN-GUARD-03: NODE_ENV !== test aborts teardown');

    console.log('==================================================');
    console.log(`PAYROLL SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error in Payroll Integration suite:', error);
    process.exit(1);
  } finally {
    try {
      await cleanupPayrollFixtures(kysely);
    } catch (cleanupErr) {
      console.error('Error during final cleanupPayrollFixtures:', cleanupErr);
    }
    await app.close();
  }
}

runPayrollIntegrationTests().catch((err) => {
  console.error('❌ Payroll Integration Test Suite Error:', err);
  process.exit(1);
});
