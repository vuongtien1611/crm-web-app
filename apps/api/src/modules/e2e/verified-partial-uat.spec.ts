import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from '../orders/orders.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { TeamsService } from '../teams/teams.service';
import { TeamDepartment } from '../teams/dto/create-team.dto';
import { PayrollService } from '../payroll/payroll.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ExportService } from '../export/export.service';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { LeadQuality } from '../leads/dto/update-lead-quality.dto';
import { ExpenseSourceType } from '../expenses/dto/create-expense.dto';
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    throw new Error(`UAT Test Failed: ${testName} (${detail})`);
  }
}

async function runVerifiedPartialUatSuite() {
  console.log('================================================================');
  console.log('🧪 VERIFIED RUNTIME MUTATION SUITE FOR 7 PARTIAL UAT CASES');
  console.log('Targeting isolated database: crm_test_db');
  console.log('================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const kysely = app.get(KyselyService);
  const db = kysely.db;
  const redisService = app.get(RedisService);
  const authService = app.get(AuthService);
  const leadsService = app.get(LeadsService);
  const dealsService = app.get(DealsService);
  const ordersService = app.get(OrdersService);
  const projectsService = app.get(ProjectsService);
  const paymentsService = app.get(PaymentsService);
  const teamsService = app.get(TeamsService);
  const payrollService = app.get(PayrollService);
  const expensesService = app.get(ExpensesService);
  const exportService = app.get(ExportService);

  const testSuffix = Math.floor(100000 + Math.random() * 900000);
  const stagingPassword = 'Staging@2026Pass!';

  try {
    // -------------------------------------------------------------
    // FIXTURE LOOKUP VIA AUTH SERVICE
    // -------------------------------------------------------------
    console.log('--- 0. Resolving Fixtures from crm_test_db ---');

    // Clear any test rate limits
    const rlKeys = await redisService.client.keys('login_attempts:*');
    if (rlKeys.length > 0) {
      await redisService.client.del(...rlKeys);
    }

    const adminLogin = await authService.login({ identifier: 'staging_admin', password: stagingPassword });
    const bossLogin = await authService.login({ identifier: 'staging_boss', password: stagingPassword });
    const accLogin = await authService.login({ identifier: 'staging_accountant', password: stagingPassword });
    const saleLogin = await authService.login({ identifier: 'staging_sale', password: stagingPassword });
    const devLeadLogin = await authService.login({ identifier: 'staging_dev_leader', password: stagingPassword });
    const devLogin = await authService.login({ identifier: 'staging_dev', password: stagingPassword });

    const adminUser = adminLogin.user;
    const bossUser = bossLogin.user;
    const accUser = accLogin.user;
    const saleUser = saleLogin.user;
    const devLeadUser = devLeadLogin.user;
    const devUser = devLogin.user;

    console.log(`Resolved fixtures: boss=${bossUser.employeeId}, sale=${saleUser.employeeId}, devLead=${devLeadUser.employeeId}, dev=${devUser.employeeId}`);

    let channel = await db.selectFrom('channels').selectAll().executeTakeFirst();
    if (!channel) {
      channel = await db
        .insertInto('channels')
        .values({ code: `CH-${testSuffix}`, name: 'Direct Marketing' })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    let platform = await db.selectFrom('platforms').selectAll().executeTakeFirst();
    if (!platform) {
      platform = await db
        .insertInto('platforms')
        .values({ code: `PL-${testSuffix}`, name: 'Website Portal' })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    // =============================================================
    // 1. UAT-E2E-01: TẠO LEAD TỪ FORM VÀ XÁC MINH DỮ LIỆU
    // =============================================================
    console.log('\n>>> CASE 1: UAT-E2E-01 — Create Lead Form Mutation <<<');
    const leadEmail = `lead_uat_${testSuffix}@staging.crm.local`;
    const leadPhone = `0977${testSuffix.toString().padStart(6, '0')}`;
    const leadFullName = `Khách Hàng UAT Test ${testSuffix}`;

    const newLead = await leadsService.createLead(
      {
        fullName: leadFullName,
        phone: leadPhone,
        email: leadEmail,
        channelId: String(channel.id),
        platformId: String(platform.id),
        creatorEmployeeId: String(saleUser.employeeId),
      },
      saleUser,
    );

    assert(Boolean(newLead && newLead.id), 'UAT-E2E-01: Lead created with returned ID');
    assert(newLead.full_name === leadFullName, 'UAT-E2E-01: Full name matches payload');
    assert(newLead.phone === leadPhone, 'UAT-E2E-01: Phone matches payload');
    assert(newLead.status === 'NEW', 'UAT-E2E-01: Initial status is NEW');

    // DB Verification
    const dbLead = await db
      .selectFrom('leads')
      .selectAll()
      .where('id', '=', newLead.id)
      .executeTakeFirst();
    assert(Boolean(dbLead), 'UAT-E2E-01: Record persisted in leads table');
    assert(dbLead?.email === leadEmail, 'UAT-E2E-01: Persisted email matches');

    // =============================================================
    // 2. UAT-E2E-07: TẠO & PHÂN CÔNG DỰ ÁN (ASSIGN PROJECT)
    // =============================================================
    console.log('\n>>> CASE 2: UAT-E2E-07 — Create & Assign Project Mutation <<<');

    // Qualify lead to POTENTIAL before converting to deal
    await leadsService.qualifyLead(String(newLead.id), { quality: LeadQuality.POTENTIAL });

    // Convert lead to deal and mark WON to get approved order item
    const convertResult = await leadsService.convertToDeal(
      String(newLead.id),
      {
        companyName: `Công Ty Cổ Phần UAT ${testSuffix}`,
        contactName: `Nguyễn Văn Đại Diện ${testSuffix}`,
        dealName: `Hợp Đồng Phần Mềm UAT ${testSuffix}`,
        expectedValue: 20000000,
      },
      String(saleUser.employeeId),
    );

    const deal = convertResult.deal;
    await dealsService.startNegotiation(String(deal.id));
    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleUser.employeeId) });
    const wonResult = await dealsService.markWon(String(deal.id));

    const order = wonResult.order;
    const orderItem = wonResult.orderItem;

    // Submit and approve order & item
    await ordersService.submitOrder(String(order.id), String(saleUser.employeeId));
    await ordersService.submitOrderItem(String(orderItem.id), String(saleUser.employeeId));
    await ordersService.approveOrder(String(order.id), String(bossUser.employeeId));
    await ordersService.approveOrderItem(String(orderItem.id), String(bossUser.employeeId));

    // Call assignProject
    const assignRes = await projectsService.assignProject(
      String(orderItem.id),
      {
        employeeId: String(devUser.employeeId),
        assignmentType: AssignmentType.PRIMARY,
      },
      String(devLeadUser.employeeId),
    );

    assert(Boolean(assignRes && assignRes.project), 'UAT-E2E-07: Project successfully created');
    assert(assignRes.project.status === 'ASSIGNED', 'UAT-E2E-07: Project status is ASSIGNED');
    assert(String(assignRes.assignment.employee_id) === String(devUser.employeeId), 'UAT-E2E-07: Assignment points to devUser');
    assert(assignRes.assignment.assignment_type === 'PRIMARY', 'UAT-E2E-07: Assignment type is PRIMARY');

    // Verify retrieval via findProjectById
    const projectDetail = await projectsService.findProjectById(String(assignRes.project.id));
    assert(Boolean(projectDetail && String(projectDetail.id) === String(assignRes.project.id)), 'UAT-E2E-07: Can open project detail via findProjectById');

    // =============================================================
    // 3. UAT-PAY-01: PAYMENT PLAN, INSTALLMENT, ALLOCATION & OVER-ALLOCATION GUARD
    // =============================================================
    console.log('\n>>> CASE 3: UAT-PAY-01 — Payment Plan, Allocation & Over-Allocation Guard <<<');

    // Create payment plan and installment
    const [plan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: String(bossUser.employeeId) as any,
        config_snapshot: { type: 'FULL_UPFRONT' },
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan.id,
        installment_number: 1,
        due_date: new Date().toISOString().split('T')[0] as any,
        gross_amount_due: 20000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    // Create payment by accountant
    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 20000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 20000000,
            closingSaleId: String(saleUser.employeeId),
          },
        ],
      },
      String(accUser.employeeId),
    );
    assert(payment.status === 'PENDING_CONFIRMATION', 'UAT-PAY-01: Payment created in PENDING_CONFIRMATION');

    // Confirm Payment with Allocation by Boss
    const confirmedPayment = await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 20000000,
            vatAllocatedAmount: 0,
            serviceAmount: 20000000,
            netEligibleAmount: 20000000,
            closingSaleId: String(saleUser.employeeId),
          },
        ],
      },
      String(bossUser.employeeId),
    );
    assert(confirmedPayment.status === 'CONFIRMED', 'UAT-PAY-01: Payment confirmed by Boss');

    // Check Installment is PAID
    const updatedInstallment = await db
      .selectFrom('payment_installments')
      .selectAll()
      .where('id', '=', installment.id)
      .executeTakeFirstOrThrow();
    assert(updatedInstallment.status === 'PAID', 'UAT-PAY-01: Installment status updated to PAID');

    // Test OVER-ALLOCATION GUARD
    const excessPayment = await paymentsService.createPayment(
      {
        grossCashAmount: 5000000,
        paymentMethod: 'CASH' as any,
      },
      String(accUser.employeeId),
    );

    let overAllocationBlocked = false;
    try {
      // Attempt to allocate 10,000,000 on a 5,000,000 payment
      await paymentsService.confirmPayment(
        String(excessPayment.id),
        {
          allocations: [
            {
              installmentId: String(installment.id),
              grossAllocatedAmount: 10000000,
              vatAllocatedAmount: 0,
              serviceAmount: 10000000,
              netEligibleAmount: 10000000,
              closingSaleId: String(saleUser.employeeId),
            },
          ],
        },
        String(bossUser.employeeId),
      );
    } catch (err: any) {
      overAllocationBlocked = err instanceof BadRequestException || err.message?.includes('exceeds');
    }
    assert(overAllocationBlocked, 'UAT-PAY-01: Over-allocation (> gross payment amount) correctly blocked');

    // =============================================================
    // 4. UAT-TEAM-01: TẠO TEAM VÀ AUTO-GENERATE TEAM CODE
    // =============================================================
    console.log('\n>>> CASE 4: UAT-TEAM-01 — Team Creation & Code Auto-Generation <<<');

    const createdTeam = await teamsService.createTeam(
      {
        name: `Đội Ngũ Kinh Doanh UAT ${testSuffix}`,
        department: TeamDepartment.SALES,
        description: 'Auto-generated team code verification',
      },
      String(adminUser.employeeId),
      { forceAutoCode: true },
    );

    assert(Boolean(createdTeam && createdTeam.id), 'UAT-TEAM-01: Team created successfully');
    assert(Boolean(createdTeam.code && /^SALES_[0-9]+$/.test(createdTeam.code)), `UAT-TEAM-01: Team code auto-generated matching pattern SALES_xx (Actual: ${createdTeam.code})`);

    const dbTeam = await db
      .selectFrom('teams')
      .selectAll()
      .where('id', '=', createdTeam.id as any)
      .executeTakeFirst();
    assert(dbTeam?.code === createdTeam.code, 'UAT-TEAM-01: Auto-generated code persisted in teams table');

    // =============================================================
    // 5. UAT-E2E-15: TÍNH TOÁN PAYROLL, PHÊ DUYỆT VÀ KHÓA KỲ LƯƠNG
    // =============================================================
    console.log('\n>>> CASE 5: UAT-E2E-15 — Payroll Calculation, Approval & Lock Period <<<');

    const testYear = 2030 + (testSuffix % 50);
    const testMonth = String((testSuffix % 12) + 1).padStart(2, '0');
    const periodKey = `${testYear}-${testMonth}-PAY-UAT-${testSuffix}`;
    const period = await payrollService.createPeriod({
      periodKey,
      startDate: `${testYear}-${testMonth}-01`,
      endDate: `${testYear}-${testMonth}-28`,
    });
    assert(Boolean(period && period.id), 'UAT-E2E-15: Payroll period created in OPEN status');

    // Calculate payroll
    await payrollService.calculatePayrollPeriod(String(period.id), String(accUser.employeeId));

    // Approve period
    const approvedPeriod = await payrollService.approvePeriod(String(period.id), String(bossUser.employeeId));
    assert(approvedPeriod.status === 'APPROVED', 'UAT-E2E-15: Period status transitioned to APPROVED');

    // Lock period
    const lockedPeriod = await payrollService.lockPeriod(String(period.id), String(bossUser.employeeId));
    assert(lockedPeriod.status === 'LOCKED', 'UAT-E2E-15: Period status transitioned to LOCKED');
    assert(Boolean(lockedPeriod.locked_at), 'UAT-E2E-15: locked_at timestamp recorded');

    // Verify immutability
    let lockGuardTriggered = false;
    try {
      await payrollService.approvePeriod(String(period.id), String(bossUser.employeeId));
    } catch (err: any) {
      lockGuardTriggered = err instanceof BadRequestException || err.message?.includes('LOCKED');
    }
    assert(lockGuardTriggered, 'UAT-E2E-15: Locked period is immutable (mutations blocked)');

    // =============================================================
    // 6. UAT-EXP-01: TẠO CHI PHÍ THỦ CÔNG VÀ KIỂM TRA LƯU TRỮ
    // =============================================================
    console.log('\n>>> CASE 6: UAT-EXP-01 — Create Manual Expense & Audit Logging <<<');

    let category = await db.selectFrom('expense_categories').selectAll().executeTakeFirst();
    if (!category) {
      category = await db
        .insertInto('expense_categories')
        .values({
          name: 'Văn Phòng Phẩm',
          code: `OFFICE-SUPPLIES-${testSuffix}`,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const manualExpense = await expensesService.createManualExpense(
      {
        category_id: String(category.id),
        amount: 3500000,
        expense_date: '2026-11-18',
        source_type: ExpenseSourceType.DIRECT_PURCHASE,
        note: `UAT-EXP-01 Verified Expense ${testSuffix}`,
      },
      String(accUser.employeeId),
    );

    assert(Boolean(manualExpense && manualExpense.id), 'UAT-EXP-01: Manual expense created with ID');
    assert(Number(manualExpense.amount) === 3500000, 'UAT-EXP-01: Amount recorded correctly as 3,500,000 VND');

    const dbAudit = await db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_type', '=', 'EXPENSE')
      .where('entity_id', '=', manualExpense.id as any)
      .executeTakeFirst();
    assert(Boolean(dbAudit), 'UAT-EXP-01: Audit log entry created for expense creation');

    // =============================================================
    // 7. UAT-E2E-17: XUẤT FILE EXCEL & KIỂM TRA FORMAT / CẤU TRÚC
    // =============================================================
    console.log('\n>>> CASE 7: UAT-E2E-17 — Excel Export Buffer & Structure Verification <<<');

    const exportResult = await exportService.exportOrders(bossUser, {});

    assert(Boolean(exportResult && exportResult.buffer), 'UAT-E2E-17: Export returned non-empty buffer');
    assert(exportResult.buffer.length > 0, 'UAT-E2E-17: Buffer length > 0');

    // Check ZIP / OpenXML magic bytes: 0x50, 0x4B, 0x03, 0x04 ('PK\x03\x04')
    const magicBytes = exportResult.buffer.subarray(0, 4);
    const isZip =
      magicBytes[0] === 0x50 &&
      magicBytes[1] === 0x4b &&
      magicBytes[2] === 0x03 &&
      magicBytes[3] === 0x04;
    assert(isZip, 'UAT-E2E-17: Export buffer possesses valid OpenXML / ZIP magic bytes (PK\\x03\\x04)');

    // Parse Excel workbook with exceljs
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exportResult.buffer as any);
    const worksheet = workbook.worksheets[0];

    assert(Boolean(worksheet), 'UAT-E2E-17: Loaded workbook contains valid worksheet');
    assert(worksheet.rowCount >= 1, `UAT-E2E-17: Worksheet row count >= 1 (Actual: ${worksheet.rowCount})`);

    const headerRow = worksheet.getRow(1);
    const headerValues = (headerRow.values as any[]).filter(Boolean);
    assert(headerValues.length >= 4, `UAT-E2E-17: Header columns present (Found: ${headerValues.length} columns)`);
    console.log(`  Headers extracted: ${headerValues.slice(0, 5).join(' | ')}`);

    // =============================================================
    // SUMMARY
    // =============================================================
    console.log('\n================================================================');
    console.log('🎉 ALL 7/7 PARTIAL UAT CASES FULLY VERIFIED WITH RUNTIME MUTATIONS!');
    console.log('================================================================\n');

    await app.close();
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ VERIFIED PARTIAL UAT SUITE FAILED:', error);
    await app.close();
    process.exit(1);
  }
}

runVerifiedPartialUatSuite();
