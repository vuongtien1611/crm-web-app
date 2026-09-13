import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { OrganizationChartService } from './organization-chart.service';
import { KyselyService } from '../../database/kysely.service';
import { BossOnlyGuard } from '../rbac/guards/boss-only.guard';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';

async function runOrgChartIntegrationTests() {
  console.log('====================================================');
  console.log('STARTING ORGANIZATION CHART INTEGRATION TESTS');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const orgChartService = app.get(OrganizationChartService);
  const kyselyService = app.get(KyselyService);
  const db = kyselyService.db;
  const guard = new BossOnlyGuard();

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

  try {
    // -------------------------------------------------------------
    // TEST 1: Role khác -> 403 Forbidden (RBAC Guard)
    // -------------------------------------------------------------
    console.log('\n--- 1. RBAC Check: Non-BOSS roles must get 403 Forbidden ---');
    const nonBossRoles = [
      ['ADMIN'],
      ['SALE'],
      ['DEV'],
      ['SEO'],
      ['SALES_TEAM_LEADER'],
      ['DEV_TEAM_LEADER'],
      ['ACCOUNTANT'],
    ];

    let allNonBossRejected = true;
    for (const roles of nonBossRoles) {
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: '999', roles },
          }),
        }),
      };

      try {
        guard.canActivate(mockContext);
        allNonBossRejected = false;
        console.error(`❌ Non-BOSS with roles [${roles.join(',')}] was NOT rejected!`);
      } catch (err: any) {
        if (!(err instanceof ForbiddenException)) {
          allNonBossRejected = false;
        }
      }
    }
    assert(allNonBossRejected, 'TEST 1: Non-BOSS roles are strictly rejected with 403 Forbidden');

    // BOSS pass guard
    const bossContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: '1', roles: ['BOSS'] },
        }),
      }),
    };
    const bossPassed = guard.canActivate(bossContext);
    assert(bossPassed === true, 'TEST 1.1: BOSS role passes BossOnlyGuard with 200 OK');

    // -------------------------------------------------------------
    // TEST 2: BOSS xem toàn bộ cây Canonical
    // -------------------------------------------------------------
    console.log('\n--- 2. Organization Tree Data Retrieval ---');
    const chartData = await orgChartService.getOrganizationChart();
    assert(chartData !== null && typeof chartData === 'object', 'TEST 2.1: Org chart data returned');
    assert(chartData.boss !== null, 'TEST 2.2: BOSS node exists at the top');
    assert(Array.isArray(chartData.teams), 'TEST 2.3: Teams list returned');
    assert(Array.isArray(chartData.externalStaff), 'TEST 2.4: External staff list returned (ADMIN, ACCOUNTANT, etc.)');

    console.log(`  + Boss: ${chartData.boss?.fullName} (${chartData.boss?.positionCode})`);
    console.log(`  + Canonical Teams count: ${chartData.teams.length}`);
    console.log(`  + External Staff count: ${chartData.externalStaff.length}`);

    // -------------------------------------------------------------
    // SETUP TEST FIXTURES: 2 SALES Teams, 1 DEV Team, 1 Member, 1 Leader, 1 BOSS
    // -------------------------------------------------------------
    console.log('\n--- Setting up test fixtures for move member & validations ---');

    // Create 2 test sales teams
    const teamSaleA = await db
      .insertInto('teams')
      .values({
        code: `TST-SAL-A-${runId}`,
        name: `Test Sales Alpha ${runId}`,
        department: 'SALES' as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamSaleB = await db
      .insertInto('teams')
      .values({
        code: `TST-SAL-B-${runId}`,
        name: `Test Sales Beta ${runId}`,
        department: 'SALES' as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamDev = await db
      .insertInto('teams')
      .values({
        code: `TST-DEV-${runId}`,
        name: `Test Dev Team ${runId}`,
        department: 'DEV' as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Get positions
    let posSale = await db.selectFrom('positions').select('id').where('code', '=', 'SALE').executeTakeFirst();
    if (!posSale) {
      posSale = await db.insertInto('positions').values({ code: 'SALE', name: 'Nhân viên kinh doanh' }).returning('id').executeTakeFirstOrThrow();
    }
    let posSalesLeader = await db.selectFrom('positions').select('id').where('code', '=', 'SALES_TEAM_LEADER').executeTakeFirst();
    if (!posSalesLeader) {
      posSalesLeader = await db.insertInto('positions').values({ code: 'SALES_TEAM_LEADER', name: 'Trưởng nhóm kinh doanh' }).returning('id').executeTakeFirstOrThrow();
    }
    let posBoss = await db.selectFrom('positions').select('id').where('code', '=', 'BOSS').executeTakeFirst();
    if (!posBoss) {
      posBoss = await db.insertInto('positions').values({ code: 'BOSS', name: 'Giám Đốc' }).returning('id').executeTakeFirstOrThrow();
    }

    // Create test employees
    const empMember = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-MEM-${runId}`,
        full_name: `Test Member ${runId}`,
        position_id: posSale.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const empLeader = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LDR-${runId}`,
        full_name: `Test Leader ${runId}`,
        position_id: posSalesLeader.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const empBoss = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-BSS-${runId}`,
        full_name: `Test Boss ${runId}`,
        position_id: posBoss.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Assign initial memberships:
    // empLeader -> Leader of Team Sale A
    const leaderMembership = await db
      .insertInto('team_memberships')
      .values({
        team_id: teamSaleA.id,
        employee_id: empLeader.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // empMember -> Member of Team Sale A
    const memberMembership = await db
      .insertInto('team_memberships')
      .values({
        team_id: teamSaleA.id,
        employee_id: empMember.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // -------------------------------------------------------------
    // TEST 3: Move member Team A -> Team B PASS
    // -------------------------------------------------------------
    console.log('\n--- 3. Move member Team A -> Team B ---');
    const moveRes = await orgChartService.moveMember(
      {
        employeeId: String(empMember.id),
        targetTeamId: String(teamSaleB.id),
        reason: 'Điều chuyển nội bộ cùng phòng ban',
      },
      String(empBoss.id),
    );

    assert(moveRes !== null, 'TEST 3.1: moveMember response returned');
    assert(String(moveRes.targetTeamId) === String(teamSaleB.id), 'TEST 3.2: targetTeamId matches Team B');

    // -------------------------------------------------------------
    // TEST 4: Membership cũ closed & TEST 5: Membership mới active
    // -------------------------------------------------------------
    console.log('\n--- 4 & 5. Temporal Membership Range Verification ---');
    const oldMembership = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('id', '=', memberMembership.id)
      .executeTakeFirstOrThrow();

    const newMembership = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('id', '=', moveRes.newMembershipId as any)
      .executeTakeFirstOrThrow();

    // Check old membership upper bound is closed
    const oldClosed = await db
      .selectFrom('team_memberships')
      .select(sql<boolean>`upper(effective_range) IS NOT NULL AND upper(effective_range) <= NOW()`.as('is_closed'))
      .where('id', '=', oldMembership.id)
      .executeTakeFirstOrThrow();

    assert(oldClosed.is_closed === true, 'TEST 4: Old membership range was closed at NOW()');

    // Check new membership is active
    const newActive = await db
      .selectFrom('team_memberships')
      .select(sql<boolean>`effective_range @> NOW() AND upper(effective_range) IS NULL`.as('is_active'))
      .where('id', '=', newMembership.id)
      .executeTakeFirstOrThrow();

    assert(newActive.is_active === true, 'TEST 5: New membership range is currently active [NOW(), NULL)');

    // -------------------------------------------------------------
    // TEST 6: Không tạo 2 active team (duy nhất 1 active membership)
    // -------------------------------------------------------------
    console.log('\n--- 6. Single Active Primary Team Membership Enforcement ---');
    const activeMembershipsCount = await db
      .selectFrom('team_memberships')
      .select(sql<string>`count(id)`.as('count'))
      .where('employee_id', '=', empMember.id)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirstOrThrow();

    assert(
      Number(activeMembershipsCount.count) === 1,
      'TEST 6: Employee has EXACTLY ONE active primary team membership at any time',
    );

    // -------------------------------------------------------------
    // TEST 7: Cross-department move -> Rejected with CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED
    // -------------------------------------------------------------
    console.log('\n--- 7. Cross-Department Move (BLOCKED: CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED) ---');
    let crossDeptRejected = false;
    try {
      await orgChartService.moveMember(
        {
          employeeId: String(empMember.id),
          targetTeamId: String(teamDev.id),
          reason: 'Thử việc chuyển sang phòng kỹ thuật',
        },
        String(empBoss.id),
      );
    } catch (err: any) {
      if (
        err instanceof BadRequestException &&
        err.message.includes('CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED')
      ) {
        crossDeptRejected = true;
      }
    }
    assert(
      crossDeptRejected,
      'TEST 7: Cross-department move is strictly rejected with CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED',
    );

    // -------------------------------------------------------------
    // TEST 8: Kéo BOSS -> Reject
    // -------------------------------------------------------------
    console.log('\n--- 8. Drag BOSS into a team -> Strictly Rejected ---');
    let bossMoveRejected = false;
    try {
      await orgChartService.moveMember(
        {
          employeeId: String(empBoss.id),
          targetTeamId: String(teamSaleA.id),
        },
        String(empBoss.id),
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Giám Đốc (BOSS)')) {
        bossMoveRejected = true;
      }
    }
    assert(bossMoveRejected, 'TEST 8: Moving BOSS into a team throws BadRequestException');

    // -------------------------------------------------------------
    // TEST 9: Kéo Team Leader như member -> Reject
    // -------------------------------------------------------------
    console.log('\n--- 9. Drag Team Leader as normal member -> Strictly Rejected ---');
    let leaderMoveRejected = false;
    try {
      await orgChartService.moveMember(
        {
          employeeId: String(empLeader.id),
          targetTeamId: String(teamSaleB.id),
        },
        String(empBoss.id),
      );
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Trưởng nhóm')) {
        leaderMoveRejected = true;
      }
    }
    assert(leaderMoveRejected, 'TEST 9: Moving active Team Leader as regular member throws BadRequestException');

    // -------------------------------------------------------------
    // TEST 10: Change Team Leader action -> Blocked with TEAM_LEADER_ROLE_POLICY_NOT_DEFINED
    // -------------------------------------------------------------
    console.log('\n--- 10. Action Đổi trưởng Team (BLOCKED: TEAM_LEADER_ROLE_POLICY_NOT_DEFINED) ---');
    let changeLeaderBlocked = false;
    try {
      await orgChartService.changeLeader(
        {
          teamId: String(teamSaleB.id),
          newLeaderEmployeeId: String(empMember.id),
        },
        String(empBoss.id),
      );
    } catch (err: any) {
      if (
        err instanceof BadRequestException &&
        err.message.includes('TEAM_LEADER_ROLE_POLICY_NOT_DEFINED')
      ) {
        changeLeaderBlocked = true;
      }
    }
    assert(
      changeLeaderBlocked,
      'TEST 10: Change leader is blocked with TEAM_LEADER_ROLE_POLICY_NOT_DEFINED',
    );

    // Cleanup fixtures
    await db.deleteFrom('audit_logs').where('actor_employee_id', '=', empBoss.id).execute();
    await db.deleteFrom('team_memberships').where('team_id', 'in', [teamSaleA.id, teamSaleB.id, teamDev.id]).execute();
    await db.deleteFrom('teams').where('id', 'in', [teamSaleA.id, teamSaleB.id, teamDev.id]).execute();
    await db.deleteFrom('employees').where('id', 'in', [empMember.id, empLeader.id, empBoss.id]).execute();
  } catch (err) {
    console.error('Unexpected error during integration tests:', err);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runOrgChartIntegrationTests();
