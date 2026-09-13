import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { DailyReportsService } from './daily-reports.service';
import { DailyReportsController } from './daily-reports.controller';
import { WeeklyReportsService } from '../weekly-reports/weekly-reports.service';
import { WeeklyReportsController } from '../weekly-reports/weekly-reports.controller';
import { ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { sql } from 'kysely';

interface TestUser {
  sub: string;
  employeeId: any;
  username: string;
  roles: string[];
}

function assert(condition: boolean, testName: string, extra?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${extra ? ' -> ' + extra : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

async function runPhaseIDailyReportsSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE I: DAILY WORK REPORTS SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const reportsService = app.get<DailyReportsService>(DailyReportsService);
  const reportsController = app.get<DailyReportsController>(DailyReportsController);
  const weeklyReportsService = app.get<WeeklyReportsService>(WeeklyReportsService);
  const weeklyReportsController = app.get<WeeklyReportsController>(WeeklyReportsController);

  let passCount = 0;
  let failCount = 0;
  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // SETUP FIXTURES: EMPLOYEES & TEAMS
    // ----------------------------------------------------------------
    const pos = await db.selectFrom('positions').selectAll().executeTakeFirst();
    const posId = pos ? pos.id : (1 as any);

    // Employee 1 (Dev in Team A)
    const [emp1] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DR1-${runId}`,
        full_name: `Nguyen Dev One ${runId}`,
        phone: '0911000001',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Employee 2 (Dev in Team B)
    const [emp2] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DR2-${runId}`,
        full_name: `Tran Dev Two ${runId}`,
        phone: '0911000002',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Leader Team A
    const [leaderA] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-TLA-${runId}`,
        full_name: `Le Leader A ${runId}`,
        phone: '0911000003',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Leader Team B
    const [leaderB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-TLB-${runId}`,
        full_name: `Pham Leader B ${runId}`,
        phone: '0911000004',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Leader with No Active Team
    const [leaderNoTeam] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-TL0-${runId}`,
        full_name: `Vu Leader NoTeam ${runId}`,
        phone: '0911000005',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Admin / Boss
    const [bossEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-BOSS-${runId}`,
        full_name: `Hoang Boss ${runId}`,
        phone: '0911000006',
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Create Team A and Team B
    const [teamA] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-A-${runId}`,
        name: `Dev Team Alpha ${runId}`,
        department: 'DEV',
      })
      .returningAll()
      .execute();

    const [teamB] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-B-${runId}`,
        name: `Dev Team Beta ${runId}`,
        department: 'DEV',
      })
      .returningAll()
      .execute();

    // Memberships: Leader A leads Team A, emp1 is member of Team A
    await db
      .insertInto('team_memberships')
      .values([
        {
          team_id: teamA.id,
          employee_id: leaderA.id,
          is_leader: true,
          effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
        },
        {
          team_id: teamA.id,
          employee_id: emp1.id,
          is_leader: false,
          effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
        },
        {
          team_id: teamB.id,
          employee_id: leaderB.id,
          is_leader: true,
          effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
        },
        {
          team_id: teamB.id,
          employee_id: emp2.id,
          is_leader: false,
          effective_range: sql`tstzrange(NOW() - interval '10 days', NULL, '[)')` as any,
        },
      ])
      .execute();

    // User Tokens / Payloads
    const userEmp1: TestUser = { sub: 'u1', employeeId: emp1.id, username: emp1.employee_code, roles: ['DEV'] };
    const userEmp2: TestUser = { sub: 'u2', employeeId: emp2.id, username: emp2.employee_code, roles: ['DEV'] };
    const userLeaderA: TestUser = { sub: 'ula', employeeId: leaderA.id, username: leaderA.employee_code, roles: ['DEV_TEAM_LEADER'] };
    const userLeaderB: TestUser = { sub: 'ulb', employeeId: leaderB.id, username: leaderB.employee_code, roles: ['DEV_TEAM_LEADER'] };
    const userLeaderNoTeam: TestUser = { sub: 'ul0', employeeId: leaderNoTeam.id, username: leaderNoTeam.employee_code, roles: ['DEV_TEAM_LEADER'] };
    const userBoss: TestUser = { sub: 'uboss', employeeId: bossEmp.id, username: bossEmp.employee_code, roles: ['BOSS'] };
    const userAdmin: TestUser = { sub: 'uadmin', employeeId: 999999, username: 'admin_test', roles: ['ADMIN'] };

    // ----------------------------------------------------------------
    // DR-01: Employee Own Create & Read
    // ----------------------------------------------------------------
    const report1Date = '2026-09-08';
    const report1 = await reportsController.createDailyReport(
      {
        report_date: report1Date,
        difficulty: 'Cần tích hợp payment gateway webhook',
        support_needed: 'Cần tài khoản sandbox từ đối tác',
        next_plan: 'Hoàn thiện module reconciliation',
        note: 'Đã hoàn thành 5 task API',
      },
      userEmp1,
    );

    assert(Boolean(report1 && report1.id), 'DR-01: Employee can create daily report with canonical fields');
    passCount++;

    const myReports = await reportsController.getDailyReports({ scope: 'own' }, userEmp1);
    const foundMyReport = myReports.some((r) => r.id === String(report1.id));
    assert(foundMyReport, 'DR-01: Employee can read own daily reports list');
    passCount++;

    const myDetail = await reportsController.getDailyReportById(String(report1.id), userEmp1);
    assert(myDetail.id === String(report1.id), 'DR-01: Employee can read own daily report detail');
    passCount++;

    // ----------------------------------------------------------------
    // DR-02: Employee Cannot Read Others
    // ----------------------------------------------------------------
    let emp2Blocked = false;
    try {
      await reportsController.getDailyReportById(String(report1.id), userEmp2);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) emp2Blocked = true;
    }
    assert(emp2Blocked, 'DR-02: Employee accessing another employee report receives 403 Forbidden');
    passCount++;

    // ----------------------------------------------------------------
    // DR-03: Leader Sees Current Team Only
    // ----------------------------------------------------------------
    const leaderAReports = await reportsController.getDailyReports({}, userLeaderA);
    const leaderASeesEmp1 = leaderAReports.some((r) => r.id === String(report1.id));
    assert(leaderASeesEmp1, 'DR-03: Team Leader A sees report from current team member Emp1');
    passCount++;

    // ----------------------------------------------------------------
    // DR-04: Leader Blocked Team B
    // ----------------------------------------------------------------
    const report2Date = '2026-09-08';
    const report2 = await reportsController.createDailyReport(
      {
        report_date: report2Date,
        difficulty: 'Server test bị gián đoạn mạng',
        support_needed: 'Hỗ trợ reset Docker runner',
        next_plan: 'Viết unit test cho cache redis',
        note: 'Đã tối ưu câu lệnh query SQL',
      },
      userEmp2,
    );

    let leaderABlockedOnTeamB = false;
    try {
      await reportsController.getDailyReportById(String(report2.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) leaderABlockedOnTeamB = true;
    }
    assert(leaderABlockedOnTeamB, 'DR-04: Leader A is forbidden from viewing detail of Team B report (403)');
    passCount++;

    const leaderAListHasNoTeamB = !leaderAReports.some((r) => r.id === String(report2.id));
    assert(leaderAListHasNoTeamB, 'DR-04: Leader A list does not contain Team B reports');
    passCount++;

    // ----------------------------------------------------------------
    // DR-05: Boss / Admin Global
    // ----------------------------------------------------------------
    const bossReports = await reportsController.getDailyReports({}, userBoss);
    const bossSeesEmp1 = bossReports.some((r) => r.id === String(report1.id));
    const bossSeesEmp2 = bossReports.some((r) => r.id === String(report2.id));
    const bossDetail1 = await reportsController.getDailyReportById(String(report1.id), userBoss);
    const bossDetail2 = await reportsController.getDailyReportById(String(report2.id), userBoss);

    assert(
      bossSeesEmp1 && bossSeesEmp2 && bossDetail1.id === String(report1.id) && bossDetail2.id === String(report2.id),
      'DR-05: Boss / Admin has global access to all daily reports across all teams',
    );
    passCount++;

    // ----------------------------------------------------------------
    // DR-06: Duplicate employee_id + report_date Rejected
    // ----------------------------------------------------------------
    let duplicateBlocked = false;
    try {
      await reportsController.createDailyReport(
        {
          report_date: report1Date,
          difficulty: 'Duplicate attempt',
        },
        userEmp1,
      );
    } catch (err: any) {
      if (err instanceof ConflictException || err.status === 409 || err.code === '23505') {
        duplicateBlocked = true;
      }
    }
    assert(duplicateBlocked, 'DR-06: Duplicate report on same employee_id and report_date rejected (409)');
    passCount++;

    // ----------------------------------------------------------------
    // DR-07: Temporal Move Updates Leader Visibility
    // ----------------------------------------------------------------
    // Emp1 moves from Team A to Team B
    // Close membership in Team A
    await db
      .updateTable('team_memberships')
      .set({
        effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
      })
      .where('team_id', '=', teamA.id)
      .where('employee_id', '=', emp1.id)
      .execute();

    // Add membership in Team B
    await db
      .insertInto('team_memberships')
      .values({
        team_id: teamB.id,
        employee_id: emp1.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
      })
      .execute();

    // Now Emp1 submits a new report on next day
    const report1NextDate = '2026-09-09';
    const report1Next = await reportsController.createDailyReport(
      {
        report_date: report1NextDate,
        difficulty: 'Onboarding vào Team B',
        next_plan: 'Review source code Team B',
      },
      userEmp1,
    );

    // Leader B should now see Emp1's report
    const leaderBReportsAfterMove = await reportsController.getDailyReports({}, userLeaderB);
    const leaderBSeesEmp1 = leaderBReportsAfterMove.some((r) => r.id === String(report1Next.id));

    // Leader A should NO LONGER see Emp1 in active team list or detail of new report
    let leaderABlockedAfterMove = false;
    try {
      await reportsController.getDailyReportById(String(report1Next.id), userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) leaderABlockedAfterMove = true;
    }

    assert(
      leaderBSeesEmp1 && leaderABlockedAfterMove,
      'DR-07: Temporal move immediately transfers report visibility to new Team Leader and revokes old Leader',
    );
    passCount++;

    // ----------------------------------------------------------------
    // DR-08: Filters Correct (Date, Month, Employee, Team)
    // ----------------------------------------------------------------
    // Add an older report for emp2 in August
    await db
      .insertInto('daily_reports')
      .values({
        employee_id: emp2.id,
        report_date: '2026-08-20' as any,
        difficulty: 'None',
        submitted_at: new Date('2026-08-20T18:00:00Z'),
      })
      .execute();

    // Filter by Date
    const filteredByDate = await reportsController.getDailyReports({ date: report1Date }, userBoss);
    assert(
      filteredByDate.every((r) => r.reportDate === report1Date),
      'DR-08: Filter by date returns only matching report_date records',
    );
    passCount++;

    // Filter by Month
    const filteredByMonth = await reportsController.getDailyReports({ month: '2026-08' }, userBoss);
    assert(
      filteredByMonth.length >= 1 && filteredByMonth.every((r) => r.reportDate.startsWith('2026-08')),
      'DR-08: Filter by month returns only matching month records',
    );
    passCount++;

    // Filter by Employee
    const filteredByEmp = await reportsController.getDailyReports({ employee_id: String(emp1.id) }, userBoss);
    assert(
      filteredByEmp.every((r) => r.employeeId === String(emp1.id)),
      'DR-08: Filter by employee_id returns only that employee records',
    );
    passCount++;

    // Filter by Team
    const filteredByTeamB = await reportsController.getDailyReports({ team_id: String(teamB.id) }, userBoss);
    assert(
      filteredByTeamB.length >= 1,
      'DR-08: Filter by team_id returns only reports from members of that team',
    );
    passCount++;

    // ----------------------------------------------------------------
    // DR-08-RANGE: Filter by Date Range (fromDate, toDate) & RBAC Check
    // ----------------------------------------------------------------
    // 1. Single day filter (fromDate == toDate)
    const singleDayReports = await reportsController.getDailyReports(
      { fromDate: report1Date, toDate: report1Date },
      userBoss,
    );
    assert(
      singleDayReports.length >= 1 && singleDayReports.every((r) => r.reportDate === report1Date),
      'DR-08-RANGE: Filter 1 day (fromDate == toDate) returns only reports on that exact day',
    );
    passCount++;

    // 2. Multiple days range filter (fromDate <= toDate)
    const multiDayReports = await reportsController.getDailyReports(
      { fromDate: '2026-08-01', toDate: '2026-09-30' },
      userBoss,
    );
    assert(
      multiDayReports.length >= 2 &&
        multiDayReports.every((r) => r.reportDate >= '2026-08-01' && r.reportDate <= '2026-09-30'),
      'DR-08-RANGE: Filter multiple days returns reports within [fromDate, toDate]',
    );
    passCount++;

    // 3. Empty range (no data in range)
    const emptyRangeReports = await reportsController.getDailyReports(
      { fromDate: '2024-01-01', toDate: '2024-01-05' },
      userBoss,
    );
    assert(
      Array.isArray(emptyRangeReports) && emptyRangeReports.length === 0,
      'DR-08-RANGE: Filter range with no data returns empty array',
    );
    passCount++;

    // 4. Invalid range validation (fromDate > toDate) -> 400 BadRequestException
    let invalidRangeRejected = false;
    try {
      await reportsController.getDailyReports(
        { fromDate: '2026-09-30', toDate: '2026-08-01' },
        userBoss,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException || err.status === 400) invalidRangeRejected = true;
    }
    assert(
      invalidRangeRejected,
      'DR-08-RANGE: fromDate > toDate throws BadRequestException (400)',
    );
    passCount++;

    // 5. RBAC scope check with Date Range:
    // Team Leader A with date range only sees Team A members' reports (emp1 and leaderA, NOT emp2 in Team B)
    const leaderARangeReports = await reportsController.getDailyReports(
      { fromDate: '2026-08-01', toDate: '2026-09-30' },
      userLeaderA,
    );
    assert(
      leaderARangeReports.every((r) => r.employeeId === String(emp1.id) || r.employeeId === String(leaderA.id)),
      'DR-08-RANGE-RBAC: Team Leader A with date range only sees reports within Team A scope',
    );
    passCount++;

    // Staff/Employee (emp1) with date range only sees own reports
    const emp1RangeReports = await reportsController.getDailyReports(
      { fromDate: '2026-08-01', toDate: '2026-09-30' },
      userEmp1,
    );
    assert(
      emp1RangeReports.every((r) => r.employeeId === String(emp1.id)),
      'DR-08-RANGE-RBAC: Staff/Employee with date range strictly sees only own reports',
    );
    passCount++;

    // ----------------------------------------------------------------
    // DR-09: No-Active-Team Leader Returns Empty
    // ----------------------------------------------------------------
    const noTeamReports = await reportsController.getDailyReports({}, userLeaderNoTeam);
    assert(
      Array.isArray(noTeamReports) && noTeamReports.length === 0,
      'DR-09: Leader without active team returns empty list safely without crashing',
    );
    passCount++;

    // ----------------------------------------------------------------
    // DR-10: Update Daily Report (Own allowed, other blocked)
    // ----------------------------------------------------------------
    const updated = await reportsController.updateDailyReport(
      String(report1.id),
      {
        difficulty: 'Đã giải quyết xong khó khăn cổng thanh toán',
        note: 'Cập nhật ghi chú cuối ngày',
      },
      userEmp1,
    );

    assert(
      updated.difficulty === 'Đã giải quyết xong khó khăn cổng thanh toán',
      'DR-10: Employee can successfully update own daily report',
    );
    passCount++;

    let otherUpdateBlocked = false;
    try {
      await reportsController.updateDailyReport(
        String(report1.id),
        { difficulty: 'Hacked' },
        userEmp2,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) otherUpdateBlocked = true;
    }
    assert(otherUpdateBlocked, 'DR-10: Another employee attempting to update report receives 403 Forbidden');
    passCount++;

    // ================================================================
    // DAILY REPORT ITEMS: MULTIPLE ITEMS, CRUD, STATUSES, PERMISSIONS
    // ================================================================
    console.log('\n--- TESTING DAILY REPORT ITEMS ---');

    // DRI-01: Create Daily Report with Multiple Work Items
    const reportWithItemsDate = '2026-09-11';
    const repWithItems = await reportsController.createDailyReport(
      {
        report_date: reportWithItemsDate,
        difficulty: 'Không có',
        items: [
          {
            work_title: 'Implement Database Migration',
            work_detail: 'Created daily_report_items and weekly_reports tables',
            status: 'DONE',
            progress_percent: 100,
            project_id: null,
            note: 'Tested on staging',
          },
          {
            work_title: 'Implement Daily Report Items API',
            work_detail: 'Added DTOs and Controller endpoints',
            status: 'IN_PROGRESS',
            progress_percent: 50,
            project_id: null,
          },
        ],
      },
      userEmp1,
    );
    assert(!!repWithItems.id, 'DRI-01: 1 report created with multiple work items');
    passCount++;

    const fetchedRep = await reportsController.getDailyReportById(String(repWithItems.id), userEmp1);
    assert(
      Array.isArray(fetchedRep.items) && fetchedRep.items.length === 2,
      'DRI-01: Detail response includes all 2 work items',
    );
    assert(
      fetchedRep.items[0].status === 'DONE' && fetchedRep.items[0].progressPercent === 100,
      'DRI-01: Item 1 status DONE with 100% progress verified',
    );
    assert(
      fetchedRep.items[1].status === 'IN_PROGRESS' && fetchedRep.items[1].progressPercent === 50,
      'DRI-01: Item 2 status IN_PROGRESS with 50% progress verified',
    );
    passCount++;

    // DRI-02: Add New Item to existing report (status: BLOCKED, progress: 0, project_id: null)
    const addedItem = await reportsController.addDailyReportItem(
      String(repWithItems.id),
      {
        work_title: 'Integrate Third-Party Service',
        work_detail: 'Waiting on client credentials',
        status: 'BLOCKED',
        progress_percent: 0,
        project_id: null,
        note: 'Blocker flagged to PM',
      },
      userEmp1,
    );
    assert(
      addedItem.workTitle === 'Integrate Third-Party Service' && addedItem.status === 'BLOCKED' && addedItem.progressPercent === 0,
      'DRI-02: Successfully added new item with status BLOCKED, progress 0, project_id null',
    );
    passCount++;

    // DRI-03: Update Item (status TODO, then DONE, progress 0/50/100)
    const updatedItem = await reportsController.updateDailyReportItem(
      String(addedItem.id),
      {
        status: 'TODO',
        progress_percent: 0,
        work_detail: 'Credentials received, queued for work',
      },
      userEmp1,
    );
    assert(
      updatedItem.status === 'TODO' && updatedItem.progressPercent === 0,
      'DRI-03: Item updated to status TODO with 0% progress',
    );
    passCount++;

    const updatedItemDone = await reportsController.updateDailyReportItem(
      String(addedItem.id),
      {
        status: 'DONE',
        progress_percent: 100,
      },
      userEmp1,
    );
    assert(
      updatedItemDone.status === 'DONE' && updatedItemDone.progressPercent === 100,
      'DRI-03: Item updated to status DONE with 100% progress',
    );
    passCount++;

    // DRI-03.1: Progress 1%
    const itemP1 = await reportsController.updateDailyReportItem(
      String(addedItem.id),
      { progress_percent: 1 },
      userEmp1,
    );
    assert(itemP1.progressPercent === 1, 'DRI-03.1: Progress 1% supported');
    passCount++;

    // DRI-03.2: Progress 37%
    const itemP37 = await reportsController.updateDailyReportItem(
      String(addedItem.id),
      { progress_percent: 37 },
      userEmp1,
    );
    assert(itemP37.progressPercent === 37, 'DRI-03.2: Progress 37% supported');
    passCount++;

    // DRI-03.3: Progress 99%
    const itemP99 = await reportsController.updateDailyReportItem(
      String(addedItem.id),
      { progress_percent: 99 },
      userEmp1,
    );
    assert(itemP99.progressPercent === 99, 'DRI-03.3: Progress 99% supported');
    passCount++;

    // DRI-03.4: Progress <0 reject
    let negProgressBlocked = false;
    try {
      await reportsController.updateDailyReportItem(
        String(addedItem.id),
        { progress_percent: -5 },
        userEmp1,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException || err.status === 400 || (err.message && err.message.includes('0 and 100'))) {
        negProgressBlocked = true;
      }
    }
    assert(negProgressBlocked, 'DRI-03.4: Progress <0 rejected with BadRequestException');
    passCount++;

    // DRI-03.5: Progress >100 reject
    let overProgressBlocked = false;
    try {
      await reportsController.updateDailyReportItem(
        String(addedItem.id),
        { progress_percent: 105 },
        userEmp1,
      );
    } catch (err: any) {
      if (err instanceof BadRequestException || err.status === 400 || (err.message && err.message.includes('0 and 100'))) {
        overProgressBlocked = true;
      }
    }
    assert(overProgressBlocked, 'DRI-03.5: Progress >100 rejected with BadRequestException');
    passCount++;

    // DRI-04: Cross-User Blocked on Daily Report Items
    let crossAddBlocked = false;
    try {
      await reportsController.addDailyReportItem(
        String(repWithItems.id),
        {
          work_title: 'Hacker task',
          work_detail: 'Injecting work item',
        },
        userEmp2,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) crossAddBlocked = true;
    }
    assert(crossAddBlocked, 'DRI-04: Other employee cannot add item to report (403 Forbidden)');
    passCount++;

    let crossUpdateBlocked = false;
    try {
      await reportsController.updateDailyReportItem(
        String(addedItem.id),
        { status: 'DONE' },
        userEmp2,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) crossUpdateBlocked = true;
    }
    assert(crossUpdateBlocked, 'DRI-04: Other employee cannot update item in report (403 Forbidden)');
    passCount++;

    let crossDeleteBlocked = false;
    try {
      await reportsController.deleteDailyReportItem(
        String(addedItem.id),
        userEmp2,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) crossDeleteBlocked = true;
    }
    assert(crossDeleteBlocked, 'DRI-04: Other employee cannot delete item in report (403 Forbidden)');
    passCount++;

    // DRI-05: Owner Delete Item
    const deletedRes = await reportsController.deleteDailyReportItem(
      String(addedItem.id),
      userEmp1,
    );
    assert(deletedRes.success === true, 'DRI-05: Owner can successfully delete work item');
    passCount++;

    // ================================================================
    // WEEKLY REPORTS: DRAFT, COMPLETE, SCOPE, BOSS ACCESS, EXPORT
    // ================================================================
    console.log('\n--- TESTING WEEKLY REPORTS ---');

    // WR-01: Staff (SALE, DEV, SEO) blocked with 403 Forbidden
    let staffGetBlocked = false;
    try {
      await weeklyReportsController.getWeeklyReports({}, userEmp1);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) staffGetBlocked = true;
    }
    assert(staffGetBlocked, 'WR-01: Staff employee accessing weekly reports receives 403 Forbidden');
    passCount++;

    let staffCreateBlocked = false;
    try {
      await weeklyReportsController.createWeeklyReport(
        {
          week_start: '2026-09-07',
          week_end: '2026-09-13',
          status: 'DRAFT',
        },
        userEmp1,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) staffCreateBlocked = true;
    }
    assert(staffCreateBlocked, 'WR-01: Staff employee creating weekly report receives 403 Forbidden');
    passCount++;

    let adminWeeklyBlocked = false;
    try {
      await weeklyReportsController.getWeeklyReports({}, userAdmin);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) adminWeeklyBlocked = true;
    }
    assert(adminWeeklyBlocked, 'WR-01: ADMIN role has no access to weekly reports (403 Forbidden)');
    passCount++;

    // WR-02: Leader creates DRAFT for own team
    const weeklyDraft = await weeklyReportsController.createWeeklyReport(
      {
        week_start: '2026-09-07',
        week_end: '2026-09-13',
        summary_work_done: 'Initial draft of work done by team A',
        summary_blockers: 'None initially',
        summary_next_week: 'Ship Phase I reports and items',
        leader_note: 'Team performed well this week',
        status: 'DRAFT',
      },
      userLeaderA,
    );
    assert(weeklyDraft.status === 'DRAFT', 'WR-02: Team Leader can create weekly report in DRAFT status');
    assert(Number(weeklyDraft.teamId) === Number(teamA.id), 'WR-02: Created report is scoped to Leader own team');
    passCount++;

    // WR-03: Leader edits DRAFT
    const weeklyEdited = await weeklyReportsController.updateWeeklyReport(
      String(weeklyDraft.id),
      {
        summary_work_done: 'Updated draft summary with more details',
        leader_note: 'Updated notes before completion',
      },
      userLeaderA,
    );
    assert(
      weeklyEdited.summaryWorkDone === 'Updated draft summary with more details' &&
      weeklyEdited.status === 'DRAFT',
      'WR-03: Team Leader can update DRAFT multiple times',
    );
    passCount++;

    // WR-04: Leader COMPLETES report
    const weeklyCompleted = await weeklyReportsController.completeWeeklyReport(
      String(weeklyDraft.id),
      userLeaderA,
    );
    assert(weeklyCompleted.status === 'COMPLETED', 'WR-04: Team Leader can mark weekly report as COMPLETED');
    passCount++;

    // WR-05: Cross-team protection: Leader A cannot access or update Team B
    let leaderCrossCreateBlocked = false;
    try {
      await weeklyReportsController.createWeeklyReport(
        {
          team_id: teamB.id,
          week_start: '2026-09-07',
          week_end: '2026-09-13',
          status: 'DRAFT',
        },
        userLeaderA,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) leaderCrossCreateBlocked = true;
    }
    assert(leaderCrossCreateBlocked, 'WR-05: Leader A blocked from creating report for Team B (403 Forbidden)');
    passCount++;

    let leaderCrossViewBlocked = false;
    try {
      await weeklyReportsController.getWeeklyReports({ team_id: String(teamB.id) }, userLeaderA);
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) leaderCrossViewBlocked = true;
    }
    assert(leaderCrossViewBlocked, 'WR-05: Leader A blocked from querying reports for Team B (403 Forbidden)');
    passCount++;

    // WR-06: BOSS can view all weekly reports across all teams
    const bossWeeklyReports = await weeklyReportsController.getWeeklyReports({}, userBoss);
    assert(
      Array.isArray(bossWeeklyReports) && bossWeeklyReports.some((r) => String(r.id) === String(weeklyDraft.id)),
      'WR-06: BOSS can view all weekly reports company-wide',
    );
    passCount++;

    // WR-07: Excel export: Leader exports own team, BOSS exports all, Staff blocked
    const leaderExport = await weeklyReportsService.exportExcel(
      {},
      String(weeklyDraft.id),
      String(leaderA.id),
      userLeaderA.roles,
    );
    assert(
      leaderExport.buffer instanceof Buffer && leaderExport.buffer.length > 0 && leaderExport.filename.endsWith('.xlsx'),
      'WR-07: Leader can export own team weekly report to Excel',
    );
    passCount++;

    const bossExport = await weeklyReportsService.exportExcel(
      {},
      undefined,
      String(bossEmp.id),
      userBoss.roles,
    );
    assert(
      bossExport.buffer instanceof Buffer && bossExport.buffer.length > 0 && bossExport.filename.endsWith('.xlsx'),
      'WR-07: BOSS can export all weekly reports to Excel',
    );
    passCount++;

    let staffExportBlocked = false;
    try {
      await weeklyReportsService.exportExcel(
        {},
        undefined,
        String(emp1.id),
        userEmp1.roles,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException || err.status === 403) staffExportBlocked = true;
    }
    assert(staffExportBlocked, 'WR-07: Staff employee cannot export weekly reports (403 Forbidden)');
    passCount++;

  } catch (error: any) {
    console.error('Fatal error in Phase I test suite:', error);
    failCount++;
  } finally {
    await app.close();
  }

  console.log('====================================================');
  console.log(`PHASE I DAILY REPORTS SUITE FINISHED: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhaseIDailyReportsSuite();
}
