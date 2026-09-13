import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as jwt from 'jsonwebtoken';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { MAX_EXPORT_ROWS } from './export.constants';

function assert(condition: boolean, message: string, detail?: any) {
  if (!condition) {
    const d = detail ? ` (Detail: ${JSON.stringify(detail)})` : '';
    throw new Error(`Assertion Failed: ${message}${d}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runPhaseOExportSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE O: EXPORT EXCEL / PDF INTEGRATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const configService = app.get<ConfigService>(ConfigService);
  const reflector = app.get<Reflector>(Reflector);
  const exportService = app.get<ExportService>(ExportService);
  const exportController = app.get<ExportController>(ExportController);
  const permissionsGuard = new PermissionsGuard(reflector);
  const jwtAuthGuard = new JwtAuthGuard(reflector, configService);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    console.log('--- Setting up test fixtures ---');
    // Positions
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirst();
    const posId = salePos ? salePos.id : (1 as any);
    const devPosId = devPos ? devPos.id : posId;

    // Roles
    const bossRole = await db.selectFrom('roles').selectAll().where('code', '=', 'BOSS').executeTakeFirst();
    const leaderRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALES_TEAM_LEADER').executeTakeFirst();
    const devLeaderRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirst();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const accRole = await db.selectFrom('roles').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirst();

    // 1. Boss
    const [bossUser] = await db
      .insertInto('users')
      .values({ username: `boss_ex_${runId}`, password_hash: 'hash', email: `boss_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [bossEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-BOSS-EX-${runId}`, full_name: `Boss User EX ${runId}`, position_id: posId, user_id: bossUser.id })
      .returningAll()
      .execute();
    if (bossRole) {
      await db.insertInto('user_roles').values({ user_id: bossUser.id, role_id: bossRole.id }).execute();
    }

    // 2. Sales Leader Team A & Sale 1
    const [leaderAUser] = await db
      .insertInto('users')
      .values({ username: `leaderA_ex_${runId}`, password_hash: 'hash', email: `leaderA_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [leaderAEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-LA-EX-${runId}`, full_name: `Sales Leader A ${runId}`, position_id: posId, user_id: leaderAUser.id })
      .returningAll()
      .execute();
    if (leaderRole) {
      await db.insertInto('user_roles').values({ user_id: leaderAUser.id, role_id: leaderRole.id }).execute();
    }

    const [sale1User] = await db
      .insertInto('users')
      .values({ username: `sale1_ex_${runId}`, password_hash: 'hash', email: `sale1_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [sale1Emp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-S1-EX-${runId}`, full_name: `Sale One ${runId}`, position_id: posId, user_id: sale1User.id })
      .returningAll()
      .execute();
    if (saleRole) {
      await db.insertInto('user_roles').values({ user_id: sale1User.id, role_id: saleRole.id }).execute();
    }

    // 3. Sales Leader Team B & Sale 2
    const [leaderBUser] = await db
      .insertInto('users')
      .values({ username: `leaderB_ex_${runId}`, password_hash: 'hash', email: `leaderB_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [leaderBEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-LB-EX-${runId}`, full_name: `Sales Leader B ${runId}`, position_id: posId, user_id: leaderBUser.id })
      .returningAll()
      .execute();
    if (leaderRole) {
      await db.insertInto('user_roles').values({ user_id: leaderBUser.id, role_id: leaderRole.id }).execute();
    }

    const [sale2User] = await db
      .insertInto('users')
      .values({ username: `sale2_ex_${runId}`, password_hash: 'hash', email: `sale2_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [sale2Emp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-S2-EX-${runId}`, full_name: `Sale Two ${runId}`, position_id: posId, user_id: sale2User.id })
      .returningAll()
      .execute();
    if (saleRole) {
      await db.insertInto('user_roles').values({ user_id: sale2User.id, role_id: saleRole.id }).execute();
    }

    // 4. Tech Leader (DEV_TEAM_LEADER)
    const [techLeaderUser] = await db
      .insertInto('users')
      .values({ username: `techlead_ex_${runId}`, password_hash: 'hash', email: `techlead_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [techLeaderEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DEV-EX-${runId}`, full_name: `Tech Leader ${runId}`, position_id: devPosId, user_id: techLeaderUser.id })
      .returningAll()
      .execute();
    if (devLeaderRole) {
      await db.insertInto('user_roles').values({ user_id: techLeaderUser.id, role_id: devLeaderRole.id }).execute();
    }

    // 5. Accountant
    const [accUser] = await db
      .insertInto('users')
      .values({ username: `acc_ex_${runId}`, password_hash: 'hash', email: `acc_ex_${runId}@test.com` })
      .returningAll()
      .execute();
    const [accEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-ACC-EX-${runId}`, full_name: `Accountant ${runId}`, position_id: posId, user_id: accUser.id })
      .returningAll()
      .execute();
    if (accRole) {
      await db.insertInto('user_roles').values({ user_id: accUser.id, role_id: accRole.id }).execute();
    }

    // Create Teams
    const [teamA] = await db
      .insertInto('teams')
      .values({ name: `Sales Team A ${runId}`, code: `TM-SA-${runId}`, department: 'SALES' })
      .returningAll()
      .execute();
    await db.insertInto('team_memberships').values({
      team_id: teamA.id,
      employee_id: leaderAEmp.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();
    await db.insertInto('team_memberships').values({
      team_id: teamA.id,
      employee_id: sale1Emp.id,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();

    const [teamB] = await db
      .insertInto('teams')
      .values({ name: `Sales Team B ${runId}`, code: `TM-SB-${runId}`, department: 'SALES' })
      .returningAll()
      .execute();
    await db.insertInto('team_memberships').values({
      team_id: teamB.id,
      employee_id: leaderBEmp.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();
    await db.insertInto('team_memberships').values({
      team_id: teamB.id,
      employee_id: sale2Emp.id,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();

    // Dev Team
    const [devTeam] = await db
      .insertInto('teams')
      .values({ name: `Dev Team ${runId}`, code: `TM-DEV-${runId}`, department: 'DEV' })
      .returningAll()
      .execute();
    await db.insertInto('team_memberships').values({
      team_id: devTeam.id,
      employee_id: techLeaderEmp.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - INTERVAL '5 days', NULL, '[]')` as any,
    }).execute();

    // Customer Account
    const [account] = await db
      .insertInto('accounts')
      .values({
        company_name: `Cong Ty TNHH Sao Mai ${runId}`,
        tax_code: `TAX-${runId}`,
        phone: '0901234567',
        email: `info_${runId}@saomai.com`,
      } as any)
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: 'Nguyen Van Dai Dien',
        email: `contact_${runId}@saomai.com`,
        phone: '0901234567',
        is_primary: true,
      } as any)
      .returningAll()
      .execute();

    // Service & Order
    const [service] = await db
      .insertInto('services')
      .values({
        name: `Service Web Enterprise ${runId}`,
        code: `WEB-ENT-${runId}`,
        service_type: 'PROJECT',
        is_active: true,
      } as any)
      .returningAll()
      .execute();

    // Actor context payloads for simulating JWT
    const bossActor = {
      userId: String(bossUser.id),
      employeeId: String(bossEmp.id),
      roles: ['BOSS', 'ADMIN'],
      permissions: [
        'LEAD_READ', 'ORDER_READ', 'PAYMENT_READ', 'PROJECT_READ',
        'KPI_READ', 'PAYROLL_READ', 'EXPENSE_READ',
      ],
    };

    const leaderAActor = {
      userId: String(leaderAUser.id),
      employeeId: String(leaderAEmp.id),
      roles: ['SALES_TEAM_LEADER'],
      permissions: ['LEAD_READ', 'ORDER_READ', 'PROJECT_READ', 'KPI_READ'],
    };

    const sale1Actor = {
      userId: String(sale1User.id),
      employeeId: String(sale1Emp.id),
      roles: ['SALE'],
      permissions: ['LEAD_READ', 'ORDER_READ', 'PROJECT_READ', 'KPI_READ'],
    };

    const techLeaderActor = {
      userId: String(techLeaderUser.id),
      employeeId: String(techLeaderEmp.id),
      roles: ['DEV_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'KPI_READ'], // NO PAYMENT_READ, NO PAYROLL_READ, NO EXPENSE_READ
    };

    const accountantActor = {
      userId: String(accUser.id),
      employeeId: String(accEmp.id),
      roles: ['ACCOUNTANT'],
      permissions: ['PAYMENT_READ', 'PAYROLL_READ', 'EXPENSE_READ'],
    };

    // Create Leads
    // Lead 1: assigned to Sale 1 (Team A)
    const [lead1] = await db
      .insertInto('leads')
      .values({
        full_name: 'Nguyen Van Anh',
        phone: '0911000001',
        email: 'anh.nv@gmail.com',
        status: 'NEW',
        quality: 'POTENTIAL',
        assigned_sale_id: sale1Emp.id,
        creator_employee_id: leaderAEmp.id,
      } as any)
      .returningAll()
      .execute();

    // Lead 2: assigned to Sale 2 (Team B) - contains formula injection strings
    const [lead2] = await db
      .insertInto('leads')
      .values({
        full_name: '=SUM(1,2)',
        phone: '+84922000002',
        email: '-dangerous@email.com',
        status: 'FOLLOWING',
        quality: 'UNCLASSIFIED',
        assigned_sale_id: sale2Emp.id,
        creator_employee_id: leaderBEmp.id,
      } as any)
      .returningAll()
      .execute();

    // Lead 3: Vietnamese Unicode Lead
    const [lead3] = await db
      .insertInto('leads')
      .values({
        full_name: 'Trần Thị Mỹ Duyên - Khách Hàng Tiềm Năng',
        phone: '0933000003',
        email: 'duyen.ttm@gmail.com',
        status: 'NEW',
        quality: 'POTENTIAL',
        assigned_sale_id: sale1Emp.id,
        creator_employee_id: sale1Emp.id,
      } as any)
      .returningAll()
      .execute();

    // Requirement Template
    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const reqTemplateId = reqTemplate ? reqTemplate.id : (1 as any);

    // Create Account 2 for Order 2
    const [account2] = await db
      .insertInto('accounts')
      .values({
        company_name: `Cong Ty TNHH Thien Ha ${runId}`,
        tax_code: `TAX-2-${runId}`,
        phone: '0907654321',
        email: `info2_${runId}@thienha.com`,
      } as any)
      .returningAll()
      .execute();

    // Create Orders
    const [order1] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-A-${runId}`,
        account_id: account.id,
        primary_contact_id: contact.id,
        workflow_status: 'IN_PROGRESS',
      } as any)
      .returningAll()
      .execute();

    const [orderItem1] = await db.insertInto('order_items').values({
      order_id: order1.id,
      service_id: service.id,
      closing_sale_id: sale1Emp.id,
      requirement_template_id: reqTemplateId,
      requirement_template_version: 1,
      net_service_value: 25000000,
      original_price: 25000000,
      approval_status: 'APPROVED',
      delivery_status: 'IN_PROGRESS',
      payment_status: 'FULLY_PAID',
    } as any).returningAll().execute();

    const [order2] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-B-${runId}`,
        account_id: account2.id,
        primary_contact_id: contact.id,
        workflow_status: 'APPROVED',
      } as any)
      .returningAll()
      .execute();

    await db.insertInto('order_items').values({
      order_id: order2.id,
      service_id: service.id,
      closing_sale_id: sale2Emp.id,
      requirement_template_id: reqTemplateId,
      requirement_template_version: 1,
      net_service_value: 15000000,
      original_price: 15000000,
      approval_status: 'APPROVED',
      delivery_status: 'PENDING',
      payment_status: 'UNPAID',
    } as any).execute();

    // Create Payment (with secret evidence_url)
    const [payment1] = await db
      .insertInto('payments')
      .values({
        payment_code: `PAY-${runId}`,
        gross_cash_amount: 25000000,
        payment_method: 'BANK_TRANSFER',
        status: 'CONFIRMED',
        created_by_employee_id: accEmp.id,
        confirmed_by_employee_id: bossEmp.id,
        confirmed_at: new Date(),
        evidence_url: 'storage/secret-keys/payment_proof_secret_12345.jpg',
      } as any)
      .returningAll()
      .execute();

    // Create Project
    const [project1] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItem1.id,
        project_name: `Dự Án Web Portal ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 50,
        started_at: new Date(),
      } as any)
      .returningAll()
      .execute();

    await db.insertInto('project_assignments').values({
      project_id: project1.id,
      employee_id: techLeaderEmp.id,
      assignment_type: 'PRIMARY',
      is_active: true,
      assigned_at: new Date(),
    } as any).execute();

    // Create KPI event
    const kpiPolicy = await db.selectFrom('kpi_policies').selectAll().executeTakeFirst();
    const policyId = kpiPolicy ? kpiPolicy.id : (1 as any);
    await db.insertInto('kpi_events').values({
      employee_id: sale1Emp.id,
      policy_id: policyId,
      source_type: 'PAYMENT_ALLOCATION',
      source_id: 1,
      metric_type: 'ORDER_APPROVED_REVENUE',
      metric_value: 25000000,
      kpi_points: 10,
      eligible_revenue: 25000000,
      target_kpi_period: '2026-09',
    } as any).execute();

    // Create Payroll Period & Payroll Record
    const [period] = await db
      .insertInto('payroll_periods')
      .values({
        period_key: `2026-09-${runId}`,
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        status: 'REVIEW',
      } as any)
      .returningAll()
      .execute();

    await db.insertInto('payrolls').values({
      payroll_period_id: period.id,
      employee_id: sale1Emp.id,
      base_salary: 10000000,
      released_commission_amount: 2500000,
      kpi_bonus_amount: 1000000,
      team_override_amount: 0,
      adjustment_amount: 0,
      net_salary_amount: 13500000,
    } as any).execute();

    // Create Expense
    const expenseCategory = await db.selectFrom('expense_categories').selectAll().executeTakeFirst();
    const categoryId = expenseCategory ? expenseCategory.id : (1 as any);
    await db.insertInto('expenses').values({
      category_id: categoryId,
      amount: 4500000,
      expense_date: '2026-09-05',
      source_type: 'DIRECT_PURCHASE',
      created_by_employee_id: accEmp.id,
      note: 'Chi phí mua thiết bị văn phòng',
    } as any).execute();

    console.log('--- Executing EX-01 through EX-12 Verification ---');

    // ========================================================================
    // EX-01: Lead Excel export chứa đúng dữ liệu và cấu trúc cột
    // ========================================================================
    const leadExportBoss = await exportService.exportLeads(bossActor, {});
    assert(leadExportBoss.buffer && leadExportBoss.buffer.length > 0, 'EX-01: Leads Excel buffer generated');
    assert(leadExportBoss.filename.startsWith('leads_'), 'EX-01: Leads Excel filename has correct prefix');
    
    const wbLeads = new ExcelJS.Workbook();
    await wbLeads.xlsx.load(leadExportBoss.buffer as any);
    const wsLeads = wbLeads.getWorksheet('Leads');
    assert(!!wsLeads, 'EX-01: Worksheet "Leads" exists');
    assert(wsLeads!.views?.[0]?.state === 'frozen', 'EX-01: Header row is frozen');
    const headerRow = wsLeads!.getRow(1);
    const headerValues = headerRow.values as string[];
    assert(headerValues.includes('Mã Lead') && headerValues.includes('Họ và tên'), 'EX-01: Correct headers present');

    // ========================================================================
    // EX-02: Sales Leader Team A export không chứa Team B
    // ========================================================================
    const leadExportLeaderA = await exportService.exportLeads(leaderAActor, {});
    const wbLeaderA = new ExcelJS.Workbook();
    await wbLeaderA.xlsx.load(leadExportLeaderA.buffer as any);
    const wsLeaderA = wbLeaderA.getWorksheet('Leads');
    let hasTeamBLead = false;
    let hasTeamALead = false;
    wsLeaderA!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowStr = JSON.stringify(row.values);
      if (rowStr.includes('0922000002') || rowStr.includes(String(lead2.id))) {
        hasTeamBLead = true;
      }
      if (rowStr.includes('0911000001') || rowStr.includes(String(lead1.id))) {
        hasTeamALead = true;
      }
    });
    assert(hasTeamALead, 'EX-02: Sales Leader Team A receives own team leads');
    assert(!hasTeamBLead, 'EX-02: Sales Leader Team A does NOT receive Team B leads');

    // ========================================================================
    // EX-03: Sale chỉ export own data
    // ========================================================================
    const leadExportSale1 = await exportService.exportLeads(sale1Actor, {});
    const wbSale1 = new ExcelJS.Workbook();
    await wbSale1.xlsx.load(leadExportSale1.buffer as any);
    const wsSale1 = wbSale1.getWorksheet('Leads');
    let sale1HasLead2 = false;
    let sale1HasLead1 = false;
    wsSale1!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowStr = JSON.stringify(row.values);
      if (rowStr.includes('0922000002') || rowStr.includes(String(lead2.id))) {
        sale1HasLead2 = true;
      }
      if (rowStr.includes('0911000001') || rowStr.includes(String(lead1.id))) {
        sale1HasLead1 = true;
      }
    });
    assert(sale1HasLead1, 'EX-03: Sale 1 receives assigned lead');
    assert(!sale1HasLead2, 'EX-03: Sale 1 does NOT receive Sale 2 lead');

    // ========================================================================
    // EX-04: Payment export đúng Accountant scope
    // ========================================================================
    const paymentExportAcc = await exportService.exportPayments(accountantActor, {});
    assert(paymentExportAcc.buffer && paymentExportAcc.buffer.length > 0, 'EX-04: Payment buffer generated for Accountant');
    const wbPayment = new ExcelJS.Workbook();
    await wbPayment.xlsx.load(paymentExportAcc.buffer as any);
    const wsPayment = wbPayment.getWorksheet('Payments');
    assert(!!wsPayment, 'EX-04: Worksheet "Payments" exists');
    let paymentFound = false;
    wsPayment!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowStr = JSON.stringify(row.values);
      if (rowStr.includes(payment1.payment_code) || rowStr.includes(String(payment1.id))) {
        paymentFound = true;
      }
    });
    assert(paymentFound, 'EX-04: Confirmed payment found in accountant export');

    // ========================================================================
    // EX-05: Tech Leader không nhận financial data ngoài quyền (PermissionsGuard check)
    // ========================================================================
    // Tech leader does not have PAYMENT_READ, PAYROLL_READ, EXPENSE_READ
    const fakePaymentContext: any = {
      getHandler: () => ExportController.prototype.exportPayments,
      getClass: () => ExportController,
      switchToHttp: () => ({
        getRequest: () => ({ user: techLeaderActor }),
      }),
    };
    let techLeaderBlockedPayment = false;
    try {
      permissionsGuard.canActivate(fakePaymentContext);
    } catch (err: any) {
      if (err instanceof ForbiddenException) techLeaderBlockedPayment = true;
    }
    assert(techLeaderBlockedPayment, 'EX-05: Tech Leader blocked from Payments export (403 Forbidden)');

    const fakePayrollContext: any = {
      getHandler: () => ExportController.prototype.exportPayroll,
      getClass: () => ExportController,
      switchToHttp: () => ({
        getRequest: () => ({ user: techLeaderActor }),
      }),
    };
    let techLeaderBlockedPayroll = false;
    try {
      permissionsGuard.canActivate(fakePayrollContext);
    } catch (err: any) {
      if (err instanceof ForbiddenException) techLeaderBlockedPayroll = true;
    }
    assert(techLeaderBlockedPayroll, 'EX-05: Tech Leader blocked from Payroll export (403 Forbidden)');

    const fakeExpenseContext: any = {
      getHandler: () => ExportController.prototype.exportExpenses,
      getClass: () => ExportController,
      switchToHttp: () => ({
        getRequest: () => ({ user: techLeaderActor }),
      }),
    };
    let techLeaderBlockedExpense = false;
    try {
      permissionsGuard.canActivate(fakeExpenseContext);
    } catch (err: any) {
      if (err instanceof ForbiddenException) techLeaderBlockedExpense = true;
    }
    assert(techLeaderBlockedExpense, 'EX-05: Tech Leader blocked from Expenses export (403 Forbidden)');

    // ========================================================================
    // EX-06: Payroll export permission đúng
    // ========================================================================
    const payrollExportAcc = await exportService.exportPayroll(accountantActor, String(period.id));
    assert(payrollExportAcc.buffer && payrollExportAcc.buffer.length > 0, 'EX-06: Accountant exported payroll');
    const wbPayroll = new ExcelJS.Workbook();
    await wbPayroll.xlsx.load(payrollExportAcc.buffer as any);
    const wsPayroll = wbPayroll.getWorksheet('Payroll');
    assert(!!wsPayroll, 'EX-06: Worksheet "Payroll" exists');
    let foundSale1Payroll = false;
    wsPayroll!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rowStr = JSON.stringify(row.values);
      if (rowStr.includes(`EMP-S1-EX-${runId}`)) {
        foundSale1Payroll = true;
      }
    });
    assert(foundSale1Payroll, 'EX-06: Employee payroll record present in period export');

    // ========================================================================
    // EX-07: Filter date/status được áp dụng chính xác
    // ========================================================================
    const filteredLeads = await exportService.exportLeads(bossActor, { status: 'FOLLOWING' });
    const wbFiltered = new ExcelJS.Workbook();
    await wbFiltered.xlsx.load(filteredLeads.buffer as any);
    const wsFiltered = wbFiltered.getWorksheet('Leads');
    let allMatchStatus = true;
    let rowCount = 0;
    wsFiltered!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      rowCount++;
      const val = row.getCell(8).value; // Trạng thái column
      if (val !== 'FOLLOWING') {
        allMatchStatus = false;
      }
    });
    assert(rowCount > 0 && allMatchStatus, 'EX-07: Filter status applied accurately to export');

    // ========================================================================
    // EX-08: Formula injection được neutralize
    // ========================================================================
    // lead2 has full_name = '=SUM(1,2)', phone = '+84922000002', email = '-dangerous@email.com'
    const lead2Export = await exportService.exportLeads(bossActor, { q: 'SUM' });
    const wbFormula = new ExcelJS.Workbook();
    await wbFormula.xlsx.load(lead2Export.buffer as any);
    const wsFormula = wbFormula.getWorksheet('Leads');
    let sanitizedFormula = false;
    let sanitizedPlus = false;
    let sanitizedMinus = false;
    wsFormula!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const nameVal = String(row.getCell(2).value || '');
      const phoneVal = String(row.getCell(3).value || '');
      const emailVal = String(row.getCell(4).value || '');
      if (nameVal.startsWith("'=")) sanitizedFormula = true;
      if (phoneVal.startsWith("'+")) sanitizedPlus = true;
      if (emailVal.startsWith("'-")) sanitizedMinus = true;
    });
    assert(sanitizedFormula, 'EX-08: Formula starting with = escaped with single quote');
    assert(sanitizedPlus, 'EX-08: Text starting with + escaped with single quote');
    assert(sanitizedMinus, 'EX-08: Text starting with - escaped with single quote');

    // Test direct sanitize function
    assert(exportService.sanitizeCellValue('=cmd') === "'=cmd", 'EX-08: Direct = injection neutralized');
    assert(exportService.sanitizeCellValue('+cmd') === "'+cmd", 'EX-08: Direct + injection neutralized');
    assert(exportService.sanitizeCellValue('-cmd') === "'-cmd", 'EX-08: Direct - injection neutralized');
    assert(exportService.sanitizeCellValue('@cmd') === "'@cmd", 'EX-08: Direct @ injection neutralized');

    // ========================================================================
    // EX-09: Unicode tiếng Việt xuất đúng
    // ========================================================================
    const unicodeExport = await exportService.exportLeads(bossActor, { q: 'Mỹ Duyên' });
    const wbUnicode = new ExcelJS.Workbook();
    await wbUnicode.xlsx.load(unicodeExport.buffer as any);
    const wsUnicode = wbUnicode.getWorksheet('Leads');
    let foundUnicode = false;
    wsUnicode!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const nameVal = String(row.getCell(2).value || '');
      if (nameVal.includes('Trần Thị Mỹ Duyên - Khách Hàng Tiềm Năng')) {
        foundUnicode = true;
      }
    });
    assert(foundUnicode, 'EX-09: Vietnamese Unicode characters properly preserved in Excel cells');

    // ========================================================================
    // EX-10: Large export không vượt memory strategy đã thiết kế (MAX_EXPORT_ROWS limit)
    // ========================================================================
    assert(MAX_EXPORT_ROWS === 5000, 'EX-10: Bounded memory export limit is set to 5,000');
    const largeExport = await exportService.exportLeads(bossActor, { limit: 999999 });
    assert(largeExport.rowCount <= MAX_EXPORT_ROWS, 'EX-10: Export rows bounded by MAX_EXPORT_ROWS');

    // ========================================================================
    // EX-11A: Không có JWT => 401 Unauthorized
    // ========================================================================
    const noJwtContext: any = {
      getHandler: () => ExportController.prototype.exportLeads,
      getClass: () => ExportController,
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    };
    let noJwtBlocked = false;
    try {
      jwtAuthGuard.canActivate(noJwtContext);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) noJwtBlocked = true;
    }
    assert(noJwtBlocked, 'EX-11A: Request without JWT token returns 401 Unauthorized');

    // ========================================================================
    // EX-11B: Có JWT nhưng thiếu permission => 403 Forbidden
    // ========================================================================
    const accessSecret = configService.get<string>('jwt.accessSecret') || 'default_access_secret';
    const unauthorizedToken = jwt.sign(
      { sub: '9999', employeeId: '9999', roles: ['GUEST'], permissions: [] },
      accessSecret,
      { expiresIn: '1h' },
    );
    const validJwtReq: any = {
      headers: { authorization: `Bearer ${unauthorizedToken}` },
    };
    const validJwtContext: any = {
      getHandler: () => ExportController.prototype.exportLeads,
      getClass: () => ExportController,
      switchToHttp: () => ({
        getRequest: () => validJwtReq,
      }),
    };
    const jwtPassed = jwtAuthGuard.canActivate(validJwtContext);
    assert(jwtPassed && validJwtReq.user, 'EX-11B: Valid JWT authenticated successfully by JwtAuthGuard');

    let permissionBlocked = false;
    try {
      permissionsGuard.canActivate(validJwtContext);
    } catch (err: any) {
      if (err instanceof ForbiddenException) permissionBlocked = true;
    }
    assert(permissionBlocked, 'EX-11B: Authenticated user without LEAD_READ returns 403 Forbidden');

    // ========================================================================
    // EX-12: Export không chứa password/token/object storage secrets
    // ========================================================================
    // Check payment export content
    const paymentCheckExport = await exportService.exportPayments(accountantActor, {});
    const wbSecretCheck = new ExcelJS.Workbook();
    await wbSecretCheck.xlsx.load(paymentCheckExport.buffer as any);
    const wsSecretCheck = wbSecretCheck.getWorksheet('Payments');
    let leakStorageSecret = false;
    wsSecretCheck!.eachRow((row) => {
      const rowContent = JSON.stringify(row.values);
      if (rowContent.includes('secret-keys') || rowContent.includes('payment_proof_secret_12345.jpg')) {
        leakStorageSecret = true;
      }
    });
    assert(!leakStorageSecret, 'EX-12: Payment export does NOT expose objectKey or evidence_url');

    // Check payroll export content
    const payrollCheckExport = await exportService.exportPayroll(accountantActor, String(period.id));
    const wbPayrollSecret = new ExcelJS.Workbook();
    await wbPayrollSecret.xlsx.load(payrollCheckExport.buffer as any);
    const wsPayrollSecret = wbPayrollSecret.getWorksheet('Payroll');
    let leakPassword = false;
    wsPayrollSecret!.eachRow((row) => {
      const rowContent = JSON.stringify(row.values);
      if (rowContent.includes('password_hash') || rowContent.includes('argon2') || rowContent.includes('hash')) {
        leakPassword = true;
      }
    });
    assert(!leakPassword, 'EX-12: Payroll export does NOT expose password hashes or sensitive tokens');

    // ========================================================================
    // EX-13: Generate export tại MAX_EXPORT_ROWS (Bounded In-Memory V1)
    // ========================================================================
    const maxCols = [
      { header: 'ID', key: 'id', width: 12 },
      { header: 'Tiêu đề kiểm thử', key: 'title', width: 25 },
      { header: 'Số tiền (VND)', key: 'amount', format: 'currency' as const },
    ];
    const maxRows = Array.from({ length: MAX_EXPORT_ROWS }, (_, i) => ({
      id: i + 1,
      title: `Bản ghi kiểm thử số ${i + 1}`,
      amount: (i + 1) * 1000,
    }));
    const maxBuffer = await exportService.buildWorkbook('MaxRowsTest', maxCols, maxRows);
    assert(maxBuffer && maxBuffer.length > 0, 'EX-13: Workbook at MAX_EXPORT_ROWS generated successfully');
    const wbMax = new ExcelJS.Workbook();
    await wbMax.xlsx.load(maxBuffer as any);
    const wsMax = wbMax.getWorksheet('MaxRowsTest');
    assert(wsMax!.rowCount === MAX_EXPORT_ROWS + 1, 'EX-13: Exactly MAX_EXPORT_ROWS data rows + 1 header row present in sheet');
    assert(maxRows.length <= MAX_EXPORT_ROWS, 'EX-13: Export row count strictly adheres to MAX_EXPORT_ROWS limit');

    console.log('\n====================================================');
    console.log('✅ ALL EX-01 THROUGH EX-13 PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('Phase O Export Suite execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPhaseOExportSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
