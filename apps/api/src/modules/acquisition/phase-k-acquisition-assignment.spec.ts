import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { AcquisitionService } from './acquisition.service';
import { AcquisitionController } from './acquisition.controller';
import { LeadsService } from '../leads/leads.service';
import { LeadsController } from '../leads/leads.controller';
import { ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';

function assert(condition: boolean, testName: string, extra?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${extra ? ' -> ' + extra : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

async function runPhaseKAcquisitionSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE K: ACQUISITION / MARKET ASSIGNMENT SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get<KyselyService>(KyselyService);
  const db = kysely.db;
  const acqService = app.get<AcquisitionService>(AcquisitionService);
  const acqController = app.get<AcquisitionController>(AcquisitionController);
  const leadsService = app.get<LeadsService>(LeadsService);
  const leadsController = app.get<LeadsController>(LeadsController);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------------------
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirst();
    const leaderPos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALES_LEADER').executeTakeFirst();
    const posId = salePos ? salePos.id : (1 as any);
    const leaderPosId = leaderPos ? leaderPos.id : posId;

    // 1. Employees: Sale A, Sale B, Sale C, Leader A, Leader B, Creator Emp
    const [saleA] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-SALE-A-${runId}`,
        full_name: `Sale A ${runId}`,
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [saleB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-SALE-B-${runId}`,
        full_name: `Sale B ${runId}`,
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [saleC] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-SALE-C-${runId}`,
        full_name: `Sale C ${runId}`,
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [creatorEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-CREATOR-${runId}`,
        full_name: `Creator Marketing ${runId}`,
        position_id: posId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [leaderA] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-LEADER-A-${runId}`,
        full_name: `Sales Leader A ${runId}`,
        position_id: leaderPosId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [leaderB] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-K-LEADER-B-${runId}`,
        full_name: `Sales Leader B ${runId}`,
        position_id: leaderPosId,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // 2. Teams: Sales Team A (Leader A + Sale A), Sales Team B (Leader B + Sale B)
    const [teamA] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-A-${runId}`,
        name: `Sales Team A ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    const [teamB] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-B-${runId}`,
        name: `Sales Team B ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    await db.insertInto('team_memberships').values([
      {
        team_id: teamA.id,
        employee_id: leaderA.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamA.id,
        employee_id: saleA.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamB.id,
        employee_id: leaderB.id,
        is_leader: true,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
      {
        team_id: teamB.id,
        employee_id: saleB.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW() - INTERVAL '10 days', NULL, '[]')` as any,
      },
    ]).execute();

    // User contexts
    const userBoss: any = { sub: String(leaderA.id), employeeId: leaderA.id, roles: ['BOSS'], permissions: ['LEAD_VIEW_ALL'] };
    const userAdmin: any = { sub: String(leaderA.id), employeeId: leaderA.id, roles: ['ADMIN'], permissions: ['LEAD_VIEW_ALL'] };
    const userLeaderA: any = { sub: String(leaderA.id), employeeId: leaderA.id, roles: ['SALES_TEAM_LEADER'] };
    const userLeaderB: any = { sub: String(leaderB.id), employeeId: leaderB.id, roles: ['SALES_TEAM_LEADER'] };
    const userSaleA: any = { sub: String(saleA.id), employeeId: saleA.id, roles: ['SALE'] };
    const userSaleB: any = { sub: String(saleB.id), employeeId: saleB.id, roles: ['SALE'] };

    // ----------------------------------------------------------------
    // K-01: Canonical Platforms and Channels mapping
    // ----------------------------------------------------------------
    const platforms = await acqController.getPlatforms();
    const channels = await acqController.getChannels();

    const expectedPlatforms = ['FACEBOOK', 'TIKTOK', 'GOOGLE', 'WEBSITE', 'ZALO'];
    const expectedChannels = ['ORGANIC', 'PAID_ADS', 'REFERRAL', 'DIRECT', 'MANUAL'];

    for (const ep of expectedPlatforms) {
      assert(
        platforms.some((p) => p.code === ep),
        `K-01: Canonical Platform [${ep}] exists in database`,
      );
    }

    for (const ec of expectedChannels) {
      assert(
        channels.some((c) => c.code === ec),
        `K-01: Canonical Channel [${ec}] exists in database`,
      );
    }

    const fbPlatform = platforms.find((p) => p.code === 'FACEBOOK')!;
    const ggPlatform = platforms.find((p) => p.code === 'GOOGLE')!;
    const webPlatform = platforms.find((p) => p.code === 'WEBSITE')!;

    const paidChannel = channels.find((c) => c.code === 'PAID_ADS')!;
    const organicChannel = channels.find((c) => c.code === 'ORGANIC')!;
    const manualChannel = channels.find((c) => c.code === 'MANUAL')!;

    // Reset any pre-existing market assignments to ensure test isolation across test runs
    await db.updateTable('sale_market_assignments').set({ is_active: false }).execute();

    // ----------------------------------------------------------------
    // K-02: MANUAL != ORGANIC (Không được gom Lead nhập tay thành Organic)
    // ----------------------------------------------------------------
    assert(
      manualChannel.id !== organicChannel.id && manualChannel.code !== organicChannel.code,
      'K-02: MANUAL channel is strictly distinct and separate from ORGANIC channel',
    );

    const manualLead = await leadsService.createLead({
      fullName: `Manual Lead Customer ${runId}`,
      phone: '0901234567',
      channelId: String(manualChannel.id),
      creatorEmployeeId: String(creatorEmp.id),
    });

    assert(
      String(manualLead.channel_id) === String(manualChannel.id) &&
        String(manualLead.channel_id) !== String(organicChannel.id),
      'K-02: Lead created via MANUAL channel is not classified as ORGANIC',
    );

    // ----------------------------------------------------------------
    // K-03: Lead được gán đúng Sale khi chỉ có 1 valid active assignment
    // ----------------------------------------------------------------
    // Cấu hình: FACEBOOK + PAID_ADS -> Sale A
    const assignment1 = await acqService.assignMarket(
      String(saleA.id),
      String(fbPlatform.id),
      String(paidChannel.id),
    );
    assert(
      assignment1 && assignment1.is_active === true,
      'K-03: Market Assignment FACEBOOK + PAID_ADS -> Sale A created',
    );

    // Tạo lead có nguồn FACEBOOK + PAID_ADS
    const autoAssignedLead = await leadsService.createLead({
      fullName: `Facebook Ads Customer ${runId}`,
      phone: '0909888777',
      platformId: String(fbPlatform.id),
      channelId: String(paidChannel.id),
      creatorEmployeeId: String(creatorEmp.id),
    });

    assert(
      String(autoAssignedLead.assigned_sale_id) === String(saleA.id),
      'K-03: Lead is automatically assigned to Sale A via exact single active Market Assignment',
    );

    // Kiểm tra có ghi nhận lịch sử lead_assignment_history
    const historyRows = await db
      .selectFrom('lead_assignment_history')
      .selectAll()
      .where('lead_id', '=', autoAssignedLead.id)
      .execute();
    assert(
      historyRows.length === 1 && String(historyRows[0].to_sale_id) === String(saleA.id),
      'K-03: Auto assignment is logged in lead_assignment_history with audit trace',
    );

    // ----------------------------------------------------------------
    // K-04: Sale không xem Lead ngoài ownership
    // ----------------------------------------------------------------
    // Sale A xem list -> thấy lead của Sale A
    const leadsSaleA = await leadsController.getLeads(userSaleA);
    assert(
      leadsSaleA.data.some((l) => l.id === String(autoAssignedLead.id)),
      'K-04: Sale A can see own assigned lead in list',
    );

    // Sale B xem list -> KHÔNG thấy lead của Sale A
    const leadsSaleB = await leadsController.getLeads(userSaleB);
    assert(
      !leadsSaleB.data.some((l) => l.id === String(autoAssignedLead.id)),
      'K-04: Sale B cannot see lead owned by Sale A in list',
    );

    // Sale B truy cập detail lead của Sale A -> 403 Forbidden
    let caughtSaleBDetail = false;
    try {
      await leadsController.getLeadById(userSaleB, String(autoAssignedLead.id));
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleBDetail = true;
    }
    assert(
      caughtSaleBDetail,
      'K-04: Sale B accessing out-of-scope lead owned by Sale A receives 403 Forbidden',
    );

    // ----------------------------------------------------------------
    // K-05: Sales Leader chỉ thấy current team
    // ----------------------------------------------------------------
    // Leader A lead Team A (chứa Sale A) -> thấy lead của Sale A
    const leadsLeaderA = await leadsController.getLeads(userLeaderA);
    assert(
      leadsLeaderA.data.some((l) => l.id === String(autoAssignedLead.id)),
      'K-05: Sales Leader Team A sees lead of member Sale A',
    );

    const leaderADetail = await leadsController.getLeadById(userLeaderA, String(autoAssignedLead.id));
    assert(
      leaderADetail.id === String(autoAssignedLead.id),
      'K-05: Sales Leader Team A can view detail of member Sale A lead',
    );

    // ----------------------------------------------------------------
    // K-06: Sales Leader Team A không thấy Team B
    // ----------------------------------------------------------------
    // Gán 1 lead cho Sale B (thuộc Team B)
    const leadB = await leadsService.createLead({
      fullName: `Customer of Team B ${runId}`,
      phone: '0933221100',
      assignedSaleId: String(saleB.id),
    });

    // Leader A xem list -> KHÔNG thấy lead của Team B
    assert(
      !leadsLeaderA.data.some((l) => l.id === String(leadB.id)),
      'K-06: Sales Leader Team A list excludes leads of Team B',
    );

    // Leader A xem detail lead của Team B -> 403 Forbidden
    let caughtLeaderAOnB = false;
    try {
      await leadsController.getLeadById(userLeaderA, String(leadB.id));
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtLeaderAOnB = true;
    }
    assert(
      caughtLeaderAOnB,
      'K-06: Sales Leader Team A accessing lead of Team B receives 403 Forbidden',
    );

    // ----------------------------------------------------------------
    // K-07: Deactivate/end assignment cập nhật scope đúng qua is_active
    // ----------------------------------------------------------------
    // Vô hiệu hóa assignment FACEBOOK + PAID_ADS của Sale A
    await acqController.deactivateMarketAssignment(String(assignment1.id), userBoss);

    const updatedAsm = await db
      .selectFrom('sale_market_assignments')
      .select('is_active')
      .where('id', '=', assignment1.id)
      .executeTakeFirst();
    assert(
      updatedAsm?.is_active === false,
      'K-07: Market Assignment successfully deactivated (is_active = false)',
    );

    // Tạo lead mới cùng nguồn FACEBOOK + PAID_ADS
    const leadAfterDeactivate = await leadsService.createLead({
      fullName: `Lead After Deactivation ${runId}`,
      phone: '0977665544',
      platformId: String(fbPlatform.id),
      channelId: String(paidChannel.id),
    });

    // Không còn active assignment -> lead không được gán cho Sale A nữa
    assert(
      leadAfterDeactivate.assigned_sale_id === null,
      'K-07: Lead generated after assignment deactivation remains unassigned (assigned_sale_id = null)',
    );

    // ----------------------------------------------------------------
    // K-08: Creator attribution không biến thành commission/KPI owner
    // ----------------------------------------------------------------
    // Lead tạo bởi creatorEmp nhưng gán cho saleA
    const attrLead = await leadsService.createLead({
      fullName: `Attributed Lead ${runId}`,
      creatorEmployeeId: String(creatorEmp.id),
      assignedSaleId: String(saleA.id),
    });

    assert(
      String(attrLead.creator_employee_id) === String(creatorEmp.id) &&
        String(attrLead.assigned_sale_id) === String(saleA.id),
      'K-08: Lead retains creator_employee_id as attribution while assigned_sale_id is owner',
    );

    // ----------------------------------------------------------------
    // K-09: ADMIN / BOSS global và cấu hình Market Assignment; Sale bị chặn 403
    // ----------------------------------------------------------------
    // Boss cấu hình: GOOGLE + PAID_ADS -> Sale B
    const bossCreatedAsm = await acqController.assignMarket(
      String(saleB.id),
      String(ggPlatform.id),
      String(paidChannel.id),
      userBoss,
    );
    assert(
      bossCreatedAsm && String(bossCreatedAsm.employee_id) === String(saleB.id),
      'K-09: BOSS successfully configures Market Assignment',
    );

    // Admin có global list access
    const adminAssignments = await acqController.getMarketAssignments(userAdmin);
    assert(
      adminAssignments.length >= 2,
      'K-09: ADMIN maintains global visibility of all market assignments',
    );

    // Sale thường cố tình cấu hình Market Assignment -> 403 Forbidden
    let caughtSaleMutation = false;
    try {
      await acqController.assignMarket(
        String(saleC.id),
        String(webPlatform.id),
        String(organicChannel.id),
        userSaleA,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleMutation = true;
    }
    assert(
      caughtSaleMutation,
      'K-09: Normal SALE calling assignMarket receives 403 Forbidden',
    );

    // ----------------------------------------------------------------
    // K-10: Xử lý nguồn chuẩn: Không assignment -> null; Nhiều Sale cùng active -> Report gap
    // ----------------------------------------------------------------
    // K-10.1: Không có assignment nào cho WEBSITE + MANUAL
    const leadNoAsm = await leadsService.createLead({
      fullName: `No Assignment Lead ${runId}`,
      platformId: String(webPlatform.id),
      channelId: String(manualChannel.id),
    });
    assert(
      leadNoAsm.assigned_sale_id === null && leadNoAsm.status === 'NEW' && leadNoAsm.assignmentGap === true,
      'K-10: No active assignment creates unassigned Lead with status NEW and reports assignmentGap',
    );

    // K-10.2: Cấu hình 2 Sale cùng active cho WEBSITE + ORGANIC (Sale A & Sale C)
    await acqService.assignMarket(String(saleA.id), String(webPlatform.id), String(organicChannel.id));
    await acqService.assignMarket(String(saleC.id), String(webPlatform.id), String(organicChannel.id));

    const leadMultipleAsm = await leadsService.createLead({
      fullName: `Multiple Sales Active Lead ${runId}`,
      platformId: String(webPlatform.id),
      channelId: String(organicChannel.id),
    });

    assert(
      leadMultipleAsm.assigned_sale_id === null &&
        leadMultipleAsm.assignmentGap === true &&
        leadMultipleAsm.assignmentGapReason === 'MULTIPLE_ACTIVE_SALES_FOUND',
      'K-10: Multiple active sales for same platform+channel reports gap and does NOT pick randomly',
    );

    // K-10.3: Analytics overview & distribution endpoints return valid metrics
    const overview = await acqController.getOverview(userBoss);
    assert(
      overview.totalLeads >= 4 && Array.isArray(overview.platforms) && Array.isArray(overview.channels),
      'K-10: Acquisition overview calculates accurate aggregate lead counts and platform/channel breakdowns',
    );

    const distribution = await acqController.getDistribution(userBoss);
    assert(
      Array.isArray(distribution) && distribution.length >= 2,
      'K-10: Lead distribution by sale calculates workload and conversion metrics',
    );

    // ----------------------------------------------------------------
    // K-11: CREATE LEAD + assignedSaleId SECURITY
    // ----------------------------------------------------------------
    // K-11.1: Sale A cố tình truyền assignedSaleId của Sale B -> Phải bị chặn 403 Forbidden
    let caughtSaleArbitraryAssign = false;
    try {
      await leadsController.createLead(userSaleA, {
        fullName: `Malicious Sale Assign Lead ${runId}`,
        assignedSaleId: String(saleB.id),
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleArbitraryAssign = true;
    }
    assert(
      caughtSaleArbitraryAssign,
      'K-11: SALE attempting to assign lead to Sale B via assignedSaleId is blocked with 403 Forbidden',
    );

    // K-11.2: Sale A tự gán chính mình (self-assignment) -> Thành công
    const selfAssignedLead = await leadsController.createLead(userSaleA, {
      fullName: `Self Assigned Lead ${runId}`,
      assignedSaleId: String(saleA.id),
    });
    assert(
      selfAssignedLead && String(selfAssignedLead.assigned_sale_id) === String(saleA.id),
      'K-11: SALE self-assignment to own employee ID succeeds',
    );

    // K-11.3: Sale A gọi manual assignLead sang Sale B -> Phải bị chặn 403 Forbidden
    let caughtSaleManualAssign = false;
    try {
      await leadsController.assignLead(userSaleA, String(selfAssignedLead.id), {
        toSaleId: String(saleB.id),
        reason: 'Unauthorized sale reassignment',
      });
    } catch (err: any) {
      if (err instanceof ForbiddenException) caughtSaleManualAssign = true;
    }
    assert(
      caughtSaleManualAssign,
      'K-11: Normal SALE cannot call manual assignLead (blocked with 403 Forbidden)',
    );

    // ----------------------------------------------------------------
    // K-12: Sales Leader Team A overview không chứa Team B
    // ----------------------------------------------------------------
    // Leader A gọi getOverview
    const leaderAOverview = await acqController.getOverview(userLeaderA);
    // Tạo thêm 1 lead riêng cho Sale B (Team B)
    await leadsService.createLead({
      fullName: `Team B Lead Isolated ${runId}`,
      assignedSaleId: String(saleB.id),
      platformId: String(ggPlatform.id),
      channelId: String(paidChannel.id),
    });

    const leaderAOverviewAfterTeamB = await acqController.getOverview(userLeaderA);
    assert(
      leaderAOverviewAfterTeamB.totalLeads === leaderAOverview.totalLeads,
      'K-12: Sales Leader Team A overview total leads does NOT include Team B leads',
    );
    assert(
      leaderAOverviewAfterTeamB.unassignedLeads === 0,
      'K-12: Sales Leader Team A overview does not expose company-wide unassigned leads pool',
    );

    // ----------------------------------------------------------------
    // K-13: Sale A distribution/overview không lộ số liệu Sale B
    // ----------------------------------------------------------------
    // Sale A xem distribution
    const saleADistribution = await acqController.getDistribution(userSaleA);
    assert(
      saleADistribution.length === 1 && String(saleADistribution[0].employeeId) === String(saleA.id),
      'K-13: Sale A distribution strictly contains only Sale A record (Sale B is excluded)',
    );

    // Sale A xem overview: chỉ tính leads của Sale A
    const saleAOverview = await acqController.getOverview(userSaleA);
    const saleALeadsCount = Number(saleADistribution[0].assignedLeadsCount);
    assert(
      saleAOverview.totalLeads === saleALeadsCount && saleAOverview.unassignedLeads === 0,
      'K-13: Sale A overview reflects only own assigned leads and zero unassigned leakage',
    );

    console.log('====================================================');
    console.log('PHASE K ACQUISITION SUITE FINISHED: ALL TESTS PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

runPhaseKAcquisitionSuite().catch((err) => {
  console.error('❌ Phase K test suite error:', err);
  process.exit(1);
});
