import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { ProjectsService } from '../projects/projects.service';
import { ProjectsController } from '../projects/projects.controller';
import { KpiService } from '../kpi/kpi.service';
import { KpiController } from '../kpi/kpi.controller';
import { EmployeesService } from '../employees/employees.service';
import { KyselyService } from '../../database/kysely.service';
import { ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';
import { TeamDepartment } from './dto/create-team.dto';

async function runPhaseGSeoLeaderIntegrationSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE G: SEO TEAM LEADER WORKSPACE SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const teamsService = app.get(TeamsService);
  const teamsController = app.get(TeamsController);
  const projectsService = app.get(ProjectsService);
  const projectsController = app.get(ProjectsController);
  const kpiService = app.get(KpiService);
  const kpiController = app.get(KpiController);
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
    // SETUP: Create 2 SEO Teams (Team Alpha & Team Beta)
    // ----------------------------------------------------------------
    const teamA = await teamsService.createTeam(
      {
        name: `Alpha SEO Team ${runId}`,
        code: `SEO-ALPHA-${runId}`,
        department: TeamDepartment.SEO,
        description: 'Team Alpha for Phase G isolation verification',
      },
      actorId,
    );

    const teamB = await teamsService.createTeam(
      {
        name: `Beta SEO Team ${runId}`,
        code: `SEO-BETA-${runId}`,
        department: TeamDepartment.SEO,
        description: 'Team Beta for Phase G isolation verification',
      },
      actorId,
    );

    // Create Employees
    // Leader A
    const empLeaderA = await employeesService.createEmployeeAccount(
      {
        username: `seo_leaderA_${runId}`,
        email: `seo_leaderA_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Leader Alpha ${runId}`,
        phone: '0903000001',
        hireDate: '2026-09-01',
        positionCode: 'SEO_TEAM_LEADER',
        roleCode: 'SEO_TEAM_LEADER',
        department: 'SEO',
      },
      actorId,
    );

    // SEO A1
    const empSeoA1 = await employeesService.createEmployeeAccount(
      {
        username: `seoA1_${runId}`,
        email: `seoA1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Alpha One ${runId}`,
        phone: '0903000002',
        hireDate: '2026-09-01',
        positionCode: 'SEO',
        roleCode: 'SEO',
        department: 'SEO',
      },
      actorId,
    );

    // Leader B
    const empLeaderB = await employeesService.createEmployeeAccount(
      {
        username: `seo_leaderB_${runId}`,
        email: `seo_leaderB_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Leader Beta ${runId}`,
        phone: '0903000003',
        hireDate: '2026-09-01',
        positionCode: 'SEO_TEAM_LEADER',
        roleCode: 'SEO_TEAM_LEADER',
        department: 'SEO',
      },
      actorId,
    );

    // SEO B1
    const empSeoB1 = await employeesService.createEmployeeAccount(
      {
        username: `seoB1_${runId}`,
        email: `seoB1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Beta One ${runId}`,
        phone: '0903000004',
        hireDate: '2026-09-01',
        positionCode: 'SEO',
        roleCode: 'SEO',
        department: 'SEO',
      },
      actorId,
    );

    // Assign memberships
    // Team A: Leader A + SEO A1
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empLeaderA.employee.id), isLeader: true },
      actorId,
    );
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empSeoA1.employee.id), isLeader: false },
      actorId,
    );

    // Team B: Leader B + SEO B1
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empLeaderB.employee.id), isLeader: true },
      actorId,
    );
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empSeoB1.employee.id), isLeader: false },
      actorId,
    );

    // Setup Mock JWT Payloads
    const userLeaderA: any = {
      sub: String(empLeaderA.user.id),
      employeeId: String(empLeaderA.employee.id),
      roles: ['SEO_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ', 'KPI_READ'],
    };

    const userLeaderB: any = {
      sub: String(empLeaderB.user.id),
      employeeId: String(empLeaderB.employee.id),
      roles: ['SEO_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ', 'KPI_READ'],
    };

    const userAdmin: any = {
      sub: 'admin-sub',
      employeeId: actorId,
      roles: ['ADMIN'],
      permissions: ['PROJECT_VIEW_ALL', 'TEAM_READ', 'KPI_READ'],
    };

    // ----------------------------------------------------------------
    // SF-01: Team SEO A / Team SEO B độc lập
    // ----------------------------------------------------------------
    const membersA = await teamsService.getCurrentTeamMembers(teamA.id);
    const membersB = await teamsService.getCurrentTeamMembers(teamB.id);

    const summaryA = await teamsController.getSeoWorkspaceSummary(undefined, userLeaderA);
    const summaryB = await teamsController.getSeoWorkspaceSummary(undefined, userLeaderB);

    const sf01Passed =
      membersA.length === 2 &&
      membersB.length === 2 &&
      membersA.some((m: any) => String(m.id) === String(empLeaderA.employee.id) && m.is_leader) &&
      membersA.some((m: any) => String(m.id) === String(empSeoA1.employee.id) && !m.is_leader) &&
      membersB.some((m: any) => String(m.id) === String(empLeaderB.employee.id) && m.is_leader) &&
      membersB.some((m: any) => String(m.id) === String(empSeoB1.employee.id) && !m.is_leader) &&
      summaryA.team.id === String(teamA.id) &&
      summaryB.team.id === String(teamB.id) &&
      summaryA.members.length === 2 &&
      summaryB.members.length === 2;

    assert(sf01Passed, 'SF-01: Team SEO A and Team SEO B memberships and workspaces are isolated and correct');

    // ----------------------------------------------------------------
    // SETUP PROJECTS, TASKS, ACCEPTANCE FOR SCOPING TESTS
    // ----------------------------------------------------------------
    let service = await db.selectFrom('services').selectAll().where('code', 'ilike', '%SEO%').executeTakeFirst();
    if (!service) {
      const [s] = await db
        .insertInto('services')
        .values({ name: 'SEO Master Service', code: `SRV-SEO-${runId}`, service_type: 'PROJECT', is_active: true } as any)
        .returningAll()
        .execute();
      service = s;
    }

    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const templateId = reqTemplate ? reqTemplate.id : 6;
    const templateVersion = reqTemplate ? reqTemplate.version : 1;

    const [accountA] = await db
      .insertInto('accounts')
      .values({ company_name: `SEO Corp A ${runId}` })
      .returningAll()
      .execute();

    const [accountB] = await db
      .insertInto('accounts')
      .values({ company_name: `SEO Corp B ${runId}` })
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({
        account_id: accountA.id,
        full_name: `SEO Client Contact ${runId}`,
        phone: '0911223355',
        email: `contact_seo_${runId}@corp.local`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [orderA] = await db
      .insertInto('orders')
      .values({
        account_id: accountA.id,
        primary_contact_id: contact.id,
        order_code: `ORD-SEO-A-${runId}`,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [orderB] = await db
      .insertInto('orders')
      .values({
        account_id: accountB.id,
        primary_contact_id: contact.id,
        order_code: `ORD-SEO-B-${runId}`,
        workflow_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [itemA] = await db
      .insertInto('order_items')
      .values({
        order_id: orderA.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId,
        requirement_template_version: templateVersion,
        original_price: 20000000,
        discount_amount: 0,
        net_service_value: 20000000,
        vat_amount: 2000000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'FULLY_PAID',
      })
      .returningAll()
      .execute();

    const [itemB] = await db
      .insertInto('order_items')
      .values({
        order_id: orderB.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId,
        requirement_template_version: templateVersion,
        original_price: 30000000,
        discount_amount: 0,
        net_service_value: 30000000,
        vat_amount: 3000000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'FULLY_PAID',
      })
      .returningAll()
      .execute();

    // Create Project A (Team A)
    const [projectA] = await db
      .insertInto('projects')
      .values({
        order_item_id: itemA.id,
        project_name: `Project SEO Team Alpha ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 50,
      })
      .returningAll()
      .execute();

    // Assign SEO A1 as PRIMARY to Project A
    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectA.id,
        employee_id: empSeoA1.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
      })
      .execute();

    // Create Project B (Team B)
    const [projectB] = await db
      .insertInto('projects')
      .values({
        order_item_id: itemB.id,
        project_name: `Project SEO Team Beta ${runId}`,
        status: 'READY_TO_START',
        materialized_progress_percent: 10,
      })
      .returningAll()
      .execute();

    // Assign SEO B1 as PRIMARY to Project B
    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectB.id,
        employee_id: empSeoB1.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
      })
      .execute();

    // ----------------------------------------------------------------
    // SF-02: Project list scoped (Leader A only sees Project A)
    // ----------------------------------------------------------------
    const projectsListA = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderA,
    );
    const projectsListB = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderB,
    );

    const projectIdsA = projectsListA.data.map((p: any) => String(p.id));
    const projectIdsB = projectsListB.data.map((p: any) => String(p.id));

    const sf02Passed =
      projectIdsA.includes(String(projectA.id)) &&
      !projectIdsA.includes(String(projectB.id)) &&
      projectIdsB.includes(String(projectB.id)) &&
      !projectIdsB.includes(String(projectA.id));

    assert(
      sf02Passed,
      'SF-02: Project list is strictly scoped to current SEO team members',
      `LeaderA saw ${projectIdsA}, expected only ${projectA.id}`,
    );

    // ----------------------------------------------------------------
    // SF-03: Project detail Team B => 403 Forbidden
    // ----------------------------------------------------------------
    let sf03Passed = false;
    try {
      // Leader A attempts to view Project B (belonging to Team B)
      await projectsController.findProjectById(String(projectB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        sf03Passed = true;
      }
    }

    // Leader A can view Project A
    const viewProjectA = await projectsController.findProjectById(String(projectA.id), userLeaderA);
    if (!viewProjectA || String(viewProjectA.id) !== String(projectA.id)) {
      sf03Passed = false;
    }

    assert(sf03Passed, 'SF-03: SEO Team Leader A accessing Project B returns 403 Forbidden');

    // ----------------------------------------------------------------
    // SF-04: Tasks list scoped
    // ----------------------------------------------------------------
    // Create Milestone for Project A and Project B
    const [milestoneA] = await db
      .insertInto('project_milestones')
      .values({
        project_id: projectA.id,
        title: `SEO Audit Milestone ${runId}`,
        weight: 50,
      })
      .returningAll()
      .execute();

    const [milestoneB] = await db
      .insertInto('project_milestones')
      .values({
        project_id: projectB.id,
        title: `SEO Onpage Milestone ${runId}`,
        weight: 50,
      })
      .returningAll()
      .execute();

    // Task in Project A assigned to SEO A1
    const [taskA] = await db
      .insertInto('project_tasks')
      .values({
        milestone_id: milestoneA.id,
        assigned_to_employee_id: empSeoA1.employee.id,
        title: `Audit Technical SEO ${runId}`,
        weight: 25,
        status: 'IN_PROGRESS',
      })
      .returningAll()
      .execute();

    // Task in Project B assigned to SEO B1
    const [taskB] = await db
      .insertInto('project_tasks')
      .values({
        milestone_id: milestoneB.id,
        assigned_to_employee_id: empSeoB1.employee.id,
        title: `Keyword Mapping Analysis ${runId}`,
        weight: 25,
        status: 'TODO',
      })
      .returningAll()
      .execute();

    const tasksListA = await projectsController.findTasks(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderA,
    );
    const tasksListB = await projectsController.findTasks(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderB,
    );

    const taskIdsA = tasksListA.data.map((t: any) => String(t.id));
    const taskIdsB = tasksListB.data.map((t: any) => String(t.id));

    const sf04Passed =
      taskIdsA.includes(String(taskA.id)) &&
      !taskIdsA.includes(String(taskB.id)) &&
      taskIdsB.includes(String(taskB.id)) &&
      !taskIdsB.includes(String(taskA.id));

    assert(sf04Passed, 'SF-04: Tasks list is strictly scoped to current SEO team members');

    // ----------------------------------------------------------------
    // SF-05: Task detail outside team => 403 Forbidden
    // ----------------------------------------------------------------
    let sf05Passed = false;
    try {
      await projectsController.findTaskById(String(taskB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        sf05Passed = true;
      }
    }

    const viewTaskA = await projectsController.findTaskById(String(taskA.id), userLeaderA);
    if (!viewTaskA || String(viewTaskA.id) !== String(taskA.id)) {
      sf05Passed = false;
    }

    assert(sf05Passed, 'SF-05: SEO Team Leader A accessing Task B returns 403 Forbidden');

    // ----------------------------------------------------------------
    // SF-06: Workload calculation verifies PRIMARY vs SUPPORT distinction
    // ----------------------------------------------------------------
    // Create a 2nd project for Team A where SEO A1 is SUPPORT
    const [itemA2] = await db
      .insertInto('order_items')
      .values({
        order_id: orderA.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId,
        requirement_template_version: templateVersion,
        original_price: 15000000,
        discount_amount: 0,
        net_service_value: 15000000,
        vat_amount: 1500000,
        approval_status: 'APPROVED',
        delivery_status: 'IN_PROGRESS',
        payment_status: 'FULLY_PAID',
      })
      .returningAll()
      .execute();

    const [projectA2] = await db
      .insertInto('projects')
      .values({
        order_item_id: itemA2.id,
        project_name: `Project SEO Support Alpha ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 30,
      })
      .returningAll()
      .execute();

    // Leader A is PRIMARY, SEO A1 is SUPPORT
    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectA2.id,
        employee_id: empLeaderA.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
      })
      .execute();

    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectA2.id,
        employee_id: empSeoA1.employee.id,
        assignment_type: 'SUPPORT',
        is_active: true,
      })
      .execute();

    const summaryWorkload = await teamsController.getSeoWorkspaceSummary(undefined, userLeaderA);
    const seoA1Workload = summaryWorkload.members.find(
      (m: any) => String(m.employeeId) === String(empSeoA1.employee.id),
    );

    const sf06Passed =
      seoA1Workload &&
      seoA1Workload.activePrimaryProjectsCount === 1 &&
      seoA1Workload.activeSupportProjectsCount === 1 &&
      seoA1Workload.totalActiveProjects === 2;

    assert(
      sf06Passed,
      'SF-06: Workload calculation separates PRIMARY vs SUPPORT assignments accurately',
      `Got primary=${seoA1Workload?.activePrimaryProjectsCount}, support=${seoA1Workload?.activeSupportProjectsCount}`,
    );

    // ----------------------------------------------------------------
    // SF-07: KPI scope: Leader A only views Team A member KPI
    // ----------------------------------------------------------------
    const targetPeriod = '2026-09';
    // Insert KPI events for SEO A1 and SEO B1
    const [policy] = await db
      .selectFrom('kpi_policies')
      .selectAll()
      .where('metric_type', '=', 'PROJECT_ACCEPTANCE')
      .execute();

    const policyId = policy ? policy.id : 1;

    await db
      .insertInto('kpi_events')
      .values({
        employee_id: empSeoA1.employee.id,
        policy_id: policyId,
        source_type: 'PROJECT_ACCEPTANCE',
        source_id: projectA.id,
        metric_type: 'PROJECT_ACCEPTANCE',
        metric_value: 1,
        kpi_points: 10,
        target_kpi_period: targetPeriod,
        qualified_at: new Date(),
      })
      .execute();

    await db
      .insertInto('kpi_events')
      .values({
        employee_id: empSeoB1.employee.id,
        policy_id: policyId,
        source_type: 'PROJECT_ACCEPTANCE',
        source_id: projectB.id,
        metric_type: 'PROJECT_ACCEPTANCE',
        metric_value: 1,
        kpi_points: 25,
        target_kpi_period: targetPeriod,
        qualified_at: new Date(),
      })
      .execute();

    // Leader A accesses SEO A1 KPI summary
    const kpiSummaryA1 = await kpiController.getEmployeeKpiSummary(
      String(empSeoA1.employee.id),
      targetPeriod,
      userLeaderA,
    );

    // Leader A accesses SEO B1 KPI summary => Must throw ForbiddenException (403)
    let sf07ForbiddenPassed = false;
    try {
      await kpiController.getEmployeeKpiSummary(
        String(empSeoB1.employee.id),
        targetPeriod,
        userLeaderA,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        sf07ForbiddenPassed = true;
      }
    }

    const sf07Passed =
      kpiSummaryA1 &&
      kpiSummaryA1.totalKpiPoints >= 10 &&
      sf07ForbiddenPassed;

    assert(sf07Passed, 'SF-07: SEO Team Leader A only views Team A member KPI; accessing Team B member KPI returns 403');

    // ----------------------------------------------------------------
    // SF-08: Blocked / Waiting work accurately aggregated with reasons
    // ----------------------------------------------------------------
    // Insert a BLOCKED task into Project A
    const [blockedTask] = await db
      .insertInto('project_tasks')
      .values({
        milestone_id: milestoneA.id,
        assigned_to_employee_id: empSeoA1.employee.id,
        title: `SEO Speed Optimization ${runId}`,
        weight: 25,
        status: 'BLOCKED',
        blocked_reason: 'Chờ khách hàng bàn giao hosting và quyền DNS',
        blocked_since: new Date(),
      })
      .returningAll()
      .execute();

    const summaryBlocked = await teamsController.getSeoWorkspaceSummary(undefined, userLeaderA);
    const sf08Passed =
      summaryBlocked.tasksSummary.blocked >= 1 &&
      summaryBlocked.metrics.activeProjectsCount >= 1;

    assert(sf08Passed, 'SF-08: Blocked / Waiting work accurately aggregated in SEO workspace summary');

    // ----------------------------------------------------------------
    // SF-09: Temporal member movement updates active scope
    // ----------------------------------------------------------------
    // Transfer SEO A1 from Team A to Team B
    await teamsService.moveMember(
      teamA.id,
      {
        targetTeamId: String(teamB.id),
        employeeId: String(empSeoA1.employee.id),
      },
      actorId,
    );

    const membersAfterMoveA = await teamsService.getCurrentTeamMembers(teamA.id);
    const membersAfterMoveB = await teamsService.getCurrentTeamMembers(teamB.id);

    const a1InTeamA = membersAfterMoveA.some((m: any) => String(m.id) === String(empSeoA1.employee.id));
    const a1InTeamB = membersAfterMoveB.some((m: any) => String(m.id) === String(empSeoA1.employee.id));

    // After move: Leader A cannot view SEO A1 KPI anymore
    let leaderACannotViewA1Kpi = false;
    try {
      await kpiController.getEmployeeKpiSummary(
        String(empSeoA1.employee.id),
        targetPeriod,
        userLeaderA,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        leaderACannotViewA1Kpi = true;
      }
    }

    // Leader B can now view SEO A1 KPI
    const leaderBCanViewA1Kpi = await kpiController.getEmployeeKpiSummary(
      String(empSeoA1.employee.id),
      targetPeriod,
      userLeaderB,
    );

    const sf09Passed =
      !a1InTeamA &&
      a1InTeamB &&
      leaderACannotViewA1Kpi &&
      Boolean(leaderBCanViewA1Kpi);

    assert(
      sf09Passed,
      'SF-09: Temporal movement of SEO member from Team A to Team B dynamically updates access scope',
    );

    // ----------------------------------------------------------------
    // SF-10: ADMIN / BOSS global view
    // ----------------------------------------------------------------
    const adminSummary = await teamsController.getSeoWorkspaceSummary(undefined, userAdmin);
    const adminProjects = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userAdmin,
    );

    const adminProjectA = await projectsController.findProjectById(String(projectA.id), userAdmin);
    const adminProjectB = await projectsController.findProjectById(String(projectB.id), userAdmin);
    const adminTaskB = await projectsController.findTaskById(String(taskB.id), userAdmin);

    const sf10Passed =
      adminSummary &&
      adminSummary.team.department === 'SEO' &&
      adminProjects.data.length >= 2 &&
      adminProjectA.id === projectA.id &&
      adminProjectB.id === projectB.id &&
      adminTaskB.id === taskB.id;

    assert(sf10Passed, 'SF-10: ADMIN / BOSS has global access across all SEO teams, projects, and tasks');
  } catch (error: any) {
    console.error('Fatal error in Phase G test suite:', error);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('====================================================');
  console.log(`PHASE G SEO TEAM LEADER SUITE FINISHED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhaseGSeoLeaderIntegrationSuite();
}
