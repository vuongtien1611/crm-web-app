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

async function runPhaseFDevLeaderIntegrationSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE F: DEV TEAM LEADER WORKSPACE SUITE');
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
    // SETUP: Create 2 DEV Teams (Team Alpha & Team Beta)
    // ----------------------------------------------------------------
    const teamA = await teamsService.createTeam(
      {
        name: `Alpha Dev Team ${runId}`,
        code: `DEV-ALPHA-${runId}`,
        department: TeamDepartment.DEV,
        description: 'Team Alpha for Phase F isolation verification',
      },
      actorId,
    );

    const teamB = await teamsService.createTeam(
      {
        name: `Beta Dev Team ${runId}`,
        code: `DEV-BETA-${runId}`,
        department: TeamDepartment.DEV,
        description: 'Team Beta for Phase F isolation verification',
      },
      actorId,
    );

    // Create Employees
    // Leader A
    const empLeaderA = await employeesService.createEmployeeAccount(
      {
        username: `dev_leaderA_${runId}`,
        email: `dev_leaderA_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Leader Alpha ${runId}`,
        phone: '0902000001',
        hireDate: '2026-09-01',
        positionCode: 'DEV_TEAM_LEADER',
        roleCode: 'DEV_TEAM_LEADER',
        department: 'DEV',
      },
      actorId,
    );

    // Dev A1
    const empDevA1 = await employeesService.createEmployeeAccount(
      {
        username: `devA1_${runId}`,
        email: `devA1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Alpha One ${runId}`,
        phone: '0902000002',
        hireDate: '2026-09-01',
        positionCode: 'DEV',
        roleCode: 'DEV',
        department: 'DEV',
      },
      actorId,
    );

    // Leader B
    const empLeaderB = await employeesService.createEmployeeAccount(
      {
        username: `dev_leaderB_${runId}`,
        email: `dev_leaderB_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Leader Beta ${runId}`,
        phone: '0902000003',
        hireDate: '2026-09-01',
        positionCode: 'DEV_TEAM_LEADER',
        roleCode: 'DEV_TEAM_LEADER',
        department: 'DEV',
      },
      actorId,
    );

    // Dev B1
    const empDevB1 = await employeesService.createEmployeeAccount(
      {
        username: `devB1_${runId}`,
        email: `devB1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Beta One ${runId}`,
        phone: '0902000004',
        hireDate: '2026-09-01',
        positionCode: 'DEV',
        roleCode: 'DEV',
        department: 'DEV',
      },
      actorId,
    );

    // Assign memberships
    // Team A: Leader A + Dev A1
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empLeaderA.employee.id), isLeader: true },
      actorId,
    );
    await teamsService.assignMember(
      teamA.id,
      { employeeId: String(empDevA1.employee.id), isLeader: false },
      actorId,
    );

    // Team B: Leader B + Dev B1
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empLeaderB.employee.id), isLeader: true },
      actorId,
    );
    await teamsService.assignMember(
      teamB.id,
      { employeeId: String(empDevB1.employee.id), isLeader: false },
      actorId,
    );

    // Setup Mock JWT Payloads
    const userLeaderA: any = {
      sub: String(empLeaderA.user.id),
      employeeId: String(empLeaderA.employee.id),
      roles: ['DEV_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ', 'KPI_READ'],
    };

    const userLeaderB: any = {
      sub: String(empLeaderB.user.id),
      employeeId: String(empLeaderB.employee.id),
      roles: ['DEV_TEAM_LEADER'],
      permissions: ['PROJECT_READ', 'TEAM_READ', 'KPI_READ'],
    };

    const userAdmin: any = {
      sub: 'admin-sub',
      employeeId: actorId,
      roles: ['ADMIN'],
      permissions: ['PROJECT_VIEW_ALL', 'TEAM_READ', 'KPI_READ'],
    };

    // ----------------------------------------------------------------
    // DF-01: Team A / Team B độc lập
    // ----------------------------------------------------------------
    const membersA = await teamsService.getCurrentTeamMembers(teamA.id);
    const membersB = await teamsService.getCurrentTeamMembers(teamB.id);

    const df01Passed =
      membersA.length === 2 &&
      membersB.length === 2 &&
      membersA.some((m: any) => String(m.id) === String(empLeaderA.employee.id) && m.is_leader) &&
      membersA.some((m: any) => String(m.id) === String(empDevA1.employee.id) && !m.is_leader) &&
      membersB.some((m: any) => String(m.id) === String(empLeaderB.employee.id) && m.is_leader) &&
      membersB.some((m: any) => String(m.id) === String(empDevB1.employee.id) && !m.is_leader);

    assert(df01Passed, 'DF-01: Team Dev A and Team Dev B memberships are isolated and correct');

    // ----------------------------------------------------------------
    // SETUP PROJECTS, TASKS, ACCEPTANCE FOR SCOPING TESTS
    // ----------------------------------------------------------------
    // Setup Account & Services
    let service = await db.selectFrom('services').selectAll().executeTakeFirst();
    if (!service) {
      const [s] = await db
        .insertInto('services')
        .values({ name: 'Web Dev Service', code: `SRV-${runId}`, department: 'DEV', is_active: true } as any)
        .returningAll()
        .execute();
      service = s;
    }

    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const templateId = reqTemplate ? reqTemplate.id : 6;
    const templateVersion = reqTemplate ? reqTemplate.version : 1;

    const [accountA] = await db
      .insertInto('accounts')
      .values({ company_name: `Dev Corp A ${runId}` })
      .returningAll()
      .execute();

    const [accountB] = await db
      .insertInto('accounts')
      .values({ company_name: `Dev Corp B ${runId}` })
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({
        account_id: accountA.id,
        full_name: `Dev Client Contact ${runId}`,
        phone: '0911223344',
        email: `contact_${runId}@corp.local`,
        is_primary: true,
      })
      .returningAll()
      .execute();

    const [orderA] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-DEV-A-${runId}`,
        account_id: accountA.id,
        workflow_status: 'APPROVED',
      } as any)
      .returningAll()
      .execute();

    const [orderItemA] = await db
      .insertInto('order_items')
      .values({
        order_id: orderA.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 50000000 as any,
        approval_status: 'APPROVED',
        delivery_status: 'READY_FOR_ASSIGNMENT',
        net_service_value: 50000000,
      } as any)
      .returningAll()
      .execute();

    const [projectA] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItemA.id,
        project_name: `Project Alpha ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 40,
      })
      .returningAll()
      .execute();

    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectA.id,
        employee_id: empDevA1.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
        assigned_at: new Date(),
      })
      .execute();

    // Order & Project B
    const [orderB] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-DEV-B-${runId}`,
        account_id: accountB.id,
        workflow_status: 'APPROVED',
      } as any)
      .returningAll()
      .execute();

    const [orderItemB] = await db
      .insertInto('order_items')
      .values({
        order_id: orderB.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 70000000 as any,
        approval_status: 'APPROVED',
        delivery_status: 'READY_FOR_ASSIGNMENT',
        net_service_value: 70000000,
      } as any)
      .returningAll()
      .execute();

    const [projectB] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItemB.id,
        project_name: `Project Beta ${runId}`,
        status: 'READY_TO_START',
        materialized_progress_percent: 10,
      })
      .returningAll()
      .execute();

    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectB.id,
        employee_id: empDevB1.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
        assigned_at: new Date(),
      })
      .execute();

    // ----------------------------------------------------------------
    // DF-02: Project list scoped
    // ----------------------------------------------------------------
    const listLeaderA = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderA,
    );
    const listLeaderB = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderB,
    );

    const leaderASeesProjA = listLeaderA.data.some((p: any) => String(p.id) === String(projectA.id));
    const leaderASeesProjB = listLeaderA.data.some((p: any) => String(p.id) === String(projectB.id));
    const leaderBSeesProjB = listLeaderB.data.some((p: any) => String(p.id) === String(projectB.id));
    const leaderBSeesProjA = listLeaderB.data.some((p: any) => String(p.id) === String(projectA.id));

    const df02Passed = leaderASeesProjA && !leaderASeesProjB && leaderBSeesProjB && !leaderBSeesProjA;
    assert(
      df02Passed,
      'DF-02: Project list is strictly scoped to current dev team members',
      `LeaderA: ProjA=${leaderASeesProjA}, ProjB=${leaderASeesProjB}; LeaderB: ProjB=${leaderBSeesProjB}, ProjA=${leaderBSeesProjA}`,
    );

    // ----------------------------------------------------------------
    // DF-03: Project detail Team B => 403
    // ----------------------------------------------------------------
    let df03Blocked = false;
    try {
      await projectsController.findProjectById(String(projectB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        df03Blocked = true;
      }
    }

    let df03OwnAllowed = false;
    try {
      const ownProj = await projectsController.findProjectById(String(projectA.id), userLeaderA);
      if (ownProj && String(ownProj.id) === String(projectA.id)) {
        df03OwnAllowed = true;
      }
    } catch (e) {
      df03OwnAllowed = false;
    }

    assert(
      df03Blocked && df03OwnAllowed,
      'DF-03: Dev Team Leader accessing Project of other team returns 403 Forbidden',
      `blocked=${df03Blocked}, ownAllowed=${df03OwnAllowed}`,
    );

    // ----------------------------------------------------------------
    // DF-04 & DF-05: Task list scoped & Task detail Team B => 403
    // ----------------------------------------------------------------
    // Create Milestones and Tasks
    const [milestoneA] = await db
      .insertInto('project_milestones')
      .values({
        project_id: projectA.id,
        title: 'Alpha Milestone 1',
        weight: 100,
        sort_order: 1,
      })
      .returningAll()
      .execute();

    const [taskA] = await db
      .insertInto('project_tasks')
      .values({
        milestone_id: milestoneA.id,
        assigned_to_employee_id: empDevA1.employee.id,
        title: `Task Alpha ${runId}`,
        weight: 50,
        status: 'IN_PROGRESS',
      })
      .returningAll()
      .execute();

    const [milestoneB] = await db
      .insertInto('project_milestones')
      .values({
        project_id: projectB.id,
        title: 'Beta Milestone 1',
        weight: 100,
        sort_order: 1,
      })
      .returningAll()
      .execute();

    const [taskB] = await db
      .insertInto('project_tasks')
      .values({
        milestone_id: milestoneB.id,
        assigned_to_employee_id: empDevB1.employee.id,
        title: `Task Beta ${runId}`,
        weight: 50,
        status: 'TODO',
      })
      .returningAll()
      .execute();

    // DF-04: Task list scoped
    const tasksLeaderA = await projectsController.findTasks(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderA,
    );
    const leaderASeesTaskA = tasksLeaderA.data.some((t: any) => String(t.id) === String(taskA.id));
    const leaderASeesTaskB = tasksLeaderA.data.some((t: any) => String(t.id) === String(taskB.id));

    assert(
      leaderASeesTaskA && !leaderASeesTaskB,
      'DF-04: Task list is strictly scoped to current dev team members',
      `LeaderA sees: TaskA=${leaderASeesTaskA}, TaskB=${leaderASeesTaskB}`,
    );

    // DF-05: Task detail Team B => 403
    let df05Blocked = false;
    try {
      await projectsController.findTaskById(String(taskB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        df05Blocked = true;
      }
    }

    let df05OwnAllowed = false;
    try {
      const ownTask = await projectsController.findTaskById(String(taskA.id), userLeaderA);
      if (ownTask && String(ownTask.id) === String(taskA.id)) {
        df05OwnAllowed = true;
      }
    } catch (e) {
      df05OwnAllowed = false;
    }

    assert(
      df05Blocked && df05OwnAllowed,
      'DF-05: Dev Team Leader accessing Task of other team returns 403 Forbidden',
      `blocked=${df05Blocked}, ownAllowed=${df05OwnAllowed}`,
    );

    // ----------------------------------------------------------------
    // DF-06: Acceptance scoped (guess acceptance ID => 403)
    // ----------------------------------------------------------------
    const [acceptanceB] = await db
      .insertInto('project_acceptances')
      .values({
        project_id: projectB.id,
        customer_contact_id: contact.id,
        accepted_by_name: 'Customer Beta Signer',
        accepted_at: new Date(),
        evidence_document: 'https://docs.local/acceptance-b.pdf',
        recorded_by_employee_id: empDevB1.employee.id,
      })
      .returningAll()
      .execute();

    let df06Blocked = false;
    try {
      await projectsController.findAcceptanceById(String(acceptanceB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        df06Blocked = true;
      }
    }

    let df06ByProjectBlocked = false;
    try {
      await projectsController.findAcceptanceByProjectId(String(projectB.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        df06ByProjectBlocked = true;
      }
    }

    let df06AllowedForB = false;
    try {
      const acc = await projectsController.findAcceptanceById(String(acceptanceB.id), userLeaderB);
      if (acc && String(acc.id) === String(acceptanceB.id)) {
        df06AllowedForB = true;
      }
    } catch (e) {
      df06AllowedForB = false;
    }

    assert(
      df06Blocked && df06ByProjectBlocked && df06AllowedForB,
      'DF-06: Acceptance details of other team return 403 Forbidden',
      `blockedById=${df06Blocked}, blockedByProj=${df06ByProjectBlocked}, allowedLeaderB=${df06AllowedForB}`,
    );

    // ----------------------------------------------------------------
    // DF-07: KPI scoped (Leader A cannot see KPI of Dev B1 => 403)
    // ----------------------------------------------------------------
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let policy = await db.selectFrom('kpi_policies').selectAll().executeTakeFirst();
    if (!policy) {
      const [p] = await db
        .insertInto('kpi_policies')
        .values({
          policy_name: 'Dev Completion Policy',
          department: 'DEV',
          is_active: true,
        } as any)
        .returningAll()
        .execute();
      policy = p;
    }

    await db
      .insertInto('kpi_events')
      .values({
        employee_id: empDevA1.employee.id,
        policy_id: policy.id,
        source_type: 'PROJECT_ACCEPTANCE' as any,
        source_id: projectA.id,
        metric_type: 'KPI_POINTS',
        metric_value: 20,
        kpi_points: 20,
        eligible_revenue: 50000000,
        target_kpi_period: currentPeriod,
        qualified_at: new Date(),
      })
      .execute();

    await db
      .insertInto('kpi_events')
      .values({
        employee_id: empDevB1.employee.id,
        policy_id: policy.id,
        source_type: 'PROJECT_ACCEPTANCE' as any,
        source_id: projectB.id,
        metric_type: 'KPI_POINTS',
        metric_value: 30,
        kpi_points: 30,
        eligible_revenue: 70000000,
        target_kpi_period: currentPeriod,
        qualified_at: new Date(),
      })
      .execute();

    let df07Blocked = false;
    try {
      await kpiController.getEmployeeKpiSummary(
        String(empDevB1.employee.id),
        currentPeriod,
        userLeaderA,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        df07Blocked = true;
      }
    }

    let df07OwnAllowed = false;
    try {
      const ownKpi = await kpiController.getEmployeeKpiSummary(
        String(empDevA1.employee.id),
        currentPeriod,
        userLeaderA,
      );
      if (ownKpi && ownKpi.employeeId) {
        df07OwnAllowed = true;
      }
    } catch (e) {
      df07OwnAllowed = false;
    }

    assert(
      df07Blocked && df07OwnAllowed,
      'DF-07: Dev Team Leader accessing KPI of member in other team returns 403 Forbidden',
      `blockedDevB=${df07Blocked}, allowedDevA=${df07OwnAllowed}`,
    );

    // ----------------------------------------------------------------
    // DF-08: Workload based on current real assignments (PRIMARY vs SUPPORT)
    // ----------------------------------------------------------------
    const [accountA2] = await db
      .insertInto('accounts')
      .values({ company_name: `Dev Corp A2 ${runId}` })
      .returningAll()
      .execute();

    const [accountAC] = await db
      .insertInto('accounts')
      .values({ company_name: `Dev Corp AC ${runId}` })
      .returningAll()
      .execute();

    // Create Project A2 and assign Dev A1 as SUPPORT
    const [orderA2] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-DEV-A2-${runId}`,
        account_id: accountA2.id,
        workflow_status: 'APPROVED',
      } as any)
      .returningAll()
      .execute();

    const [orderItemA2] = await db
      .insertInto('order_items')
      .values({
        order_id: orderA2.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 30000000 as any,
        approval_status: 'APPROVED',
        delivery_status: 'READY_FOR_ASSIGNMENT',
        net_service_value: 30000000,
      } as any)
      .returningAll()
      .execute();

    const [projectA2] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItemA2.id,
        project_name: `Project Alpha 2 ${runId}`,
        status: 'IN_PROGRESS',
        materialized_progress_percent: 20,
      })
      .returningAll()
      .execute();

    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectA2.id,
        employee_id: empDevA1.employee.id,
        assignment_type: 'SUPPORT',
        is_active: true,
        assigned_at: new Date(),
      })
      .execute();

    // Create a COMPLETED project to ensure it is not counted in active workload
    const [orderACompleted] = await db
      .insertInto('orders')
      .values({
        order_code: `ORD-DEV-AC-${runId}`,
        account_id: accountAC.id,
        workflow_status: 'APPROVED',
      } as any)
      .returningAll()
      .execute();

    const [orderItemACompleted] = await db
      .insertInto('order_items')
      .values({
        order_id: orderACompleted.id,
        service_id: service.id,
        closing_sale_id: actorId as any,
        requirement_template_id: templateId as any,
        requirement_template_version: templateVersion as any,
        original_price: 20000000 as any,
        approval_status: 'APPROVED',
        delivery_status: 'READY_FOR_ASSIGNMENT',
        net_service_value: 20000000,
      } as any)
      .returningAll()
      .execute();

    const [projectACompleted] = await db
      .insertInto('projects')
      .values({
        order_item_id: orderItemACompleted.id,
        project_name: `Project Alpha Completed ${runId}`,
        status: 'COMPLETED',
        materialized_progress_percent: 100,
      })
      .returningAll()
      .execute();

    await db
      .insertInto('project_assignments')
      .values({
        project_id: projectACompleted.id,
        employee_id: empDevA1.employee.id,
        assignment_type: 'PRIMARY',
        is_active: true,
        assigned_at: new Date(),
      })
      .execute();

    // Query Dev Workspace Summary for Leader A
    const workspaceSummaryA = await teamsController.getDevWorkspaceSummary(
      currentPeriod,
      userLeaderA,
    );

    const devA1Summary = workspaceSummaryA.members.find(
      (m: any) => String(m.employeeId) === String(empDevA1.employee.id),
    );

    const df08Passed =
      Boolean(devA1Summary) &&
      devA1Summary.activePrimaryProjectsCount === 1 && // projectA only (projectACompleted excluded)
      devA1Summary.activeSupportProjectsCount === 1 && // projectA2
      devA1Summary.totalActiveProjects === 2 &&
      workspaceSummaryA.metrics.activeProjectsCount >= 2;

    assert(
      df08Passed,
      'DF-08: Workload accurately counts active PRIMARY vs SUPPORT assignments (completed excluded)',
      `primary=${devA1Summary?.activePrimaryProjectsCount}, support=${devA1Summary?.activeSupportProjectsCount}, totalActive=${devA1Summary?.totalActiveProjects}`,
    );

    // ----------------------------------------------------------------
    // DF-09: Move Dev A1 → Team B updates scope according to current membership
    // ----------------------------------------------------------------
    // Move Dev A1 from Team A to Team B
    await teamsService.moveMember(
      teamA.id,
      { employeeId: String(empDevA1.employee.id), targetTeamId: String(teamB.id) },
      actorId,
    );

    // Leader A no longer sees Project A because Dev A1 has moved out
    const listLeaderAAfterMove = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderA,
    );
    const leaderASeesProjAAfter = listLeaderAAfterMove.data.some(
      (p: any) => String(p.id) === String(projectA.id),
    );

    let leaderABlockedDetailAfter = false;
    try {
      await projectsController.findProjectById(String(projectA.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) {
        leaderABlockedDetailAfter = true;
      }
    }

    // Leader B now sees Project A and Project B
    const listLeaderBAfterMove = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userLeaderB,
    );
    const leaderBSeesProjAAfter = listLeaderBAfterMove.data.some(
      (p: any) => String(p.id) === String(projectA.id),
    );
    const leaderBSeesProjBAfter = listLeaderBAfterMove.data.some(
      (p: any) => String(p.id) === String(projectB.id),
    );

    const df09Passed =
      !leaderASeesProjAAfter &&
      leaderABlockedDetailAfter &&
      leaderBSeesProjAAfter &&
      leaderBSeesProjBAfter;

    assert(
      df09Passed,
      'DF-09: Moving Dev A1 to Team B immediately transfers project scope according to temporal membership',
      `LeaderA sees ProjA=${leaderASeesProjAAfter}, LeaderA blocked detail=${leaderABlockedDetailAfter}; LeaderB sees ProjA=${leaderBSeesProjAAfter}, ProjB=${leaderBSeesProjBAfter}`,
    );

    // ----------------------------------------------------------------
    // DF-10: ADMIN/BOSS retains global access
    // ----------------------------------------------------------------
    const adminProjects = await projectsController.findProjects(
      undefined,
      undefined,
      undefined,
      undefined,
      userAdmin,
    );
    const adminSeesProjA = adminProjects.data.some((p: any) => String(p.id) === String(projectA.id));
    const adminSeesProjB = adminProjects.data.some((p: any) => String(p.id) === String(projectB.id));

    const adminProjDetail = await projectsController.findProjectById(String(projectB.id), userAdmin);
    const adminTaskDetail = await projectsController.findTaskById(String(taskB.id), userAdmin);
    const adminAccDetail = await projectsController.findAcceptanceById(String(acceptanceB.id), userAdmin);
    const adminKpiDetail = await kpiController.getEmployeeKpiSummary(
      String(empDevB1.employee.id),
      currentPeriod,
      userAdmin as any,
    );

    const df10Passed =
      adminSeesProjA &&
      adminSeesProjB &&
      Boolean(adminProjDetail) &&
      Boolean(adminTaskDetail) &&
      Boolean(adminAccDetail) &&
      Boolean(adminKpiDetail);

    assert(
      df10Passed,
      'DF-10: ADMIN/BOSS retains full global access across all projects, tasks, acceptances, and KPIs',
      `adminSeesA=${adminSeesProjA}, adminSeesB=${adminSeesProjB}`,
    );
  } catch (error: any) {
    console.error('💥 Unexpected exception in Phase F suite:', error);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('====================================================');
  console.log(`PHASE F SUITE RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhaseFDevLeaderIntegrationSuite();
