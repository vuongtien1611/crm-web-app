import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { LeadsService } from '../leads/leads.service';
import { LeadsController } from '../leads/leads.controller';
import { DealsService } from '../deals/deals.service';
import { DealsController } from '../deals/deals.controller';
import { CommissionsService } from '../commissions/commissions.service';
import { CommissionsController } from '../commissions/commissions.controller';
import { KpiService } from '../kpi/kpi.service';
import { KpiController } from '../kpi/kpi.controller';
import { OrdersService } from '../orders/orders.service';
import { OrdersController } from '../orders/orders.controller';
import { EmployeesService } from '../employees/employees.service';
import { KyselyService } from '../../database/kysely.service';
import { ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';
import { TeamDepartment } from './dto/create-team.dto';

async function runPhaseESalesLeaderIntegrationSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE E: SALES TEAM LEADER SECURITY SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const teamsService = app.get(TeamsService);
  const teamsController = app.get(TeamsController);
  const leadsService = app.get(LeadsService);
  const leadsController = app.get(LeadsController);
  const dealsService = app.get(DealsService);
  const dealsController = app.get(DealsController);
  const commissionsService = app.get(CommissionsService);
  const commissionsController = app.get(CommissionsController);
  const kpiService = app.get(KpiService);
  const kpiController = app.get(KpiController);
  const ordersService = app.get(OrdersService);
  const ordersController = app.get(OrdersController);
  const employeesService = app.get(EmployeesService);
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

  // Admin actor for setup (or fallback to any existing / fixture employee on clean DB)
  const adminEmp = await db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', '=', 'EMP-ADMIN-001')
    .executeTakeFirst();
  let actorEmpId = adminEmp?.id;
  if (!actorEmpId) {
    const anyEmp = await db.selectFrom('employees').select('id').orderBy('id', 'asc').executeTakeFirst();
    actorEmpId = anyEmp?.id;
  }
  if (!actorEmpId) {
    const pos = await db.selectFrom('positions').select('id').orderBy('id', 'asc').executeTakeFirstOrThrow();
    const [u] = await db.insertInto('users').values({ username: `test_actor_${runId}`, email: `actor_${runId}@test.local`, password_hash: 'x', status: 'ACTIVE' }).returningAll().execute();
    const [e] = await db.insertInto('employees').values({ employee_code: `ACTOR-${runId}`, full_name: 'Test Actor', position_id: pos.id, user_id: u.id, status: 'ACTIVE' }).returningAll().execute();
    actorEmpId = e.id;
  }
  const actorId = String(actorEmpId);

  try {
    // ----------------------------------------------------------------
    // SETUP: Create 2 Sales Teams (Team A & Team B)
    // ----------------------------------------------------------------
    const teamA = await teamsService.createTeam(
      {
        name: `Alpha Sales Team ${runId}`,
        code: `TEAM-ALPHA-${runId}`,
        department: TeamDepartment.SALES,
        description: 'Team Alpha for Phase E isolation verification',
      },
      actorId,
    );

    const teamB = await teamsService.createTeam(
      {
        name: `Beta Sales Team ${runId}`,
        code: `TEAM-BETA-${runId}`,
        department: TeamDepartment.SALES,
        description: 'Team Beta for Phase E isolation verification',
      },
      actorId,
    );

    // Create Employees
    // Leader A
    const empLeaderA = await employeesService.createEmployeeAccount(
      {
        username: `leaderA_${runId}`,
        email: `leaderA_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Leader Alpha ${runId}`,
        phone: '0901000001',
        hireDate: '2026-09-01',
        positionCode: 'SALES_TEAM_LEADER',
        roleCode: 'SALES_TEAM_LEADER',
        department: 'SALES',
      },
      actorId,
    );

    // Member A1
    const empMemberA1 = await employeesService.createEmployeeAccount(
      {
        username: `saleA1_${runId}`,
        email: `saleA1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Sale Alpha Rep 1 ${runId}`,
        phone: '0901000002',
        hireDate: '2026-09-01',
        positionCode: 'SALE',
        roleCode: 'SALE',
        department: 'SALES',
      },
      actorId,
    );

    // Leader B
    const empLeaderB = await employeesService.createEmployeeAccount(
      {
        username: `leaderB_${runId}`,
        email: `leaderB_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Leader Beta ${runId}`,
        phone: '0902000001',
        hireDate: '2026-09-01',
        positionCode: 'SALES_TEAM_LEADER',
        roleCode: 'SALES_TEAM_LEADER',
        department: 'SALES',
      },
      actorId,
    );

    // Member B1
    const empMemberB1 = await employeesService.createEmployeeAccount(
      {
        username: `saleB1_${runId}`,
        email: `saleB1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Sale Beta Rep 1 ${runId}`,
        phone: '0902000002',
        hireDate: '2026-09-01',
        positionCode: 'SALE',
        roleCode: 'SALE',
        department: 'SALES',
      },
      actorId,
    );

    // Assign to Team A
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empMemberA1.employee.id), isLeader: false },
      actorId,
    );
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empLeaderA.employee.id), isLeader: true },
      actorId,
    );

    // Assign to Team B
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empMemberB1.employee.id), isLeader: false },
      actorId,
    );
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empLeaderB.employee.id), isLeader: true },
      actorId,
    );

    // Construct JWT Payloads
    const userLeaderA: any = {
      sub: String(empLeaderA.user.id),
      employeeId: String(empLeaderA.employee.id),
      roles: ['SALES_TEAM_LEADER'],
      permissions: ['TEAM_READ', 'LEAD_READ', 'DEAL_READ', 'COMMISSION_READ', 'KPI_READ', 'ORDER_READ'],
    };

    const userLeaderB: any = {
      sub: String(empLeaderB.user.id),
      employeeId: String(empLeaderB.employee.id),
      roles: ['SALES_TEAM_LEADER'],
      permissions: ['TEAM_READ', 'LEAD_READ', 'DEAL_READ', 'COMMISSION_READ', 'KPI_READ', 'ORDER_READ'],
    };

    // SE-01: Verify Team Setup
    const ledTeamA = await teamsService.getCurrentLedTeam(empLeaderA.employee.id);
    const ledTeamB = await teamsService.getCurrentLedTeam(empLeaderB.employee.id);
    assert(
      ledTeamA && String(ledTeamA.id) === String(teamA.id) &&
      ledTeamB && String(ledTeamB.id) === String(teamB.id),
      'SE-01: Independent Sales Teams A and B initialized with temporal leaders',
    );

    // ----------------------------------------------------------------
    // ENTITY SEEDING FOR TEAM A AND TEAM B
    // ----------------------------------------------------------------
    // 1. Leads
    const leadA = await leadsService.createLead({
      fullName: `Lead Customer Alpha ${runId}`,
      phone: `0981${runId}`,
      email: `leadA_${runId}@corp.local`,
      landingPage: '/landing-alpha',
    });
    // Assign leadA to Member A1
    await db.updateTable('leads').set({ assigned_sale_id: empMemberA1.employee.id as any }).where('id', '=', leadA.id as any).execute();

    const leadB = await leadsService.createLead({
      fullName: `Lead Customer Beta ${runId}`,
      phone: `0982${runId}`,
      email: `leadB_${runId}@corp.local`,
      landingPage: '/landing-beta',
    });
    // Assign leadB to Member B1
    await db.updateTable('leads').set({ assigned_sale_id: empMemberB1.employee.id as any }).where('id', '=', leadB.id as any).execute();

    // 2. Accounts & Deals
    const [accountA] = await db
      .insertInto('accounts')
      .values({
        company_name: `Alpha Corp ${runId}`,
        tax_code: `TAX-A-${runId}`,
        phone: '0281111111',
      })
      .returningAll()
      .execute();

    const [accountB] = await db
      .insertInto('accounts')
      .values({
        company_name: `Beta Corp ${runId}`,
        tax_code: `TAX-B-${runId}`,
        phone: '0282222222',
      })
      .returningAll()
      .execute();

    const dealA = await dealsService.createDeal({
      accountId: String(accountA.id),
      assignedSaleId: String(empMemberA1.employee.id),
      dealName: `Alpha Contract 1 ${runId}`,
      expectedValue: 50000000,
    });

    const dealB = await dealsService.createDeal({
      accountId: String(accountB.id),
      assignedSaleId: String(empMemberB1.employee.id),
      dealName: `Beta Contract 1 ${runId}`,
      expectedValue: 80000000,
    });

    // 3. Orders & Order Items (required for Commission target scope)
    const service = await db.selectFrom('services').selectAll().executeTakeFirst();
    const serviceId = service ? service.id : 1;
    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const templateId = reqTemplate ? reqTemplate.id : 6;
    const templateVersion = reqTemplate ? reqTemplate.version : 1;

    const [orderA] = await db
      .insertInto('orders')
      .values({
        account_id: accountA.id as any,
        order_code: `ORD-A-${runId}`,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    const [orderItemA] = await db
      .insertInto('order_items')
      .values({
        order_id: orderA.id as any,
        service_id: serviceId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 50000000 as any,
        net_service_value: 50000000 as any,
        closing_sale_id: empMemberA1.employee.id as any,
      })
      .returningAll()
      .execute();

    const [orderB] = await db
      .insertInto('orders')
      .values({
        account_id: accountB.id as any,
        order_code: `ORD-B-${runId}`,
        workflow_status: 'DRAFT',
      })
      .returningAll()
      .execute();

    const [orderItemB] = await db
      .insertInto('order_items')
      .values({
        order_id: orderB.id as any,
        service_id: serviceId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 80000000 as any,
        net_service_value: 80000000 as any,
        closing_sale_id: empMemberB1.employee.id as any,
      })
      .returningAll()
      .execute();

    // 4. Commissions (tied to order_item_id)
    const policy = await db.selectFrom('commission_policies').selectAll().where(sql`effective_range @> NOW()` as any).executeTakeFirst();
    const policyId = policy ? policy.id : 1;

    const [commA] = await db
      .insertInto('commissions')
      .values({
        policy_id: policyId as any,
        order_item_id: orderItemA.id as any,
        beneficiary_employee_id: empMemberA1.employee.id as any,
        commission_type: 'SALE',
        rate_snapshot: 0.06 as any,
        commission_base: 50000000 as any,
        calculated_amount: 3000000 as any,
        status: 'CALCULATED',
      })
      .returningAll()
      .execute();

    const [commB] = await db
      .insertInto('commissions')
      .values({
        policy_id: policyId as any,
        order_item_id: orderItemB.id as any,
        beneficiary_employee_id: empMemberB1.employee.id as any,
        commission_type: 'SALE',
        rate_snapshot: 0.06 as any,
        commission_base: 80000000 as any,
        calculated_amount: 4800000 as any,
        status: 'CALCULATED',
      })
      .returningAll()
      .execute();

    // 5. KPI Events
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const kpiPolicy = await db.selectFrom('kpi_policies').selectAll().where(sql`effective_range @> NOW()` as any).executeTakeFirst();
    const kpiPolicyId = kpiPolicy ? kpiPolicy.id : 1;

    const [kpiEventA] = await db
      .insertInto('kpi_events')
      .values({
        employee_id: empMemberA1.employee.id as any,
        policy_id: kpiPolicyId as any,
        source_type: 'PAYMENT_ALLOCATION',
        source_id: 1,
        metric_type: 'CASH_REVENUE',
        metric_value: 50000000 as any,
        kpi_points: 10 as any,
        eligible_revenue: 50000000 as any,
        target_kpi_period: currentPeriod,
        qualified_at: new Date(),
      })
      .returningAll()
      .execute();

    const [kpiEventB] = await db
      .insertInto('kpi_events')
      .values({
        employee_id: empMemberB1.employee.id as any,
        policy_id: kpiPolicyId as any,
        source_type: 'PAYMENT_ALLOCATION',
        source_id: 2,
        metric_type: 'CASH_REVENUE',
        metric_value: 80000000 as any,
        kpi_points: 15 as any,
        eligible_revenue: 80000000 as any,
        target_kpi_period: currentPeriod,
        qualified_at: new Date(),
      })
      .returningAll()
      .execute();

    // ----------------------------------------------------------------
    // SE-02: LEADS LIST SCOPE VERIFICATION
    // ----------------------------------------------------------------
    const leadsListA = await leadsController.getLeads(userLeaderA);
    const hasLeadAInListA = leadsListA.data.some((l: any) => String(l.id) === String(leadA.id));
    const hasLeadBInListA = leadsListA.data.some((l: any) => String(l.id) === String(leadB.id));

    const leadsListB = await leadsController.getLeads(userLeaderB);
    const hasLeadBInListB = leadsListB.data.some((l: any) => String(l.id) === String(leadB.id));
    const hasLeadAInListB = leadsListB.data.some((l: any) => String(l.id) === String(leadA.id));

    assert(
      hasLeadAInListA && !hasLeadBInListA && hasLeadBInListB && !hasLeadAInListB,
      'SE-02: Leads list strictly scoped to current team members (Leader A sees Team A, not Team B)',
    );

    // ----------------------------------------------------------------
    // SE-03: LEADS DETAIL OBJECT AUTHORIZATION
    // ----------------------------------------------------------------
    let leaderAViewLeadA = false;
    let leaderAViewLeadBBlocked = false;
    try {
      const res = await leadsController.getLeadById(userLeaderA, String(leadA.id));
      if (res && String(res.id) === String(leadA.id)) leaderAViewLeadA = true;
    } catch (_) {}

    try {
      await leadsController.getLeadById(userLeaderA, String(leadB.id));
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAViewLeadBBlocked = true;
    }

    assert(
      leaderAViewLeadA && leaderAViewLeadBBlocked,
      'SE-03: Leads detail object auth: Leader A gets 200 on Member A lead, 403 Forbidden on Member B lead',
    );

    // ----------------------------------------------------------------
    // SE-04: DEALS LIST SCOPE VERIFICATION
    // ----------------------------------------------------------------
    const dealsListA = await dealsController.findDeals(undefined, undefined, undefined, undefined, undefined, undefined, userLeaderA);
    const hasDealAInListA = dealsListA.data.some((d: any) => String(d.id) === String(dealA.id));
    const hasDealBInListA = dealsListA.data.some((d: any) => String(d.id) === String(dealB.id));

    const dealsListB = await dealsController.findDeals(undefined, undefined, undefined, undefined, undefined, undefined, userLeaderB);
    const hasDealBInListB = dealsListB.data.some((d: any) => String(d.id) === String(dealB.id));
    const hasDealAInListB = dealsListB.data.some((d: any) => String(d.id) === String(dealA.id));

    assert(
      hasDealAInListA && !hasDealBInListA && hasDealBInListB && !hasDealAInListB,
      'SE-04: Deals list strictly scoped to current team members (Leader A sees Team A, not Team B)',
    );

    // ----------------------------------------------------------------
    // SE-05: DEALS DETAIL OBJECT AUTHORIZATION
    // ----------------------------------------------------------------
    let leaderAViewDealA = false;
    let leaderAViewDealBBlocked = false;
    try {
      const res = await dealsController.findDealById(String(dealA.id), userLeaderA);
      if (res && String(res.id) === String(dealA.id)) leaderAViewDealA = true;
    } catch (_) {}

    try {
      await dealsController.findDealById(String(dealB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAViewDealBBlocked = true;
    }

    assert(
      leaderAViewDealA && leaderAViewDealBBlocked,
      'SE-05: Deals detail object auth: Leader A gets 200 on Member A deal, 403 Forbidden on Member B deal',
    );

    // ----------------------------------------------------------------
    // SE-06: COMMISSIONS LIST & DETAIL SCOPE + ACCURATE TOTAL COUNT
    // ----------------------------------------------------------------
    const commListA = await commissionsController.findCommissions(userLeaderA);
    const hasCommA = commListA.data.some((c: any) => String(c.id) === String(commA.id));
    const hasCommB = commListA.data.some((c: any) => String(c.id) === String(commB.id));

    let leaderAViewCommBBlocked = false;
    try {
      await commissionsController.findCommissionById(String(commB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAViewCommBBlocked = true;
    }

    assert(
      hasCommA && !hasCommB && leaderAViewCommBBlocked && commListA.meta.total >= 1,
      'SE-06: Commissions list & detail scoped to team members, meta.total reflects filtered count without global leakage',
    );

    // ----------------------------------------------------------------
    // SE-07: KPI EVENTS & EMPLOYEE SUMMARY SCOPE
    // ----------------------------------------------------------------
    const kpiEventsListA = await kpiController.findKpiEvents(userLeaderA);
    const hasKpiA = kpiEventsListA.data.some((e: any) => String(e.id) === String(kpiEventA.id));
    const hasKpiB = kpiEventsListA.data.some((e: any) => String(e.id) === String(kpiEventB.id));

    let leaderAViewKpiSummaryBBlocked = false;
    try {
      await kpiController.getEmployeeKpiSummary(String(empMemberB1.employee.id), currentPeriod, userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAViewKpiSummaryBBlocked = true;
    }

    assert(
      hasKpiA && !hasKpiB && leaderAViewKpiSummaryBBlocked,
      'SE-07: KPI events & employee summary scoped to team members (Member B KPI returns 403 for Leader A)',
    );

    // ----------------------------------------------------------------
    // SE-08: ORDERS LIST & DETAIL SCOPE (NO GLOBAL BYPASS)
    // ----------------------------------------------------------------
    const ordersListA = await ordersController.findOrders(undefined, undefined, undefined, undefined, undefined, userLeaderA);
    const hasOrderA = ordersListA.data.some((o: any) => String(o.id) === String(orderA.id));
    const hasOrderB = ordersListA.data.some((o: any) => String(o.id) === String(orderB.id));

    let leaderAViewOrderBBlocked = false;
    try {
      await ordersController.findOrderById(String(orderB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAViewOrderBBlocked = true;
    }

    assert(
      hasOrderA && !hasOrderB && leaderAViewOrderBBlocked,
      'SE-08: Orders list & detail object-scoped: SALES_TEAM_LEADER has NO global bypass; Leader A blocked from Team B orders (403)',
    );

    // ----------------------------------------------------------------
    // SE-09: TEMPORAL MEMBERSHIP CHANGE REVOCATION & TRANSFER
    // ----------------------------------------------------------------
    // Move Member A1 from Team A to Team B
    await teamsService.moveMember(
      teamA.id,
      { employeeId: String(empMemberA1.employee.id), targetTeamId: String(teamB.id) },
      actorId,
    );

    // Now Member A1 is no longer in Team A, but in Team B!
    let leaderAOldMemberBlocked = false;
    try {
      await leadsController.getLeadById(userLeaderA, String(leadA.id));
    } catch (err: any) {
      if (err instanceof ForbiddenException) leaderAOldMemberBlocked = true;
    }

    let leaderBNewMemberAllowed = false;
    try {
      const res = await leadsController.getLeadById(userLeaderB, String(leadA.id));
      if (res && String(res.id) === String(leadA.id)) leaderBNewMemberAllowed = true;
    } catch (_) {}

    assert(
      leaderAOldMemberBlocked && leaderBNewMemberAllowed,
      'SE-09: Temporal membership change: Leader A immediately loses access to moved member (403); Leader B receives access',
    );

    // ----------------------------------------------------------------
    // SE-10: REAL DATABASE AGGREGATE DASHBOARD SUMMARY (NOT PAGINATED)
    // ----------------------------------------------------------------
    const summaryB = await teamsController.getSalesWorkspaceSummary(currentPeriod, userLeaderB);
    assert(
      summaryB &&
      summaryB.team.id === String(teamB.id) &&
      summaryB.metrics.totalLeads >= 2 && // Member B1's lead + moved Member A1's lead
      summaryB.metrics.openDealsCount >= 2 && // Deal B + Deal A
      summaryB.members.length === 3, // Leader B + Member B1 + moved Member A1
      'SE-10: Real Database Aggregate Dashboard Summary calculates accurate server-side metrics across all members',
    );

  } catch (err) {
    console.error('❌ Unexpected Error during Phase E Suite:', err);
    failCount++;
  } finally {
    console.log('====================================================');
    console.log(`PHASE E SUITE FINISHED: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('====================================================');
    await app.close();
    if (failCount > 0) process.exit(1);
  }
}

runPhaseESalesLeaderIntegrationSuite();
