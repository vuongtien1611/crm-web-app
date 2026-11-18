import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { OrganizationChartService } from './organization-chart.service';
import { DailyReportsService } from '../daily-reports/daily-reports.service';
import { KyselyService } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { SessionService } from '../auth/services/session.service';
import { BossOnlyGuard } from '../rbac/guards/boss-only.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { sql } from 'kysely';

async function runOrgChartIntegrationTests() {
  console.log('====================================================');
  console.log('STARTING CROSS-DEPARTMENT TRANSFER INTEGRATION TESTS');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const orgChartService = app.get(OrganizationChartService);
  const dailyReportsService = app.get(DailyReportsService);
  const kyselyService = app.get(KyselyService);
  const redisService = app.get(RedisService);
  const sessionService = app.get(SessionService);
  const configService = app.get(ConfigService);
  const reflector = app.get(Reflector);
  const db = kyselyService.db;
  const guard = new BossOnlyGuard();
  const jwtAuthGuard = new JwtAuthGuard(reflector, configService, redisService);

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
      ['SEO_TEAM_LEADER'],
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
    // TEST 2: Canonical Tree Data (ensure BOSS fixture exists on fresh DB)
    // -------------------------------------------------------------
    console.log('\n--- 2. Organization Tree Data Retrieval ---');
    const posBoss = await db.selectFrom('positions').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const empBoss = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-BOSS-${runId}`,
        full_name: `Boss Actor ${runId}`,
        position_id: posBoss.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const chartData = await orgChartService.getOrganizationChart();
    assert(chartData !== null && typeof chartData === 'object', 'TEST 2.1: Org chart data returned');
    assert(chartData.boss !== null, 'TEST 2.2: BOSS node exists at the top');
    assert(Array.isArray(chartData.teams), 'TEST 2.3: Teams list returned');

    // -------------------------------------------------------------
    // SETUP TEST FIXTURES: DYNAMIC LOOKUP (NO HARDCODED IDS)
    // -------------------------------------------------------------
    console.log('\n--- 3. Setting up dynamic test fixtures ---');
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const posDev = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();
    const posSeo = await db.selectFrom('positions').selectAll().where('code', '=', 'SEO').executeTakeFirstOrThrow();
    const posSalesLeader = await db.selectFrom('positions').selectAll().where('code', '=', 'SALES_TEAM_LEADER').executeTakeFirstOrThrow();
    const posDevLeader = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();

    const roleSale = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const roleDev = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();
    const roleSeo = await db.selectFrom('roles').selectAll().where('code', '=', 'SEO').executeTakeFirstOrThrow();

    // Create 1 SALES team, 1 DEV team, 1 SEO team, 1 OPERATION team
    const teamSale = await db
      .insertInto('teams')
      .values({ code: `TST-SAL-${runId}`, name: `Test Sales Team ${runId}`, department: 'SALES' as any })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamDev = await db
      .insertInto('teams')
      .values({ code: `TST-DEV-${runId}`, name: `Test Dev Team ${runId}`, department: 'DEV' as any })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamSeo = await db
      .insertInto('teams')
      .values({ code: `TST-SEO-${runId}`, name: `Test SEO Team ${runId}`, department: 'SEO' as any })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamOps = await db
      .insertInto('teams')
      .values({ code: `TST-OPS-${runId}`, name: `Test Ops Team ${runId}`, department: 'OPERATION' as any })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create Users and Employees
    const userCandidate = await db
      .insertInto('users')
      .values({
        username: `cand_${runId}`,
        password_hash: 'hash_test',
        email: `cand_${runId}@crm.local`,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const empCandidate = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-CAND-${runId}`,
        full_name: `Candidate Employee ${runId}`,
        position_id: posDev.id,
        user_id: userCandidate.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Assign initial role: DEV
    await db.insertInto('user_roles').values({ user_id: userCandidate.id, role_id: roleDev.id }).execute();

    // Assign initial membership: DEV Team
    const initialMembership = await db
      .insertInto('team_memberships')
      .values({
        team_id: teamDev.id,
        employee_id: empCandidate.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Initial position history: DEV
    await db
      .insertInto('employee_position_history')
      .values({
        employee_id: empCandidate.id,
        position_id: posDev.id,
        effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
        note: 'Ban đầu gia nhập DEV',
      })
      .execute();

    assert(Boolean(empCandidate.id && empBoss.id && teamSale.id && teamDev.id && teamSeo.id), 'TEST 3: Dynamic fixtures created successfully');

    // -------------------------------------------------------------
    // TEST 4: PRE-CHECK WORKLOAD API
    // -------------------------------------------------------------
    console.log('\n--- 4. Pre-Transfer Workload Inspection ---');
    const workload = await orgChartService.getEmployeeWorkload(empCandidate.id);
    assert(workload.employeeId === String(empCandidate.id), 'TEST 4.1: getEmployeeWorkload returned employee ID');
    assert(workload.hasActiveWorkload === false, 'TEST 4.2: Initially has no active workload');

    // -------------------------------------------------------------
    // TEST 5: ALL 6 CROSS-DEPARTMENT PERMUTATIONS
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing All 6 Cross-Department Transfer Permutations ---');

    // CASE 1: DEV -> SALE
    console.log('  -> Executing Transfer 1: DEV -> SALE');
    const res1 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamSale.id), reason: 'Chuyển sang kinh doanh' },
      String(empBoss.id),
    );
    assert(res1.isCrossDepartment === true, 'TEST 5.1a: DEV -> SALE marked isCrossDepartment = true');

    const empAfter1 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter1.position_id) === String(posSale.id), 'TEST 5.1b: Position updated to SALE (dynamic lookup)');

    const rolesAfter1 = await db.selectFrom('user_roles').innerJoin('roles', 'roles.id', 'user_roles.role_id').select('roles.code').where('user_roles.user_id', '=', userCandidate.id).execute();
    assert(rolesAfter1.some((r) => r.code === 'SALE') && !rolesAfter1.some((r) => r.code === 'DEV'), 'TEST 5.1c: DEV role revoked, SALE role granted');

    const activeMems1 = await db.selectFrom('team_memberships').select(sql<string>`count(id)`.as('cnt')).where('employee_id', '=', empCandidate.id).where(sql`effective_range @> NOW()` as any).executeTakeFirstOrThrow();
    assert(Number(activeMems1.cnt) === 1, 'TEST 5.1d: Exactly one active membership, no GiST temporal overlap');

    // CASE 2: SALE -> DEV
    console.log('  -> Executing Transfer 2: SALE -> DEV');
    const res2 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamDev.id), reason: 'Chuyển về kỹ thuật' },
      String(empBoss.id),
    );
    assert(res2.isCrossDepartment === true, 'TEST 5.2a: SALE -> DEV marked isCrossDepartment = true');
    const empAfter2 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter2.position_id) === String(posDev.id), 'TEST 5.2b: Position updated to DEV');
    const rolesAfter2 = await db.selectFrom('user_roles').innerJoin('roles', 'roles.id', 'user_roles.role_id').select('roles.code').where('user_roles.user_id', '=', userCandidate.id).execute();
    assert(rolesAfter2.some((r) => r.code === 'DEV') && !rolesAfter2.some((r) => r.code === 'SALE'), 'TEST 5.2c: SALE role revoked, DEV role granted');

    // CASE 3: DEV -> SEO
    console.log('  -> Executing Transfer 3: DEV -> SEO');
    const res3 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamSeo.id), reason: 'Chuyển sang SEO Marketing' },
      String(empBoss.id),
    );
    assert(res3.isCrossDepartment === true, 'TEST 5.3a: DEV -> SEO marked isCrossDepartment = true');
    const empAfter3 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter3.position_id) === String(posSeo.id), 'TEST 5.3b: Position updated to SEO');
    const rolesAfter3 = await db.selectFrom('user_roles').innerJoin('roles', 'roles.id', 'user_roles.role_id').select('roles.code').where('user_roles.user_id', '=', userCandidate.id).execute();
    assert(rolesAfter3.some((r) => r.code === 'SEO') && !rolesAfter3.some((r) => r.code === 'DEV'), 'TEST 5.3c: DEV role revoked, SEO role granted');

    // CASE 4: SEO -> DEV
    console.log('  -> Executing Transfer 4: SEO -> DEV');
    const res4 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamDev.id), reason: 'SEO về lại DEV' },
      String(empBoss.id),
    );
    assert(res4.isCrossDepartment === true, 'TEST 5.4a: SEO -> DEV marked isCrossDepartment = true');
    const empAfter4 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter4.position_id) === String(posDev.id), 'TEST 5.4b: Position updated to DEV');

    // CASE 5: DEV -> SALE -> SEO (SALE -> SEO)
    console.log('  -> Executing Transfer 5: SALE -> SEO');
    await orgChartService.moveMember({ employeeId: String(empCandidate.id), targetTeamId: String(teamSale.id) }, String(empBoss.id));
    const res5 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamSeo.id), reason: 'Sale chuyển sang SEO' },
      String(empBoss.id),
    );
    assert(res5.isCrossDepartment === true, 'TEST 5.5a: SALE -> SEO marked isCrossDepartment = true');
    const empAfter5 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter5.position_id) === String(posSeo.id), 'TEST 5.5b: Position updated to SEO');

    // CASE 6: SEO -> SALE
    console.log('  -> Executing Transfer 6: SEO -> SALE');
    const res6 = await orgChartService.moveMember(
      { employeeId: String(empCandidate.id), targetTeamId: String(teamSale.id), reason: 'SEO chuyển sang SALE' },
      String(empBoss.id),
    );
    assert(res6.isCrossDepartment === true, 'TEST 5.6a: SEO -> SALE marked isCrossDepartment = true');
    const empAfter6 = await db.selectFrom('employees').select('position_id').where('id', '=', empCandidate.id).executeTakeFirstOrThrow();
    assert(String(empAfter6.position_id) === String(posSale.id), 'TEST 5.6b: Position updated to SALE');
    const rolesAfter6 = await db.selectFrom('user_roles').innerJoin('roles', 'roles.id', 'user_roles.role_id').select('roles.code').where('user_roles.user_id', '=', userCandidate.id).execute();
    assert(rolesAfter6.some((r) => r.code === 'SALE') && !rolesAfter6.some((r) => r.code === 'SEO'), 'TEST 5.6c: SEO role revoked, SALE role active');

    // -------------------------------------------------------------
    // TEST 6: SESSION INVALIDATION REALITY CHECK
    // -------------------------------------------------------------
    console.log('\n--- 6. Session Invalidation & Token Revocation Verification ---');
    // Create a mock active session in Redis
    const testSid = 'test_sid_' + runId;
    const testRefreshToken = 'mock_refresh_token_' + runId;
    await sessionService.createSession(String(userCandidate.id), testRefreshToken, testSid);

    const accessSecret = configService.get<string>('jwt.accessSecret') || 'default_access_secret';
    const validToken = jwt.sign(
      { sub: String(userCandidate.id), sessionId: testSid, roles: ['SALE'] },
      accessSecret,
      { expiresIn: '15m' },
    );

    // Verify token works before revocation
    const activeReqContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: `Bearer ${validToken}` },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    const canActivateBefore = await jwtAuthGuard.canActivate(activeReqContext);
    assert(canActivateBefore === true, 'TEST 6.1: Active session token passes JwtAuthGuard');

    // Revoke all sessions (simulating post-transfer behavior)
    await sessionService.revokeAllUserSessions(String(userCandidate.id));

    // Request with old access token must now throw 401 Unauthorized
    let revokedRejected = false;
    try {
      await jwtAuthGuard.canActivate(activeReqContext);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        revokedRejected = true;
      }
    }
    assert(revokedRejected === true, 'TEST 6.2: Old token is immediately rejected with 401 Unauthorized after session revocation');

    // -------------------------------------------------------------
    // TEST 7: TEAM LEADER TRANSFER & DEMOTION TO REGULAR MEMBER
    // -------------------------------------------------------------
    console.log('\n--- 7. Team Leader Cross-Department Transfer ---');
    const userLeader = await db
      .insertInto('users')
      .values({ username: `ldr_${runId}`, password_hash: 'hash_test', email: `ldr_${runId}@crm.local`, status: 'ACTIVE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const empLeader = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LDR-${runId}`,
        full_name: `Leader Transfer ${runId}`,
        position_id: posDevLeader.id,
        user_id: userLeader.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('team_memberships').values({
      team_id: teamDev.id,
      employee_id: empLeader.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - interval '2 days', NULL, '[)')` as any,
    }).execute();

    // Transfer DEV Leader -> SALE
    const resLeaderTransfer = await orgChartService.moveMember(
      { employeeId: String(empLeader.id), targetTeamId: String(teamSale.id), reason: 'Leader chuyển phòng ban' },
      String(empBoss.id),
    );
    assert(resLeaderTransfer.isCrossDepartment === true, 'TEST 7.1: Team Leader cross-dept transfer completed');

    const newLeaderMembership = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empLeader.id)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirstOrThrow();
    assert(newLeaderMembership.is_leader === false, 'TEST 7.2: Transferred Leader becomes regular member (is_leader = false) in target team');

    // Transfer Leader within SAME department: SEO Leader -> SEO Team 2
    const teamSeo2 = await db
      .insertInto('teams')
      .values({ code: `T-SEO2-${runId}`, name: `SEO Team 2 ${runId}`, department: 'SEO' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const empSeoLeader = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-SEOL-${runId}`,
        full_name: `SEO Leader ${runId}`,
        position_id: posSeo.id,
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('team_memberships').values({
      team_id: teamSeo.id,
      employee_id: empSeoLeader.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - interval '3 days', NULL, '[)')` as any,
    }).execute();

    const resSameDeptLeaderTransfer = await orgChartService.moveMember(
      { employeeId: String(empSeoLeader.id), targetTeamId: String(teamSeo2.id), reason: 'Chuyển sang làm nhân viên team mới' },
      String(empBoss.id),
    );
    assert(resSameDeptLeaderTransfer.isCrossDepartment === false, 'TEST 7.3: Same-dept leader transfer isCrossDepartment = false');
    assert(resSameDeptLeaderTransfer.wasLeader === true, 'TEST 7.4: wasLeader flagged true');

    const seoLeaderNewMembership = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empSeoLeader.id)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirstOrThrow();
    assert(seoLeaderNewMembership.is_leader === false, 'TEST 7.5: Same-dept moved Leader becomes regular member (is_leader = false)');

    // -------------------------------------------------------------
    // TEST 8: DAILY REPORT HISTORICAL SCOPE TEST
    // -------------------------------------------------------------
    console.log('\n--- 8. Daily Report Historical Scoping Test ---');
    // Create dedicated teams for clean report test
    const teamDevRep = await db
      .insertInto('teams')
      .values({ code: `T-DR-DEV-${runId}`, name: `Daily Report DEV ${runId}`, department: 'DEV' })
      .returningAll()
      .executeTakeFirstOrThrow();

    const teamSaleRep = await db
      .insertInto('teams')
      .values({ code: `T-DR-SAL-${runId}`, name: `Daily Report SALE ${runId}`, department: 'SALES' })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Dev Leader for teamDevRep
    const leaderDevRep = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DR-DVL-${runId}`, full_name: `DR Dev Leader ${runId}`, position_id: posDevLeader.id, status: 'ACTIVE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('team_memberships').values({
      team_id: teamDevRep.id,
      employee_id: leaderDevRep.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
    }).execute();

    // Sales Leader for teamSaleRep
    const leaderSaleRep = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DR-SLL-${runId}`, full_name: `DR Sales Leader ${runId}`, position_id: posSalesLeader.id, status: 'ACTIVE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('team_memberships').values({
      team_id: teamSaleRep.id,
      employee_id: leaderSaleRep.id,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
    }).execute();

    // Employee subject starting in teamDevRep
    const empRepSubject = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-DR-SUB-${runId}`, full_name: `DR Subject ${runId}`, position_id: posDev.id, status: 'ACTIVE' })
      .returningAll()
      .executeTakeFirstOrThrow();

    await db.insertInto('team_memberships').values({
      team_id: teamDevRep.id,
      employee_id: empRepSubject.id,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
    }).execute();

    await db.insertInto('employee_position_history').values({
      employee_id: empRepSubject.id,
      position_id: posDev.id,
      effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
    }).execute();

    // 1. Report BEFORE transfer (submitted 2 days ago in DEV)
    const reportBefore = await db
      .insertInto('daily_reports')
      .values({
        employee_id: empRepSubject.id,
        report_date: '2026-09-01' as any,
        note: 'Report BEFORE transfer in DEV',
        submitted_at: sql`NOW() - interval '2 days'` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 2. Perform cross-department transfer DEV -> SALE
    const repTransfer = await orgChartService.moveMember(
      { employeeId: String(empRepSubject.id), targetTeamId: String(teamSaleRep.id), reason: 'Chuyển sang SALE để test daily report' },
      String(empBoss.id),
    );
    assert(repTransfer.isCrossDepartment === true, 'TEST 8.0: Transfer completed for DR subject');

    const repNewMem = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', empRepSubject.id)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirstOrThrow();

    // 3. Report AT EXACT TRANSFER TIME (submitted at lower bound of new membership)
    const reportExact = await db
      .insertInto('daily_reports')
      .values({
        employee_id: empRepSubject.id,
        report_date: '2026-09-02' as any,
        note: 'Report AT EXACT TRANSFER TIME',
        submitted_at: sql`lower(${repNewMem.effective_range}::tstzrange)` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 4. Report AFTER transfer (submitted in SALE)
    const reportAfter = await db
      .insertInto('daily_reports')
      .values({
        employee_id: empRepSubject.id,
        report_date: '2026-09-03' as any,
        note: 'Report AFTER transfer in SALE',
        submitted_at: sql`NOW() + interval '5 minutes'` as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Query as Dev Leader (old team):
    const devLeaderReports = await dailyReportsService.getDailyReports(
      {},
      String(leaderDevRep.id),
      ['DEV_TEAM_LEADER'],
    );
    const devReportIds = devLeaderReports.map((r: any) => String(r.id));
    assert(devReportIds.includes(String(reportBefore.id)), 'TEST 8.1: Dev Leader can see report submitted before transfer while in DEV');
    assert(!devReportIds.includes(String(reportExact.id)), 'TEST 8.2: Dev Leader CANNOT see report at exact transfer moment (belongs to new team)');
    assert(!devReportIds.includes(String(reportAfter.id)), 'TEST 8.3: Dev Leader CANNOT see report submitted after transfer to SALE');

    // Query as Sales Leader (new team):
    const salesLeaderReports = await dailyReportsService.getDailyReports(
      {},
      String(leaderSaleRep.id),
      ['SALES_TEAM_LEADER'],
    );
    const salesReportIds = salesLeaderReports.map((r: any) => String(r.id));
    assert(!salesReportIds.includes(String(reportBefore.id)), 'TEST 8.4: Sales Leader CANNOT see report submitted before transfer while in DEV');
    assert(salesReportIds.includes(String(reportExact.id)), 'TEST 8.5: Sales Leader sees report submitted at exact transfer moment');
    assert(salesReportIds.includes(String(reportAfter.id)), 'TEST 8.6: Sales Leader sees report submitted after transfer to SALE');

    // Query as Employee own scope:
    const ownReports = await dailyReportsService.getDailyReports(
      { scope: 'own' },
      String(empRepSubject.id),
      ['SALE'],
    );
    const ownReportIds = ownReports.map((r: any) => String(r.id));
    assert(
      ownReportIds.includes(String(reportBefore.id)) &&
      ownReportIds.includes(String(reportExact.id)) &&
      ownReportIds.includes(String(reportAfter.id)),
      'TEST 8.7: Employee sees ALL their reports across time (before, at transfer, after transfer)',
    );

    // -------------------------------------------------------------
    // TEST 9: CONSTRAINTS & ROLLBACK INTEGRITY
    // -------------------------------------------------------------
    console.log('\n--- 9. Safety Constraints & Transaction Rollback ---');
    // Reject moving BOSS
    let bossMoveRejected = false;
    try {
      await orgChartService.moveMember({ employeeId: String(empBoss.id), targetTeamId: String(teamSale.id) }, String(empBoss.id));
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('BOSS')) {
        bossMoveRejected = true;
      }
    }
    assert(bossMoveRejected, 'TEST 9.1: Moving BOSS into a team throws BadRequestException');

    // Reject moving into invalid department (e.g. OPERATION)
    let opsMoveRejected = false;
    try {
      await orgChartService.moveMember({ employeeId: String(empCandidate.id), targetTeamId: String(teamOps.id) }, String(empBoss.id));
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('OPERATION')) {
        opsMoveRejected = true;
      }
    }
    assert(opsMoveRejected, 'TEST 9.2: Moving into OPERATION department throws BadRequestException');

    // Reject moving into same team
    let sameTeamRejected = false;
    try {
      await orgChartService.moveMember({ employeeId: String(empCandidate.id), targetTeamId: String(teamSale.id) }, String(empBoss.id));
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('đã thuộc nhóm')) {
        sameTeamRejected = true;
      }
    }
    assert(sameTeamRejected, 'TEST 9.3: Moving into current team throws BadRequestException');

    // Cleanup fixtures
    await db.deleteFrom('daily_reports').where('id', 'in', [reportBefore.id, reportExact.id, reportAfter.id]).execute();
    await db.deleteFrom('audit_logs').where('actor_employee_id', '=', empBoss.id).execute();
    await db.deleteFrom('team_memberships').where('team_id', 'in', [teamSale.id, teamDev.id, teamSeo.id, teamOps.id, teamDevRep.id, teamSaleRep.id]).execute();
    await db.deleteFrom('employee_position_history').where('employee_id', 'in', [empCandidate.id, empLeader.id, leaderDevRep.id, leaderSaleRep.id, empRepSubject.id]).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', [userCandidate.id, userLeader.id]).execute();
    await db.deleteFrom('employees').where('id', 'in', [empCandidate.id, empLeader.id, leaderDevRep.id, leaderSaleRep.id, empRepSubject.id, empBoss.id]).execute();
    await db.deleteFrom('users').where('id', 'in', [userCandidate.id, userLeader.id]).execute();
    await db.deleteFrom('teams').where('id', 'in', [teamSale.id, teamDev.id, teamSeo.id, teamOps.id, teamDevRep.id, teamSaleRep.id]).execute();

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
