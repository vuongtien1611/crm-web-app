import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ExpensesService } from './expenses.service';
import { PayrollService } from '../payroll/payroll.service';
import { KyselyService } from '../../database/kysely.service';
import { ExpenseSourceType } from './dto/create-expense.dto';
import { sql } from 'kysely';

async function getCurrentDatabaseName(kysely: KyselyService): Promise<string> {
  const result = await sql<{ dbname: string }>`SELECT current_database() AS dbname`.execute(kysely.db);
  const dbname = result.rows[0]?.dbname;
  if (!dbname) {
    throw new Error('SECURITY GUARD ABORT: UNABLE TO VERIFY CURRENT TEST DATABASE');
  }
  return dbname;
}

async function cleanupExpenseFixtures(kysely: KyselyService) {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isTeardownAllowed = process.env.ALLOW_PRIVILEGED_TEST_TEARDOWN === 'true';
  const currentDb = await getCurrentDatabaseName(kysely);
  const expectedDb = process.env.TEST_DATABASE_NAME || 'crm_db';

  if (!isTestEnv || !isTeardownAllowed || currentDb !== expectedDb) {
    console.error(`SECURITY GUARD ABORT: Teardown blocked on DB '${currentDb}'`);
    throw new Error(`SECURITY GUARD ABORT: Teardown blocked on DB '${currentDb}'`);
  }

  // Find test-created employees
  const testEmployees = await kysely.db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', 'like', 'EXP-TEST-%')
    .execute();

  const empIds = testEmployees.map((e) => e.id);

  // Find test-created payroll periods
  const testPeriods = await kysely.db
    .selectFrom('payroll_periods')
    .select('id')
    .where('period_key', 'like', 'EXP-TEST-%')
    .execute();

  const periodIds = testPeriods.map((p) => p.id);

  // Delete manual test expenses
  await kysely.db
    .deleteFrom('expenses')
    .where('note', 'like', '%TEST-EXPENSE%')
    .execute();

  if (empIds.length > 0) {
    // Clean audit logs for test employees
    await kysely.db.deleteFrom('audit_logs').where('actor_employee_id', 'in', empIds).execute();
  }

  if (periodIds.length > 0) {
    // PRIVILEGED TEST-ONLY TEARDOWN: Disable exact payroll protection triggers strictly in test DB during teardown
    await sql`ALTER TABLE payroll_periods DISABLE TRIGGER trg_protect_locked_payroll_periods`.execute(kysely.db);
    await sql`ALTER TABLE payrolls DISABLE TRIGGER trg_protect_locked_payrolls`.execute(kysely.db);
    await sql`ALTER TABLE payroll_items DISABLE TRIGGER trg_protect_locked_payroll_items`.execute(kysely.db);
    await sql`ALTER TABLE payroll_adjustments DISABLE TRIGGER trg_protect_locked_payroll_adjustments`.execute(kysely.db);

    try {
      // Delete expenses referencing test payroll periods
      await kysely.db
        .deleteFrom('expenses')
        .where('source_payroll_period_id', 'in', periodIds)
        .execute();

      const payrolls = await kysely.db
        .selectFrom('payrolls')
        .select('id')
        .where('payroll_period_id', 'in', periodIds)
        .execute();

      const payrollIds = payrolls.map((p) => p.id);

      if (payrollIds.length > 0) {
        await kysely.db.deleteFrom('payroll_items').where('payroll_id', 'in', payrollIds).execute();
        await kysely.db.deleteFrom('payroll_adjustments').where('target_payroll_id', 'in', payrollIds).execute();
        await kysely.db.deleteFrom('payrolls').where('payroll_period_id', 'in', periodIds).execute();
      }

      await kysely.db.deleteFrom('payroll_periods').where('id', 'in', periodIds).execute();
    } finally {
      // Re-enable exact protection triggers immediately after deletion
      await sql`ALTER TABLE payroll_periods ENABLE TRIGGER trg_protect_locked_payroll_periods`.execute(kysely.db);
      await sql`ALTER TABLE payrolls ENABLE TRIGGER trg_protect_locked_payrolls`.execute(kysely.db);
      await sql`ALTER TABLE payroll_items ENABLE TRIGGER trg_protect_locked_payroll_items`.execute(kysely.db);
      await sql`ALTER TABLE payroll_adjustments ENABLE TRIGGER trg_protect_locked_payroll_adjustments`.execute(kysely.db);
    }
  }

  if (empIds.length > 0) {
    await kysely.db.deleteFrom('employees').where('id', 'in', empIds).execute();
  }
}

async function runExpenseIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING EXPENSE FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const expensesService = app.get(ExpensesService);
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
    // Initial cleanup
    await cleanupExpenseFixtures(kysely);

    // --------------------------------------------------
    // FIXTURE SETUP
    // --------------------------------------------------
    const categories = await expensesService.getCategories();
    const officeRentCat = categories.find((c) => c.code === 'OFFICE_RENT');
    const salaryCat = categories.find((c) => c.code === 'SALARY_PAYROLL');

    if (!officeRentCat || !salaryCat) {
      throw new Error('Required expense categories (OFFICE_RENT, SALARY_PAYROLL) missing from DB seed');
    }

    const position = await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow();

    // Create Test Accountant Employee
    const [testEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EXP-TEST-${Date.now()}`,
        full_name: 'Expense Test Accountant',
        position_id: position.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // --------------------------------------------------
    // EXPENSE-01: Create valid manual Expense
    // --------------------------------------------------
    try {
      const manualExp = await expensesService.createManualExpense(
        {
          category_id: String(officeRentCat.id),
          amount: 15000000,
          expense_date: '2026-09-01',
          source_type: ExpenseSourceType.DIRECT_PURCHASE,
          note: 'TEST-EXPENSE Office Rent Sept 2026',
        },
        String(testEmp.id),
      );

      assert(
        manualExp !== undefined &&
          Number(manualExp.amount) === 15000000 &&
          manualExp.source_type === 'DIRECT_PURCHASE' &&
          String(manualExp.created_by_employee_id) === String(testEmp.id),
        'EXPENSE-01: Create valid manual Expense',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-01: Create valid manual Expense', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-02: Reject invalid amount or category
    // --------------------------------------------------
    try {
      let rejectedZeroAmount = false;
      try {
        await expensesService.createManualExpense(
          {
            category_id: String(officeRentCat.id),
            amount: 0,
            expense_date: '2026-09-01',
            source_type: ExpenseSourceType.DIRECT_PURCHASE,
            note: 'TEST-EXPENSE Invalid Zero',
          },
          String(testEmp.id),
        );
      } catch (e: any) {
        rejectedZeroAmount = e.status === 400 || e.message?.includes('greater than 0');
      }

      let rejectedInvalidCategory = false;
      try {
        await expensesService.createManualExpense(
          {
            category_id: '999999999',
            amount: 5000000,
            expense_date: '2026-09-01',
            source_type: ExpenseSourceType.DIRECT_PURCHASE,
            note: 'TEST-EXPENSE Invalid Category',
          },
          String(testEmp.id),
        );
      } catch (e: any) {
        rejectedInvalidCategory = e.status === 404 || e.response?.statusCode === 404 || e.message?.includes('not found');
      }

      assert(
        rejectedZeroAmount && rejectedInvalidCategory,
        'EXPENSE-02: Reject invalid amount (<=0) or non-existent category_id',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-02: Reject invalid amount or category', err.message);
    }

    // --------------------------------------------------
    // PAYROLL SETUP FOR EXPENSE-03..08
    // Create Locked Payroll Period with Salary Payout
    // --------------------------------------------------
    const periodKey = `EXP-TEST-${Date.now()}`;
    const [period] = await kysely.db
      .insertInto('payroll_periods')
      .values({
        period_key: periodKey,
        start_date: '2026-08-01' as any,
        end_date: '2026-08-31' as any,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    // Insert Payroll under this Period while OPEN
    await kysely.db
      .insertInto('payrolls')
      .values([
        {
          payroll_period_id: period.id,
          employee_id: testEmp.id,
          base_salary: 10000000,
          released_commission_amount: 2000000,
          kpi_bonus_amount: 1000000,
          team_override_amount: 0,
          adjustment_amount: 0,
          net_salary_amount: 13000000,
        },
      ])
      .execute();

    // Transition Period to LOCKED after payroll data is finalized
    await kysely.db
      .updateTable('payroll_periods')
      .set({
        status: 'LOCKED',
        locked_at: new Date(),
        locked_by_employee_id: testEmp.id,
      })
      .where('id', '=', period.id)
      .execute();

    // --------------------------------------------------
    // EXPENSE-03: Payroll source creates Expense correctly
    // --------------------------------------------------
    let payrollExpense: any;
    try {
      payrollExpense = await expensesService.processPayrollExpense(
        { payroll_period_id: String(period.id) },
        String(testEmp.id),
      );

      assert(
        payrollExpense !== undefined &&
          payrollExpense.source_type === 'PAYROLL' &&
          String(payrollExpense.source_payroll_period_id) === String(period.id) &&
          String(payrollExpense.category_id) === String(salaryCat.id),
        'EXPENSE-03: Locked Payroll source creates corresponding Expense correctly',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-03: Payroll source creates Expense correctly', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-04: Repeated Payroll->Expense processing is idempotent
    // --------------------------------------------------
    try {
      const secondAttempt = await expensesService.processPayrollExpense(
        { payroll_period_id: String(period.id) },
        String(testEmp.id),
      );

      assert(
        secondAttempt !== undefined &&
          String(secondAttempt.id) === String(payrollExpense.id) &&
          Number(secondAttempt.amount) === Number(payrollExpense.amount),
        'EXPENSE-04: Repeated Payroll->Expense processing for same period is idempotent and returns canonical record',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-04: Repeated Payroll->Expense idempotency', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-05: Concurrent Payroll->Expense attempt produces exactly one canonical Expense
    // --------------------------------------------------
    try {
      const results = await Promise.all([
        expensesService.processPayrollExpense({ payroll_period_id: String(period.id) }, String(testEmp.id)),
        expensesService.processPayrollExpense({ payroll_period_id: String(period.id) }, String(testEmp.id)),
        expensesService.processPayrollExpense({ payroll_period_id: String(period.id) }, String(testEmp.id)),
      ]);

      const uniqueIds = new Set(results.map((r) => String(r.id)));

      assert(
        uniqueIds.size === 1 && String(results[0].id) === String(payrollExpense.id),
        'EXPENSE-05: Concurrent Payroll->Expense attempt produces exactly one canonical Expense',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-05: Concurrent Payroll->Expense deduplication', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-06: Expense amount equals canonical payroll payable source
    // --------------------------------------------------
    try {
      assert(
        Number(payrollExpense.amount) === 13000000,
        'EXPENSE-06: Expense amount (13,000,000) equals canonical payroll payable source net salary sum',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-06: Expense amount equals canonical payroll payable source', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-07: Locked Payroll remains unchanged after Expense creation
    // --------------------------------------------------
    try {
      const periodAfter = await kysely.db
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', period.id)
        .executeTakeFirst();

      const payrollsAfter = await kysely.db
        .selectFrom('payrolls')
        .selectAll()
        .where('payroll_period_id', '=', period.id)
        .execute();

      assert(
        periodAfter?.status === 'LOCKED' &&
          payrollsAfter.length === 1 &&
          Number(payrollsAfter[0].net_salary_amount) === 13000000,
        'EXPENSE-07: Locked Payroll period and payroll records remain completely unchanged after Expense creation',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-07: Locked Payroll remains unchanged after Expense creation', err.message);
    }

    // --------------------------------------------------
    // EXPENSE-08: Audit trace preserved
    // --------------------------------------------------
    try {
      const auditLog = await kysely.db
        .selectFrom('audit_logs')
        .selectAll()
        .where('entity_type', '=', 'EXPENSE')
        .where('entity_id', '=', payrollExpense.id)
        .executeTakeFirst();

      assert(
        auditLog !== undefined &&
          auditLog.action === 'EXPENSE_PAYROLL_PROCESS' &&
          String(auditLog.actor_employee_id) === String(testEmp.id),
        'EXPENSE-08: Audit log trace preserved for Expense creation',
      );
    } catch (err: any) {
      assert(false, 'EXPENSE-08: Audit trace preserved', err.message);
    }
  } catch (error: any) {
    console.error('Fatal error in Expense Integration suite:', error);
    failed++;
  } finally {
    try {
      await cleanupExpenseFixtures(kysely);
    } catch (cleanupErr) {
      console.error('Error during final cleanupExpenseFixtures:', cleanupErr);
    }

    console.log('==================================================');
    console.log(`EXPENSE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    await app.close();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runExpenseIntegrationTests().catch((err) => {
  console.error('❌ Expense Integration Test Suite Error:', err);
  process.exit(1);
});
