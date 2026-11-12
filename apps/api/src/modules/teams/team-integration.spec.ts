import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { EmployeesService } from '../employees/employees.service';
import { KyselyService } from '../../database/kysely.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'kysely';
import { TeamDepartment } from './dto/create-team.dto';

async function runTeamIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING PHASE D TEAM MANAGEMENT INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const teamsService = app.get(TeamsService);
  const teamsController = app.get(TeamsController);
  const employeesService = app.get(EmployeesService);
  const kyselyService = app.get(KyselyService);
  const reflector = app.get(Reflector);
  const permissionsGuard = new PermissionsGuard(reflector);
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

  // Get admin employee for actorEmployeeId (or fallback to any existing / fixture employee on clean DB)
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
    // TEAM-01: Create SALES team explicit department.
    // ----------------------------------------------------------------
    const teamSales = await teamsService.createTeam(
      {
        name: `Sales Team A ${runId}`,
        code: `TEAM-SALES-${runId}`,
        department: TeamDepartment.SALES,
        description: 'Primary Sales Team for testing',
      },
      actorId,
    );
    assert(
      teamSales && teamSales.department === 'SALES' && teamSales.code === `TEAM-SALES-${runId}`,
      'TEAM-01: Create SALES team with explicit department',
    );

    // ----------------------------------------------------------------
    // TEAM-02: Create DEV team.
    // ----------------------------------------------------------------
    const teamDev = await teamsService.createTeam(
      {
        name: `Dev Core Team ${runId}`,
        code: `TEAM-DEV-${runId}`,
        department: TeamDepartment.DEV,
        description: 'Development Core Team',
      },
      actorId,
    );
    assert(
      teamDev && teamDev.department === 'DEV' && teamDev.code === `TEAM-DEV-${runId}`,
      'TEAM-02: Create DEV team with explicit department',
    );

    // ----------------------------------------------------------------
    // TEAM-03: Create SEO team.
    // ----------------------------------------------------------------
    const teamSeo = await teamsService.createTeam(
      {
        name: `SEO Growth Team ${runId}`,
        code: `TEAM-SEO-${runId}`,
        department: TeamDepartment.SEO,
        description: 'SEO and Content Growth Team',
      },
      actorId,
    );
    assert(
      teamSeo && teamSeo.department === 'SEO' && teamSeo.code === `TEAM-SEO-${runId}`,
      'TEAM-03: Create SEO team with explicit department',
    );

    // Second sales team for move testing
    const teamSales2 = await teamsService.createTeam(
      {
        name: `Sales Team B ${runId}`,
        code: `TEAM-SALES2-${runId}`,
        department: TeamDepartment.SALES,
        description: 'Secondary Sales Team for move tests',
      },
      actorId,
    );

    // Create test employees for our tests
    // 1. Sales rep 1
    const empSale1 = await employeesService.createEmployeeAccount(
      {
        username: `sale1_${runId}`,
        email: `sale1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Sale Rep 1 ${runId}`,
        phone: '0911000001',
        hireDate: '2026-09-01',
        positionCode: 'SALE',
        roleCode: 'SALE',
        department: 'SALES',
      },
      actorId,
    );

    // 2. Dev 1
    const empDev1 = await employeesService.createEmployeeAccount(
      {
        username: `dev1_${runId}`,
        email: `dev1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Engineer 1 ${runId}`,
        phone: '0911000002',
        hireDate: '2026-09-01',
        positionCode: 'DEV',
        roleCode: 'DEV',
        department: 'DEV',
      },
      actorId,
    );

    // 3. SEO 1
    const empSeo1 = await employeesService.createEmployeeAccount(
      {
        username: `seo1_${runId}`,
        email: `seo1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Specialist 1 ${runId}`,
        phone: '0911000003',
        hireDate: '2026-09-01',
        positionCode: 'SEO',
        roleCode: 'SEO',
        department: 'SEO',
      },
      actorId,
    );

    // 4. Sales Leader candidate 1
    const empSaleLeader1 = await employeesService.createEmployeeAccount(
      {
        username: `salelead1_${runId}`,
        email: `salelead1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Sale Leader 1 ${runId}`,
        phone: '0911000004',
        hireDate: '2026-09-01',
        positionCode: 'SALES_TEAM_LEADER',
        roleCode: 'SALES_TEAM_LEADER',
        department: 'SALES',
      },
      actorId,
    );

    // 5. Sales Leader candidate 2 (for replacement)
    const empSaleLeader2 = await employeesService.createEmployeeAccount(
      {
        username: `salelead2_${runId}`,
        email: `salelead2_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Sale Leader 2 ${runId}`,
        phone: '0911000005',
        hireDate: '2026-09-01',
        positionCode: 'SALES_TEAM_LEADER',
        roleCode: 'SALES_TEAM_LEADER',
        department: 'SALES',
      },
      actorId,
    );

    // 6. Dev Leader candidate
    const empDevLeader1 = await employeesService.createEmployeeAccount(
      {
        username: `devlead1_${runId}`,
        email: `devlead1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `Dev Leader 1 ${runId}`,
        phone: '0911000006',
        hireDate: '2026-09-01',
        positionCode: 'DEV_TEAM_LEADER',
        roleCode: 'DEV_TEAM_LEADER',
        department: 'DEV',
      },
      actorId,
    );

    // 7. SEO Leader candidate
    const empSeoLeader1 = await employeesService.createEmployeeAccount(
      {
        username: `seolead1_${runId}`,
        email: `seolead1_${runId}@crm.local`,
        password: 'Password123!@#',
        fullName: `SEO Leader 1 ${runId}`,
        phone: '0911000007',
        hireDate: '2026-09-01',
        positionCode: 'SEO_TEAM_LEADER',
        roleCode: 'SEO_TEAM_LEADER',
        department: 'SEO',
      },
      actorId,
    );

    // ----------------------------------------------------------------
    // TEAM-04: Assign compatible employee.
    // ----------------------------------------------------------------
    const assignRes1 = await teamsService.assignMember(
      teamSales.id,
      { employeeId: empSale1.employee.id },
      actorId,
    );
    assert(
      assignRes1 && assignRes1.teamId === String(teamSales.id) && assignRes1.isLeader === false,
      'TEAM-04: Assign compatible employee to team',
    );

    // ----------------------------------------------------------------
    // TEAM-05: Reject incompatible department member.
    // ----------------------------------------------------------------
    let rejectedIncompatible = false;
    try {
      // Trying to assign Dev engineer to Sales team
      await teamsService.assignMember(
        teamSales.id,
        { employeeId: empDev1.employee.id },
        actorId,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && (err.message.includes('không thuộc phòng ban') || err.message.includes('not compatible'))) {
        rejectedIncompatible = true;
      }
    }
    assert(
      rejectedIncompatible,
      'TEAM-05: Reject incompatible department member assignment',
    );

    // ----------------------------------------------------------------
    // TEAM-06: Move employee preserves old membership history.
    // ----------------------------------------------------------------
    // Move empSale1 from teamSales to teamSales2
    const moveRes = await teamsService.moveMember(
      teamSales.id,
      {
        employeeId: empSale1.employee.id,
        targetTeamId: teamSales2.id,
      },
      actorId,
    );
    assert(
      moveRes && moveRes.targetTeamId === String(teamSales2.id),
      'TEAM-06.1: Move employee to second team successfully',
    );

    // Check history of empSale1
    const emp1Detail = await employeesService.getEmployeeById(empSale1.employee.id);
    const history1 = emp1Detail.teamHistory || [];
    assert(
      history1.length === 2 &&
        history1.some((h: any) => h.teamId === String(teamSales.id) && !h.isCurrent && h.effectiveTo !== null) &&
        history1.some((h: any) => h.teamId === String(teamSales2.id) && h.isCurrent && h.effectiveTo === null),
      'TEAM-06.2: Temporal history preserved for moved employee (old closed, new active)',
    );

    // ----------------------------------------------------------------
    // TEAM-07: Employee has exactly one active membership.
    // ----------------------------------------------------------------
    const activeMemberships = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empSale1.employee.id as any)
      .where(sql`effective_range @> NOW()` as any)
      .execute();
    assert(
      activeMemberships.length === 1 && String(activeMemberships[0].team_id) === String(teamSales2.id),
      'TEAM-07: Employee has exactly one active membership at any time',
    );

    // ----------------------------------------------------------------
    // TEAM-08: Assign SALES_TEAM_LEADER to SALES team.
    // ----------------------------------------------------------------
    // First assign as member or directly via changeLeader
    const assignLeaderSales = await teamsService.changeLeader(
      teamSales.id,
      { newLeaderEmployeeId: empSaleLeader1.employee.id },
      actorId,
    );
    assert(
      assignLeaderSales && assignLeaderSales.newLeaderEmployeeId === String(empSaleLeader1.employee.id),
      'TEAM-08: Assign SALES_TEAM_LEADER to SALES team',
    );

    // ----------------------------------------------------------------
    // TEAM-09: Assign DEV_TEAM_LEADER to DEV team.
    // ----------------------------------------------------------------
    const assignLeaderDev = await teamsService.changeLeader(
      teamDev.id,
      { newLeaderEmployeeId: empDevLeader1.employee.id },
      actorId,
    );
    assert(
      assignLeaderDev && assignLeaderDev.newLeaderEmployeeId === String(empDevLeader1.employee.id),
      'TEAM-09: Assign DEV_TEAM_LEADER to DEV team',
    );

    // ----------------------------------------------------------------
    // TEAM-10: Assign SEO_TEAM_LEADER to SEO team.
    // ----------------------------------------------------------------
    const assignLeaderSeo = await teamsService.changeLeader(
      teamSeo.id,
      { newLeaderEmployeeId: empSeoLeader1.employee.id },
      actorId,
    );
    assert(
      assignLeaderSeo && assignLeaderSeo.newLeaderEmployeeId === String(empSeoLeader1.employee.id),
      'TEAM-10: Assign SEO_TEAM_LEADER to SEO team',
    );

    // ----------------------------------------------------------------
    // TEAM-11: Reject normal employee as leader.
    // ----------------------------------------------------------------
    let rejectNormalLeader = false;
    try {
      // Trying to make normal SALE rep into a Leader
      await teamsService.changeLeader(
        teamSales2.id,
        { newLeaderEmployeeId: empSale1.employee.id },
        actorId,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && (err.message.includes('SALES_TEAM_LEADER') || err.message.includes('Position SALE cannot be appointed'))) {
        rejectNormalLeader = true;
      }
    }
    assert(
      rejectNormalLeader,
      'TEAM-11: Reject normal employee (SALE) as leader',
    );

    // ----------------------------------------------------------------
    // TEAM-12: Change leader closes old leader history.
    // ----------------------------------------------------------------
    // Replace empSaleLeader1 with empSaleLeader2 on teamSales
    const replaceLeaderRes = await teamsService.changeLeader(
      teamSales.id,
      { newLeaderEmployeeId: empSaleLeader2.employee.id },
      actorId,
    );
    assert(
      replaceLeaderRes && replaceLeaderRes.newLeaderEmployeeId === String(empSaleLeader2.employee.id),
      'TEAM-12.1: Replace team leader with new leader candidate',
    );

    // Verify old leader's membership in teamSales is now closed
    const oldLeaderMemberships = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empSaleLeader1.employee.id as any)
      .where('team_id', '=', teamSales.id as any)
      .execute();
    const oldLeaderClosed = oldLeaderMemberships.every((m) => {
      return m.is_leader === true;
    });
    const oldLeaderActive = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empSaleLeader1.employee.id as any)
      .where(sql`effective_range @> NOW()` as any)
      .execute();
    assert(
      oldLeaderClosed && oldLeaderActive.length === 0,
      'TEAM-12.2: Old leader history preserved and closed at NOW()',
    );

    // ----------------------------------------------------------------
    // TEAM-13: Exactly one active leader after replacement.
    // ----------------------------------------------------------------
    const activeLeaders = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('team_id', '=', teamSales.id as any)
      .where('is_leader', '=', true)
      .where(sql`effective_range @> NOW()` as any)
      .execute();
    assert(
      activeLeaders.length === 1 && String(activeLeaders[0].employee_id) === String(empSaleLeader2.employee.id),
      'TEAM-13: Exactly one active leader exists for the team after replacement',
    );

    // ----------------------------------------------------------------
    // TEAM-14: Concurrent leader assignment cannot create 2 leaders (database exclusion check).
    // ----------------------------------------------------------------
    // Verify that database exclusion constraint `no_overlapping_team_leader` is present
    let constraintViolated = false;
    try {
      await db
        .insertInto('team_memberships')
        .values({
          team_id: teamSales.id as any,
          employee_id: empSaleLeader1.employee.id as any,
          is_leader: true,
          effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
        })
        .execute();
    } catch (err: any) {
      if (err.message && (err.message.includes('no_overlapping_team_leader') || err.message.includes('exclusion constraint'))) {
        constraintViolated = true;
      }
    }
    assert(
      constraintViolated,
      'TEAM-14: Database exclusion constraint prevents concurrent 2 active leaders',
    );

    // ----------------------------------------------------------------
    // TEAM-15: Leader cannot access another team.
    // ----------------------------------------------------------------
    // Dev leader should not access Sales team
    let devLeaderBlocked = false;
    try {
      await teamsService.getTeamById(teamSales.id, {
        sub: empDevLeader1.user.id,
        roles: ['DEV_TEAM_LEADER'],
        permissions: ['TEAM_READ'],
        employeeId: empDevLeader1.employee.id,
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        devLeaderBlocked = true;
      }
    }
    assert(
      devLeaderBlocked,
      'TEAM-15: Leader cannot access another team (Object Authorization 403)',
    );

    // ----------------------------------------------------------------
    // TEAM-16: Boss/Admin can view all teams.
    // ----------------------------------------------------------------
    const adminViewSales = await teamsService.getTeamById(teamSales.id, {
      sub: '1',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: ['TEAM_READ'],
      employeeId: actorId,
    });
    const adminViewDev = await teamsService.getTeamById(teamDev.id, {
      sub: '1',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: ['TEAM_READ'],
      employeeId: actorId,
    });
    assert(
      adminViewSales && adminViewDev && adminViewSales.id === String(teamSales.id) && adminViewDev.id === String(teamDev.id),
      'TEAM-16: Admin / Boss can view all teams without object-scoping restriction',
    );

    // ----------------------------------------------------------------
    // TEAM-17: Audit trace preserved.
    // ----------------------------------------------------------------
    const teamLogs = await db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_type', 'in', ['TEAM', 'TEAM_MEMBERSHIP'])
      .execute();

    const actions = new Set(teamLogs.map((l) => l.action));
    const hasCreate = actions.has('TEAM_CREATE');
    const hasMove = actions.has('TEAM_MEMBER_MOVE');
    const hasLeaderChange = actions.has('TEAM_LEADER_CHANGE');

    assert(
      hasCreate && hasMove && hasLeaderChange,
      `TEAM-17: Audit trace preserved (Found actions: ${Array.from(actions).join(', ')})`,
    );

    // Workspace helper validation
    const ledTeam = await teamsService.getCurrentLedTeam(empSaleLeader2.employee.id);
    const teamMembers = await teamsService.getCurrentTeamMembers(teamSales2.id);
    assert(
      ledTeam && String(ledTeam.id) === String(teamSales.id) && teamMembers.length >= 1,
      'TEAM-18: Workspace foundation helpers return correct led team and members',
    );

  } catch (error) {
    console.error('CRITICAL ERROR IN TEAM INTEGRATION TEST:', error);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('==================================================');
  console.log(`TEAM INTEGRATION SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTeamIntegrationTests();
