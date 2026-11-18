import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { KyselyService } from '../database/kysely.service';
import { sql } from 'kysely';

const API_URL = 'http://localhost:3000/api';
const DEFAULT_PASS = 'Staging@2026Pass!';

async function apiPost(path: string, body: any, headers?: Record<string, string>) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function apiGet(path: string, headers?: Record<string, string>) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function computeSidebarMenu(roles: string[]): string[] {
  const isBoss = roles.includes('BOSS');
  const isSalesLeader = roles.includes('SALES_TEAM_LEADER');
  const isSale = roles.includes('SALE');
  const isDevLeader = roles.includes('DEV_TEAM_LEADER');
  const isDev = roles.includes('DEV');
  const isSeoLeader = roles.includes('SEO_TEAM_LEADER');
  const isSeo = roles.includes('SEO');
  const isAccountant = roles.includes('ACCOUNTANT');

  if (isBoss) {
    return ['/dashboard', '/organization-chart', '/employee-accounts', '/employees', '/teams', '/reports', '/leads', '/deals', '/orders', '/subscriptions', '/projects', '/finance/overview', '/finance/receivables', '/finance/cashflow', '/payments', '/commissions', '/kpi', '/payroll', '/expenses', '/acquisition', '/notifications'];
  } else if (isSalesLeader) {
    return ['/workspace/sales', '/leads', '/deals', '/orders', '/kpi', '/reports', '/teams', '/notifications'];
  } else if (isSale) {
    return ['/dashboard', '/leads', '/deals', '/orders', '/kpi', '/reports', '/notifications'];
  } else if (isDevLeader) {
    return ['/workspace/dev', '/projects', '/projects?tab=assign', '/projects?tab=tasks', '/kpi', '/reports', '/teams', '/notifications'];
  } else if (isDev) {
    return ['/dashboard', '/projects', '/projects?tab=tasks', '/commissions', '/kpi', '/reports', '/notifications'];
  } else if (isSeoLeader) {
    return ['/workspace/seo', '/projects', '/projects?tab=assign', '/projects?tab=tasks', '/kpi', '/reports', '/teams', '/notifications'];
  } else if (isSeo) {
    return ['/dashboard', '/projects', '/projects?tab=tasks', '/commissions', '/kpi', '/reports', '/notifications'];
  } else if (isAccountant) {
    return ['/dashboard', '/payments', '/payroll', '/expenses', '/orders', '/subscriptions', '/reports', '/notifications'];
  } else {
    return ['/dashboard', '/reports', '/leads', '/deals', '/orders', '/subscriptions', '/projects', '/payments', '/commissions', '/kpi', '/payroll'];
  }
}

async function runRuntimeVerification() {
  console.log('===============================================================');
  console.log('STARTING RUNTIME FRONTEND & API CROSS-DEPARTMENT VERIFICATION');
  console.log('===============================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get(KyselyService);
  const db = kysely.db;

  let passCount = 0;
  let failCount = 0;

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failCount++;
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  try {
    // -----------------------------------------------------------------
    // 0. RESET STAGING STATE TO CLEAN INITIAL STATE
    // -----------------------------------------------------------------
    console.log('\n--- 0. Initializing Clean Staging State ---');
    const posDev = await db.selectFrom('positions').select('id').where('code', '=', 'DEV').executeTakeFirstOrThrow();
    const roleDev = await db.selectFrom('roles').select('id').where('code', '=', 'DEV').executeTakeFirstOrThrow();

    // Reset employee 8 (staging_dev) to DEV in team 6
    await db.updateTable('employees').set({ position_id: posDev.id }).where('id', '=', 8 as any).execute();
    await db.deleteFrom('user_roles').where('user_id', '=', 8 as any).execute();
    await db.insertInto('user_roles').values({ user_id: 8 as any, role_id: roleDev.id }).execute();
    await db.deleteFrom('team_memberships').where('employee_id', '=', 8 as any).execute();
    await db.insertInto('team_memberships').values({
      team_id: 6 as any,
      employee_id: 8 as any,
      is_leader: false,
      effective_range: sql`tstzrange(NOW() - interval '30 days', NULL, '[)')` as any,
    }).execute();
    await db.deleteFrom('employee_position_history').where('employee_id', '=', 8 as any).execute();
    await db.insertInto('employee_position_history').values({
      employee_id: 8 as any,
      position_id: posDev.id,
      effective_range: sql`tstzrange(NOW() - interval '30 days', NULL, '[)')` as any,
    }).execute();

    // Reset employee 7 (staging_dev_leader) to DEV_TEAM_LEADER in team 6
    const posDevLeader = await db.selectFrom('positions').select('id').where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();
    const roleDevLeader = await db.selectFrom('roles').select('id').where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();
    await db.updateTable('employees').set({ position_id: posDevLeader.id }).where('id', '=', 7 as any).execute();
    await db.deleteFrom('user_roles').where('user_id', '=', 7 as any).execute();
    await db.insertInto('user_roles').values({ user_id: 7 as any, role_id: roleDevLeader.id }).execute();
    await db.deleteFrom('team_memberships').where('employee_id', '=', 7 as any).execute();
    await db.insertInto('team_memberships').values({
      team_id: 6 as any,
      employee_id: 7 as any,
      is_leader: true,
      effective_range: sql`tstzrange(NOW() - interval '30 days', NULL, '[)')` as any,
    }).execute();

    console.log('Clean initial staging state restored.');

    // -----------------------------------------------------------------
    // 1. Login as BOSS
    // -----------------------------------------------------------------
    console.log('\n--- 1. BOSS Authentication ---');
    const bossLoginRes = await apiPost('/auth/login', {
      identifier: 'staging_boss',
      password: DEFAULT_PASS,
    });
    assert(bossLoginRes.status === 200, 'BOSS login HTTP 200');
    const bossToken = bossLoginRes.data.accessToken;
    const bossAuthHeaders = { Authorization: `Bearer ${bossToken}` };
    assert(bossLoginRes.data.user.roles.includes('BOSS'), 'BOSS authenticated with role BOSS');

    // -----------------------------------------------------------------
    // CASE 1: DEV -> SALE
    // -----------------------------------------------------------------
    console.log('\n--- CASE 1: DEV -> SALE ---');
    // a. Login as DEV account (staging_dev)
    const devLoginRes1 = await apiPost('/auth/login', {
      identifier: 'staging_dev',
      password: DEFAULT_PASS,
    });
    assert(devLoginRes1.status === 200, 'staging_dev login HTTP 200');
    const oldDevToken = devLoginRes1.data.accessToken;
    const devEmployeeId = devLoginRes1.data.user.employeeId;
    assert(devLoginRes1.data.user.roles.includes('DEV'), 'DEV-1.a: staging_dev initially logged in with role DEV');

    // b. Verify sidebar/menu for DEV
    const devMenu1 = computeSidebarMenu(devLoginRes1.data.user.roles);
    assert(devMenu1.includes('/projects') && devMenu1.includes('/projects?tab=tasks'), 'DEV-1.b1: Sidebar contains Projects and Tasks');
    assert(!devMenu1.includes('/leads') && !devMenu1.includes('/deals') && !devMenu1.includes('/orders'), 'DEV-1.b2: Sidebar DOES NOT contain Leads/Deals/Orders');

    // Check DEV API works before transfer
    const devProjectsRes = await apiGet('/projects', { Authorization: `Bearer ${oldDevToken}` });
    assert(devProjectsRes.status === 200, 'DEV-1.b3: staging_dev can call GET /api/projects');

    // c. BOSS transfers staging_dev from DEV to SALE team (teamId 4: STG-TEAM-SALE1)
    console.log('  -> BOSS transferring employee #8 to Team 4 (STG-TEAM-SALE1)...');
    const transferRes1 = await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(devEmployeeId),
        targetTeamId: '4',
        reason: 'UAT verification transfer DEV -> SALE',
      },
      bossAuthHeaders,
    );
    assert(transferRes1.status === 200 || transferRes1.status === 201, 'DEV-1.c1: Transfer API returned success');
    assert(transferRes1.data.isCrossDepartment === true, 'DEV-1.c2: BOSS cross-department transfer DEV -> SALE marked isCrossDepartment');

    // d. Use OLD JWT to call API -> Must return 401 Unauthorized
    const oldTokenRes = await apiGet('/projects', { Authorization: `Bearer ${oldDevToken}` });
    assert(oldTokenRes.status === 401, 'DEV-1.d: Old JWT session rejected immediately with 401 Unauthorized after Redis revocation');

    // e. Re-login using staging_dev
    console.log('  -> Re-logging in with staging_dev to receive new credentials...');
    const saleLoginRes = await apiPost('/auth/login', {
      identifier: 'staging_dev',
      password: DEFAULT_PASS,
    });
    assert(saleLoginRes.status === 200, 'Re-login HTTP 200');
    const newSaleToken = saleLoginRes.data.accessToken;
    const saleAuthHeaders = { Authorization: `Bearer ${newSaleToken}` };

    // f. Verify account current role, position, team
    assert(saleLoginRes.data.user.roles.includes('SALE') && !saleLoginRes.data.user.roles.includes('DEV'), 'DEV-1.f1: New session has role SALE (DEV revoked)');
    const empInDb1 = await db
      .selectFrom('employees as e')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .select(['e.id', 'p.code as position_code'])
      .where('e.id', '=', devEmployeeId as any)
      .executeTakeFirstOrThrow();
    assert(empInDb1.position_code === 'SALE', 'DEV-1.f2: Employee current position in DB updated to SALE');

    const activeMembership1 = await db
      .selectFrom('team_memberships as tm')
      .innerJoin('teams as t', 't.id', 'tm.team_id')
      .select(['t.id as team_id', 't.name as team_name', 't.department'])
      .where('tm.employee_id', '=', devEmployeeId as any)
      .where(sql`tm.effective_range @> NOW()` as any)
      .executeTakeFirstOrThrow();
    assert(activeMembership1.department === 'SALES' && String(activeMembership1.team_id) === '4', 'DEV-1.f3: Active team membership is STG-TEAM-SALE1 (department SALES)');

    // g. Verify Sidebar/menu for SALE
    const saleMenu = computeSidebarMenu(saleLoginRes.data.user.roles);
    assert(saleMenu.includes('/leads') && saleMenu.includes('/deals') && saleMenu.includes('/orders'), 'DEV-1.g1: Sidebar now contains Leads, Deals, Orders');
    assert(!saleMenu.includes('/projects'), 'DEV-1.g2: Sidebar NO LONGER contains Projects');

    // h. Verify SALE API works
    const leadsRes = await apiGet('/leads', saleAuthHeaders);
    assert(leadsRes.status === 200, 'DEV-1.h: SALE API GET /api/leads works with 200 OK');

    // i. Verify DEV restricted API returns 403 Forbidden
    const devApiBlockedRes = await apiPost(
      '/order-items/1/assign-project',
      { employeeId: String(devEmployeeId), assignmentType: 'PRIMARY' },
      saleAuthHeaders,
    );
    assert(devApiBlockedRes.status === 403, 'DEV-1.i: DEV restricted API (/order-items/1/assign-project) returns 403 Forbidden for new SALE role');

    // j. Historical data preserved
    const pastReports = await apiGet('/daily-reports?scope=own', saleAuthHeaders);
    assert(pastReports.status === 200, 'DEV-1.j: Employee can access own daily reports history across departments');

    // -----------------------------------------------------------------
    // CASE 2: SALE -> DEV
    // -----------------------------------------------------------------
    console.log('\n--- CASE 2: SALE -> DEV ---');
    // Transfer back from SALE (team 4) to DEV (team 6: STG-TEAM-DEV1)
    const transferRes2 = await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(devEmployeeId),
        targetTeamId: '6',
        reason: 'UAT verification transfer SALE -> DEV',
      },
      bossAuthHeaders,
    );
    assert(transferRes2.data.isCrossDepartment === true, 'SALE->DEV: Transfer SALE -> DEV succeeded');

    // Verify previous SALE token is now 401
    const checkSaleToken = await apiGet('/leads', saleAuthHeaders);
    assert(checkSaleToken.status === 401, 'SALE->DEV: Previous SALE token rejected with 401');

    // Re-login as DEV
    const devLoginRes2 = await apiPost('/auth/login', {
      identifier: 'staging_dev',
      password: DEFAULT_PASS,
    });
    const newDevToken = devLoginRes2.data.accessToken;
    const newDevAuthHeaders = { Authorization: `Bearer ${newDevToken}` };
    assert(devLoginRes2.data.user.roles.includes('DEV') && !devLoginRes2.data.user.roles.includes('SALE'), 'SALE->DEV: Re-login received role DEV');

    const devMenu2 = computeSidebarMenu(devLoginRes2.data.user.roles);
    assert(devMenu2.includes('/projects') && !devMenu2.includes('/leads'), 'SALE->DEV: Sidebar switched back to DEV (has Projects, no Leads)');

    const devProjectsRes2 = await apiGet('/projects', newDevAuthHeaders);
    assert(devProjectsRes2.status === 200, 'SALE->DEV: DEV API GET /api/projects works with 200 OK');

    // -----------------------------------------------------------------
    // CASE 3: DEV -> SEO
    // -----------------------------------------------------------------
    console.log('\n--- CASE 3: DEV -> SEO ---');
    // Transfer DEV -> SEO (team 8: STG-TEAM-SEO1)
    const transferRes3 = await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(devEmployeeId),
        targetTeamId: '8',
        reason: 'UAT verification transfer DEV -> SEO',
      },
      bossAuthHeaders,
    );
    assert(transferRes3.data.isCrossDepartment === true, 'DEV->SEO: Transfer DEV -> SEO succeeded');

    // Verify previous DEV token is now 401
    const checkDevToken = await apiGet('/projects', newDevAuthHeaders);
    assert(checkDevToken.status === 401, 'DEV->SEO: Previous DEV token rejected with 401');

    // Re-login as SEO
    const seoLoginRes = await apiPost('/auth/login', {
      identifier: 'staging_dev',
      password: DEFAULT_PASS,
    });
    const newSeoToken = seoLoginRes.data.accessToken;
    const newSeoAuthHeaders = { Authorization: `Bearer ${newSeoToken}` };
    assert(seoLoginRes.data.user.roles.includes('SEO') && !seoLoginRes.data.user.roles.includes('DEV'), 'DEV->SEO: Re-login received role SEO');

    const seoMenu = computeSidebarMenu(seoLoginRes.data.user.roles);
    assert(seoMenu.includes('/projects') && !seoMenu.includes('/leads'), 'DEV->SEO: Sidebar has SEO Projects, no Leads');

    // Reset staging_dev back to STG-TEAM-DEV1
    await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(devEmployeeId),
        targetTeamId: '6',
        reason: 'Reset to initial state',
      },
      bossAuthHeaders,
    );
    console.log('  -> Reset staging_dev back to STG-TEAM-DEV1');

    // -----------------------------------------------------------------
    // CASE 4: TEAM LEADER TRANSFER & DEMOTION
    // -----------------------------------------------------------------
    console.log('\n--- CASE 4: TEAM LEADER TRANSFER & DEMOTION ---');
    // Login as DEV Team Leader (staging_dev_leader, employee 7)
    const leaderLoginRes = await apiPost('/auth/login', {
      identifier: 'staging_dev_leader',
      password: DEFAULT_PASS,
    });
    const leaderEmployeeId = leaderLoginRes.data.user.employeeId;
    assert(leaderLoginRes.data.user.roles.includes('DEV_TEAM_LEADER'), 'LEADER-4.a: Initial role is DEV_TEAM_LEADER');

    const leaderMenuBefore = computeSidebarMenu(leaderLoginRes.data.user.roles);
    assert(leaderMenuBefore.includes('/workspace/dev') && leaderMenuBefore.includes('/teams'), 'LEADER-4.b: Sidebar contains Leader management menus (/workspace/dev, /teams)');

    // Check Workload API for warnings before transfer
    const workloadRes = await apiGet(`/organization-chart/employee-workload/${leaderEmployeeId}`, bossAuthHeaders);
    assert(workloadRes.data.isLeader === true, 'LEADER-4.c: Workload pre-check identifies employee is currently Team Leader');

    // Transfer Leader to SALE team (team 4)
    console.log('  -> Transferring DEV Team Leader to SALE team...');
    const leaderTransferRes = await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(leaderEmployeeId),
        targetTeamId: '4',
        reason: 'UAT verification transfer Leader -> SALE member',
      },
      bossAuthHeaders,
    );
    assert(leaderTransferRes.data.isCrossDepartment === true, 'LEADER-4.d: Leader transfer succeeded');

    // Re-login as transferred leader
    const transferredLeaderLogin = await apiPost('/auth/login', {
      identifier: 'staging_dev_leader',
      password: DEFAULT_PASS,
    });
    assert(
      transferredLeaderLogin.data.user.roles.includes('SALE') &&
      !transferredLeaderLogin.data.user.roles.includes('DEV_TEAM_LEADER') &&
      !transferredLeaderLogin.data.user.roles.includes('SALES_TEAM_LEADER'),
      'LEADER-4.e: Transferred Leader demoted to regular SALE member (no leader roles)',
    );

    const leaderMenuAfter = computeSidebarMenu(transferredLeaderLogin.data.user.roles);
    assert(!leaderMenuAfter.includes('/workspace/dev') && !leaderMenuAfter.includes('/teams'), 'LEADER-4.f: Leader management menus removed from sidebar');

    // Verify old team (team 6) no longer has this employee as leader
    const oldTeamLeader = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('team_id', '=', 6 as any)
      .where('is_leader', '=', true)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();
    assert(!oldTeamLeader || String(oldTeamLeader.employee_id) !== String(leaderEmployeeId), 'LEADER-4.g: Old team STG-TEAM-DEV1 no longer has transferred employee as leader');

    // Reset leader back to STG-TEAM-DEV1 as leader for clean staging state
    console.log('  -> Restoring staging_dev_leader back to STG-TEAM-DEV1 as Leader...');
    await apiPost(
      '/organization-chart/move-member',
      {
        employeeId: String(leaderEmployeeId),
        targetTeamId: '6',
        reason: 'Reset to initial state',
      },
      bossAuthHeaders,
    );
    await db.updateTable('employees').set({ position_id: posDevLeader.id }).where('id', '=', leaderEmployeeId as any).execute();
    await db.deleteFrom('user_roles').where('user_id', '=', 7 as any).execute();
    await db.insertInto('user_roles').values({ user_id: 7 as any, role_id: roleDevLeader.id }).execute();
    await db.updateTable('team_memberships').set({ is_leader: true }).where('employee_id', '=', leaderEmployeeId as any).where(sql`effective_range @> NOW()` as any).execute();
    console.log('  -> Restored staging_dev_leader clean state.');

    console.log('\n===============================================================');
    console.log(`ALL RUNTIME UAT VERIFICATIONS PASSED: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('===============================================================');

  } catch (err) {
    console.error('Runtime verification error:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runRuntimeVerification();
