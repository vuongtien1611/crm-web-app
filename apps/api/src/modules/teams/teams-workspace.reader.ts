import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';
import { KyselyService } from '../../database/kysely.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

export interface TeamRecentProjectItem {
  id: string | number;
  project_name: string;
  status: string;
  materialized_progress_percent: number | string;
  created_at: Date | string;
  order_code: string;
  company_name: string;
  service_name: string;
  primaryAssignees: string[];
  supportAssignees: string[];
}

@Injectable()
export class TeamsWorkspaceReader {
  constructor(private readonly kysely: KyselyService) {}

  async getCurrentLedTeam(employeeId: string | number) {
    return await this.kysely.db.selectFrom('team_memberships').innerJoin('teams', 'teams.id', 'team_memberships.team_id').selectAll('teams').where('team_memberships.employee_id', '=', employeeId as any).where('team_memberships.is_leader', '=', true).where(sql`team_memberships.effective_range @> NOW()` as any).executeTakeFirst();
  }

  async getCurrentTeamMembers(teamId: string | number) {
    return await this.kysely.db.selectFrom('team_memberships').innerJoin('employees', 'employees.id', 'team_memberships.employee_id').leftJoin('positions', 'positions.id', 'employees.position_id').selectAll('employees').select(['team_memberships.id as membership_id', 'team_memberships.is_leader', 'team_memberships.effective_range', 'positions.name as position_name']).where('team_memberships.team_id', '=', teamId as any).where(sql`team_memberships.effective_range @> NOW()` as any).execute();
  }

  // -------------------------------------------------------------
  // SALES WORKSPACE AGGREGATE SUMMARY (REAL DATABASE TOTALS)
  // -------------------------------------------------------------
  async getSalesWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    // 1. Resolve Team
    let team: any;
    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'SALES')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('Bạn không có quyền truy cập Sales Workspace');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm Sales nào bạn đang phụ trách');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalLeads: 0,
          openDealsCount: 0,
          wonDealsCount: 0,
          wonRevenue: 0,
          totalCommission: 0,
        },
        members: [],
      };
    }

    // 3. Real Total Leads (DB COUNT)
    const leadsRes = await db
      .selectFrom('leads')
      .select(sql<number>`count(id)`.as('total'))
      .where('assigned_sale_id', 'in', memberIds as any)
      .executeTakeFirst();
    const totalLeads = Number(leadsRes?.total || 0);

    // 4. Real Open Deals (DB COUNT)
    const openDealsRes = await db
      .selectFrom('deals')
      .select(sql<number>`count(id)`.as('total'))
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', 'in', ['OPEN', 'NEGOTIATING'])
      .executeTakeFirst();
    const openDealsCount = Number(openDealsRes?.total || 0);

    // 5. Real Won Deals in Target Period (DB COUNT & SUM)
    const wonDealsRes = await db
      .selectFrom('deals')
      .select([
        sql<number>`count(id)`.as('won_count'),
        sql<number>`coalesce(sum(expected_value), 0)`.as('won_revenue'),
      ])
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', '=', 'WON')
      .where(sql`to_char(won_at, 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();
    const wonDealsCount = Number(wonDealsRes?.won_count || 0);
    const wonRevenue = Number(wonDealsRes?.won_revenue || 0);

    // 6. Real Commissions in Target Period (DB SUM)
    const commRes = await db
      .selectFrom('commissions')
      .select(sql<number>`coalesce(sum(calculated_amount), 0)`.as('total'))
      .where('beneficiary_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['CALCULATED', 'APPROVED', 'ADJUSTED', 'IN_PAYROLL', 'PAID', 'RELEASED'])
      .executeTakeFirst();
    const totalCommission = Number(commRes?.total || 0);

    // 7. Member-level aggregate counts (GROUP BY)
    const memberLeadsCounts = await db
      .selectFrom('leads')
      .select(['assigned_sale_id', sql<number>`count(id)`.as('count')])
      .where('assigned_sale_id', 'in', memberIds as any)
      .groupBy('assigned_sale_id')
      .execute();
    const leadsMap = new Map<string, number>();
    for (const row of memberLeadsCounts) {
      if (row.assigned_sale_id) {
        leadsMap.set(String(row.assigned_sale_id), Number(row.count));
      }
    }

    const memberDealsCounts = await db
      .selectFrom('deals')
      .select(['assigned_sale_id', sql<number>`count(id)`.as('count')])
      .where('assigned_sale_id', 'in', memberIds as any)
      .groupBy('assigned_sale_id')
      .execute();
    const dealsMap = new Map<string, number>();
    for (const row of memberDealsCounts) {
      if (row.assigned_sale_id) {
        dealsMap.set(String(row.assigned_sale_id), Number(row.count));
      }
    }

    const memberWonCounts = await db
      .selectFrom('deals')
      .select([
        'assigned_sale_id',
        sql<number>`count(id)`.as('count'),
        sql<number>`coalesce(sum(expected_value), 0)`.as('revenue'),
      ])
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', '=', 'WON')
      .where(sql`to_char(won_at, 'YYYY-MM') = ${period}` as any)
      .groupBy('assigned_sale_id')
      .execute();
    const wonMap = new Map<string, { count: number; revenue: number }>();
    for (const row of memberWonCounts) {
      if (row.assigned_sale_id) {
        wonMap.set(String(row.assigned_sale_id), {
          count: Number(row.count),
          revenue: Number(row.revenue),
        });
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const won = wonMap.get(empId) || { count: 0, revenue: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        leadsCount: leadsMap.get(empId) || 0,
        dealsCount: dealsMap.get(empId) || 0,
        wonDealsCount: won.count,
        wonRevenue: won.revenue,
      };
    });

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalLeads,
        openDealsCount,
        wonDealsCount,
        wonRevenue,
        totalCommission,
      },
      members: membersSummary,
    };
  }

  // -------------------------------------------------------------
  // GET DEV WORKSPACE SUMMARY
  // -------------------------------------------------------------
  async getDevWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    let team: any = null;

    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'DEV')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('User missing employee ID');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm Kỹ thuật (DEV) nào bạn đang phụ trách');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalProjects: 0,
          activeProjectsCount: 0,
          blockedProjectsCount: 0,
          completedProjectsCount: 0,
          reviewAcceptanceCount: 0,
          totalAcceptances: 0,
          totalKpiPoints: 0,
        },
        tasksSummary: {
          todo: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
          total: 0,
        },
        members: [],
        recentProjects: [],
      };
    }

    // 3. Subquery / Join for Projects of current members
    // Projects where member has an active assignment
    const teamProjectsQuery = db
      .selectFrom('projects as p')
      .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true);

    const teamProjectRows = await teamProjectsQuery
      .select(sql<string>`distinct p.id`.as('project_id'))
      .execute();
    const teamProjectIds = teamProjectRows.map((r) => String(r.project_id));

    let totalProjects = 0;
    let activeProjectsCount = 0;
    let blockedProjectsCount = 0;
    let completedProjectsCount = 0;
    let reviewAcceptanceCount = 0;
    let totalAcceptances = 0;

    if (teamProjectIds.length > 0) {
      const projectStatusCounts = await db
        .selectFrom('projects as p')
        .select(['p.status', sql<number>`count(p.id)`.as('count')])
        .where('p.id', 'in', teamProjectIds as any)
        .groupBy('p.status')
        .execute();

      for (const row of projectStatusCounts) {
        const count = Number(row.count);
        totalProjects += count;
        if (['ASSIGNED', 'READY_TO_START', 'IN_PROGRESS'].includes(row.status)) {
          activeProjectsCount += count;
        } else if (
          ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL'].includes(row.status)
        ) {
          blockedProjectsCount += count;
        } else if (['REVIEW', 'ACCEPTANCE'].includes(row.status)) {
          reviewAcceptanceCount += count;
        } else if (row.status === 'COMPLETED') {
          completedProjectsCount += count;
        }
      }

      const acceptancesRes = await db
        .selectFrom('project_acceptances')
        .select(sql<number>`count(id)`.as('total'))
        .where('project_id', 'in', teamProjectIds as any)
        .executeTakeFirst();
      totalAcceptances = Number(acceptancesRes?.total || 0);
    }

    // 4. Tasks Summary (tasks assigned to team members OR in team projects)
    const taskStatusCounts = await db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .select(['pt.status', sql<number>`count(pt.id)`.as('count')])
      .where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', 'in', memberIds as any),
          teamProjectIds.length > 0
            ? eb('pm.project_id', 'in', teamProjectIds as any)
            : (sql`1 = 0` as any),
        ]),
      )
      .groupBy('pt.status')
      .execute();

    let tasksTodo = 0;
    let tasksInProgress = 0;
    let tasksBlocked = 0;
    let tasksDone = 0;

    for (const row of taskStatusCounts) {
      const count = Number(row.count);
      if (row.status === 'TODO') tasksTodo += count;
      else if (row.status === 'IN_PROGRESS') tasksInProgress += count;
      else if (row.status === 'BLOCKED') tasksBlocked += count;
      else if (row.status === 'DONE') tasksDone += count;
    }
    const tasksTotal = tasksTodo + tasksInProgress + tasksBlocked + tasksDone;

    // 5. Total KPI Points for period
    const kpiRes = await db
      .selectFrom('kpi_events')
      .select(sql<number>`coalesce(sum(kpi_points), 0)`.as('total'))
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .executeTakeFirst();
    const totalKpiPoints = Number(kpiRes?.total || 0);

    // 6. Workload per Dev
    const memberAssignments = await db
      .selectFrom('project_assignments as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .select([
        'pa.employee_id',
        'pa.assignment_type',
        sql<number>`count(distinct p.id)`.as('project_count'),
      ])
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true)
      .where('p.status', 'not in', ['COMPLETED', 'CANCELLED'])
      .groupBy(['pa.employee_id', 'pa.assignment_type'])
      .execute();

    const workloadMap = new Map<string, { primary: number; support: number }>();
    for (const row of memberAssignments) {
      const empId = String(row.employee_id);
      const curr = workloadMap.get(empId) || { primary: 0, support: 0 };
      if (row.assignment_type === 'PRIMARY') {
        curr.primary = Number(row.project_count);
      } else if (row.assignment_type === 'SUPPORT') {
        curr.support = Number(row.project_count);
      }
      workloadMap.set(empId, curr);
    }

    const memberTasks = await db
      .selectFrom('project_tasks')
      .select(['assigned_to_employee_id', sql<number>`count(id)`.as('task_count')])
      .where('assigned_to_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['TODO', 'IN_PROGRESS', 'BLOCKED'])
      .groupBy('assigned_to_employee_id')
      .execute();

    const tasksMap = new Map<string, number>();
    for (const row of memberTasks) {
      if (row.assigned_to_employee_id) {
        tasksMap.set(String(row.assigned_to_employee_id), Number(row.task_count));
      }
    }

    const memberKpis = await db
      .selectFrom('kpi_events')
      .select(['employee_id', sql<number>`coalesce(sum(kpi_points), 0)`.as('points')])
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .groupBy('employee_id')
      .execute();

    const kpiMap = new Map<string, number>();
    for (const row of memberKpis) {
      if (row.employee_id) {
        kpiMap.set(String(row.employee_id), Number(row.points));
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const wl = workloadMap.get(empId) || { primary: 0, support: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        activePrimaryProjectsCount: wl.primary,
        activeSupportProjectsCount: wl.support,
        totalActiveProjects: wl.primary + wl.support,
        activeTasksCount: tasksMap.get(empId) || 0,
        kpiPoints: kpiMap.get(empId) || 0,
      };
    });

    // 7. Recent Projects
    let recentProjects: TeamRecentProjectItem[] = [];
    if (teamProjectIds.length > 0) {
      const rawRecent = await db
        .selectFrom('projects as p')
        .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .innerJoin('accounts as a', 'a.id', 'o.account_id')
        .innerJoin('services as s', 's.id', 'oi.service_id')
        .select([
          'p.id',
          'p.project_name',
          'p.status',
          'p.materialized_progress_percent',
          'p.created_at',
          'o.order_code',
          'a.company_name',
          's.name as service_name',
        ])
        .where('p.id', 'in', teamProjectIds as any)
        .orderBy('p.created_at', 'desc')
        .limit(10)
        .execute();

      recentProjects = await Promise.all(
        rawRecent.map(async (rp) => {
          const assignees = await db
            .selectFrom('project_assignments as pa')
            .innerJoin('employees as e', 'e.id', 'pa.employee_id')
            .select(['e.id', 'e.full_name', 'pa.assignment_type'])
            .where('pa.project_id', '=', rp.id)
            .where('pa.is_active', '=', true)
            .execute();

          return {
            ...rp,
            primaryAssignees: assignees
              .filter((a) => a.assignment_type === 'PRIMARY')
              .map((a) => a.full_name),
            supportAssignees: assignees
              .filter((a) => a.assignment_type === 'SUPPORT')
              .map((a) => a.full_name),
          };
        }),
      );
    }

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalProjects,
        activeProjectsCount,
        blockedProjectsCount,
        completedProjectsCount,
        reviewAcceptanceCount,
        totalAcceptances,
        totalKpiPoints,
      },
      tasksSummary: {
        todo: tasksTodo,
        inProgress: tasksInProgress,
        blocked: tasksBlocked,
        done: tasksDone,
        total: tasksTotal,
      },
      members: membersSummary,
      recentProjects,
    };
  }

  /**
   * PHASE G: SEO Team Leader Internal Workspace Summary
   * Pure internal operational workspace for SEO teams:
   * - Current SEO Team
   * - Members (temporal)
   * - Projects (assigned to team members)
   * - Tasks (TODO, IN_PROGRESS, BLOCKED, DONE)
   * - Progress (materialized progress %)
   * - Blocked / Waiting work
   * - Workload (PRIMARY vs SUPPORT, active tasks)
   * - KPI points
   */
  async getSeoWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    let team: any = null;

    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'SEO')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('User missing employee ID');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm SEO nào bạn đang phụ trách');
    }

    if (!isGlobal && team.department !== 'SEO') {
      throw new ForbiddenException('Nhóm bạn đang phụ trách không thuộc phòng ban SEO');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalProjects: 0,
          activeProjectsCount: 0,
          blockedProjectsCount: 0,
          completedProjectsCount: 0,
          reviewAcceptanceCount: 0,
          totalAcceptances: 0,
          totalKpiPoints: 0,
        },
        tasksSummary: {
          todo: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
          total: 0,
        },
        members: [],
        recentProjects: [],
      };
    }

    // 3. Subquery / Join for Projects of current team members
    const teamProjectsQuery = db
      .selectFrom('projects as p')
      .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true);

    const teamProjectRows = await teamProjectsQuery
      .select(sql<string>`distinct p.id`.as('project_id'))
      .execute();
    const teamProjectIds = teamProjectRows.map((r) => String(r.project_id));

    let totalProjects = 0;
    let activeProjectsCount = 0;
    let blockedProjectsCount = 0;
    let completedProjectsCount = 0;
    let reviewAcceptanceCount = 0;
    let totalAcceptances = 0;

    if (teamProjectIds.length > 0) {
      const projectStatusCounts = await db
        .selectFrom('projects as p')
        .select(['p.status', sql<number>`count(p.id)`.as('count')])
        .where('p.id', 'in', teamProjectIds as any)
        .groupBy('p.status')
        .execute();

      for (const row of projectStatusCounts) {
        const count = Number(row.count);
        totalProjects += count;
        if (['ASSIGNED', 'READY_TO_START', 'IN_PROGRESS'].includes(row.status)) {
          activeProjectsCount += count;
        } else if (
          ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL'].includes(row.status)
        ) {
          blockedProjectsCount += count;
        } else if (['REVIEW', 'ACCEPTANCE'].includes(row.status)) {
          reviewAcceptanceCount += count;
        } else if (row.status === 'COMPLETED') {
          completedProjectsCount += count;
        }
      }

      const acceptancesRes = await db
        .selectFrom('project_acceptances')
        .select(sql<number>`count(id)`.as('total'))
        .where('project_id', 'in', teamProjectIds as any)
        .executeTakeFirst();
      totalAcceptances = Number(acceptancesRes?.total || 0);
    }

    // 4. Tasks Summary (tasks assigned to team members OR in team projects)
    const taskStatusCounts = await db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .select(['pt.status', sql<number>`count(pt.id)`.as('count')])
      .where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', 'in', memberIds as any),
          teamProjectIds.length > 0
            ? eb('pm.project_id', 'in', teamProjectIds as any)
            : (sql`1 = 0` as any),
        ]),
      )
      .groupBy('pt.status')
      .execute();

    let tasksTodo = 0;
    let tasksInProgress = 0;
    let tasksBlocked = 0;
    let tasksDone = 0;

    for (const row of taskStatusCounts) {
      const count = Number(row.count);
      if (row.status === 'TODO') tasksTodo += count;
      else if (row.status === 'IN_PROGRESS') tasksInProgress += count;
      else if (row.status === 'BLOCKED') tasksBlocked += count;
      else if (row.status === 'DONE') tasksDone += count;
    }
    const tasksTotal = tasksTodo + tasksInProgress + tasksBlocked + tasksDone;

    // 5. Total KPI Points for period
    const kpiRes = await db
      .selectFrom('kpi_events')
      .select(sql<number>`coalesce(sum(kpi_points), 0)`.as('total'))
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .executeTakeFirst();
    const totalKpiPoints = Number(kpiRes?.total || 0);

    // 6. Workload per SEO Specialist
    const memberAssignments = await db
      .selectFrom('project_assignments as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .select([
        'pa.employee_id',
        'pa.assignment_type',
        sql<number>`count(distinct p.id)`.as('project_count'),
      ])
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true)
      .where('p.status', 'not in', ['COMPLETED', 'CANCELLED'])
      .groupBy(['pa.employee_id', 'pa.assignment_type'])
      .execute();

    const workloadMap = new Map<string, { primary: number; support: number }>();
    for (const row of memberAssignments) {
      const empId = String(row.employee_id);
      const curr = workloadMap.get(empId) || { primary: 0, support: 0 };
      if (row.assignment_type === 'PRIMARY') {
        curr.primary = Number(row.project_count);
      } else if (row.assignment_type === 'SUPPORT') {
        curr.support = Number(row.project_count);
      }
      workloadMap.set(empId, curr);
    }

    const memberTasks = await db
      .selectFrom('project_tasks')
      .select(['assigned_to_employee_id', sql<number>`count(id)`.as('task_count')])
      .where('assigned_to_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['TODO', 'IN_PROGRESS', 'BLOCKED'])
      .groupBy('assigned_to_employee_id')
      .execute();

    const tasksMap = new Map<string, number>();
    for (const row of memberTasks) {
      if (row.assigned_to_employee_id) {
        tasksMap.set(String(row.assigned_to_employee_id), Number(row.task_count));
      }
    }

    const memberKpis = await db
      .selectFrom('kpi_events')
      .select(['employee_id', sql<number>`coalesce(sum(kpi_points), 0)`.as('points')])
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .groupBy('employee_id')
      .execute();

    const kpiMap = new Map<string, number>();
    for (const row of memberKpis) {
      if (row.employee_id) {
        kpiMap.set(String(row.employee_id), Number(row.points));
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const wl = workloadMap.get(empId) || { primary: 0, support: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        activePrimaryProjectsCount: wl.primary,
        activeSupportProjectsCount: wl.support,
        totalActiveProjects: wl.primary + wl.support,
        activeTasksCount: tasksMap.get(empId) || 0,
        kpiPoints: kpiMap.get(empId) || 0,
      };
    });

    // 7. Recent Projects
    let recentProjects: TeamRecentProjectItem[] = [];
    if (teamProjectIds.length > 0) {
      const rawRecent = await db
        .selectFrom('projects as p')
        .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .innerJoin('accounts as a', 'a.id', 'o.account_id')
        .innerJoin('services as s', 's.id', 'oi.service_id')
        .select([
          'p.id',
          'p.project_name',
          'p.status',
          'p.materialized_progress_percent',
          'p.created_at',
          'o.order_code',
          'a.company_name',
          's.name as service_name',
        ])
        .where('p.id', 'in', teamProjectIds as any)
        .orderBy('p.created_at', 'desc')
        .limit(10)
        .execute();

      recentProjects = await Promise.all(
        rawRecent.map(async (rp) => {
          const assignees = await db
            .selectFrom('project_assignments as pa')
            .innerJoin('employees as e', 'e.id', 'pa.employee_id')
            .select(['e.id', 'e.full_name', 'pa.assignment_type'])
            .where('pa.project_id', '=', rp.id)
            .where('pa.is_active', '=', true)
            .execute();

          return {
            ...rp,
            primaryAssignees: assignees
              .filter((a) => a.assignment_type === 'PRIMARY')
              .map((a) => a.full_name),
            supportAssignees: assignees
              .filter((a) => a.assignment_type === 'SUPPORT')
              .map((a) => a.full_name),
          };
        }),
      );
    }

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalProjects,
        activeProjectsCount,
        blockedProjectsCount,
        completedProjectsCount,
        reviewAcceptanceCount,
        totalAcceptances,
        totalKpiPoints,
      },
      tasksSummary: {
        todo: tasksTodo,
        inProgress: tasksInProgress,
        blocked: tasksBlocked,
        done: tasksDone,
        total: tasksTotal,
      },
      members: membersSummary,
      recentProjects,
    };
  }
}
