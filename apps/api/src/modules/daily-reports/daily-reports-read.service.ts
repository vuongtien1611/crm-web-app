import { Injectable } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';

@Injectable()
export class DailyReportsReadService {
  constructor(private readonly kysely: KyselyService) {}

  async getDailyReportStats(
    query: QueryDailyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const isAdminOrBoss = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    const isTeamLeader = actorRoles.some((r) => r.includes('LEADER'));

    const employeeId = query.employee_id || query.employeeId;
    const teamId = query.team_id || query.teamId;
    const projectId = query.project_id || query.projectId;

    let targetEmployeeIds: string[] | null = null; // null = global

    if (isAdminOrBoss) {
      if (employeeId) {
        targetEmployeeIds = [String(employeeId)];
      } else if (teamId) {
        const teamMemberIds = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', teamId as any)
          .where(sql`effective_range @> NOW()` as any)
          .execute();
        targetEmployeeIds = teamMemberIds.map((m) => String(m.employee_id));
      }
    } else if (isTeamLeader) {
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (!ledTeam) {
        targetEmployeeIds = query.scope === 'own' ? [String(actorEmployeeId)] : [];
      } else {
        const currentMembers = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', ledTeam.team_id)
          .where(sql`effective_range @> NOW()` as any)
          .execute();
        const memberIds = currentMembers.map((m) => String(m.employee_id));
        if (!memberIds.includes(String(actorEmployeeId))) {
          memberIds.push(String(actorEmployeeId));
        }
        if (query.scope === 'own') {
          targetEmployeeIds = [String(actorEmployeeId)];
        } else if (employeeId) {
          targetEmployeeIds = memberIds.includes(String(employeeId))
            ? [String(employeeId)]
            : [];
        } else {
          targetEmployeeIds = memberIds;
        }
      }
    } else {
      targetEmployeeIds = [String(actorEmployeeId)];
    }

    // Total employees in scope
    let totalEmployeesCount = 0;
    if (targetEmployeeIds !== null) {
      totalEmployeesCount = targetEmployeeIds.length;
    } else {
      const activeEmps = await db
        .selectFrom('employees')
        .select(sql<number>`count(id)::int`.as('cnt'))
        .where('status', '=', 'ACTIVE')
        .executeTakeFirst();
      totalEmployeesCount = Number(activeEmps?.cnt || 0);
    }

    let reportsQuery = db
      .selectFrom('daily_reports as dr')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .select(['dr.id', 'dr.employee_id', sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date')]);

    if (targetEmployeeIds !== null) {
      if (targetEmployeeIds.length === 0) {
        return {
          reportedEmployeesCount: 0,
          totalEmployeesCount: 0,
          notReportedCount: 0,
          reportedPercentage: 0,
          totalWorkItems: 0,
          doneCount: 0,
          inProgressCount: 0,
          blockedCount: 0,
          todoCount: 0,
          activeProjectsCount: 0,
          departmentBreakdown: [],
          topProjects: [],
        };
      }
      reportsQuery = reportsQuery.where('dr.employee_id', 'in', targetEmployeeIds as any[]);
    }

    if (query.fromDate) {
      reportsQuery = reportsQuery.where(sql`dr.report_date >= ${query.fromDate}::date` as any);
    }
    if (query.toDate) {
      reportsQuery = reportsQuery.where(sql`dr.report_date <= ${query.toDate}::date` as any);
    }
    if (query.department && query.department !== 'ALL') {
      reportsQuery = reportsQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('team_memberships as tm_dept')
            .innerJoin('teams as t_dept', 't_dept.id', 'tm_dept.team_id')
            .select('tm_dept.id')
            .whereRef('tm_dept.employee_id', '=', sql.ref('dr.employee_id'))
            .where(sql`tm_dept.effective_range @> NOW()` as any)
            .where('t_dept.department', '=', query.department as any)
        )
      );
    }

    if (projectId && projectId !== 'ALL') {
      reportsQuery = reportsQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('daily_report_items as dri_p')
            .select('dri_p.id')
            .whereRef('dri_p.daily_report_id', '=', sql.ref('dr.id'))
            .where('dri_p.project_id', '=', projectId as any)
        )
      );
    }

    if (query.status && query.status !== 'ALL') {
      reportsQuery = reportsQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('daily_report_items as dri_st')
            .select('dri_st.id')
            .whereRef('dri_st.daily_report_id', '=', sql.ref('dr.id'))
            .where('dri_st.status', '=', query.status as any)
        )
      );
    }

    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      reportsQuery = reportsQuery.where((eb) =>
        eb.or([
          eb(sql`lower(e.full_name)` as any, 'like', s),
          eb(sql`lower(e.employee_code)` as any, 'like', s),
          eb(sql`lower(dr.difficulty)` as any, 'like', s),
          eb(sql`lower(dr.next_plan)` as any, 'like', s),
          eb.exists(
            db
              .selectFrom('daily_report_items as dri_srch')
              .select('dri_srch.id')
              .whereRef('dri_srch.daily_report_id', '=', sql.ref('dr.id'))
              .where((eb2) =>
                eb2.or([
                  eb2(sql`lower(dri_srch.work_title)` as any, 'like', s),
                  eb2(sql`lower(dri_srch.work_detail)` as any, 'like', s),
                ])
              )
          ),
        ])
      );
    }

    const matchedReports = await reportsQuery.execute();
    const reportedEmpIds = new Set(matchedReports.map((r) => String(r.employee_id)));
    const reportedEmployeesCount = reportedEmpIds.size;
    const notReportedCount = Math.max(0, totalEmployeesCount - reportedEmployeesCount);
    const reportedPercentage = totalEmployeesCount > 0
      ? Math.round((reportedEmployeesCount / totalEmployeesCount) * 100)
      : 0;

    const matchedReportIds = matchedReports.map((r) => r.id);

    if (matchedReportIds.length === 0) {
      return {
        reportedEmployeesCount,
        totalEmployeesCount,
        notReportedCount,
        unreportedEmployeesCount: notReportedCount,
        reportedPercentage,
        totalWorkItems: 0,
        doneCount: 0,
        doneWorkItems: 0,
        inProgressCount: 0,
        inProgressWorkItems: 0,
        blockedCount: 0,
        blockedWorkItems: 0,
        todoCount: 0,
        activeProjectsCount: 0,
        departmentBreakdown: [],
        departments: [],
        topProjects: [],
      };
    }

    let itemsQuery = db
      .selectFrom('daily_report_items as dri')
      .leftJoin('projects as p', 'p.id', 'dri.project_id')
      .select([
        'dri.id',
        'dri.status',
        'dri.project_id',
        'p.project_name',
        'dri.daily_report_id',
      ])
      .where('dri.daily_report_id', 'in', matchedReportIds as any[]);

    if (projectId && projectId !== 'ALL') {
      itemsQuery = itemsQuery.where('dri.project_id', '=', projectId as any);
    }

    if (query.status && query.status !== 'ALL') {
      itemsQuery = itemsQuery.where('dri.status', '=', query.status as any);
    }

    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      itemsQuery = itemsQuery.where((eb) =>
        eb.or([
          eb(sql`lower(dri.work_title)` as any, 'like', s),
          eb(sql`lower(dri.work_detail)` as any, 'like', s),
          eb.exists(
            db
              .selectFrom('daily_reports as dr_s')
              .innerJoin('employees as e_s', 'e_s.id', 'dr_s.employee_id')
              .select('dr_s.id')
              .whereRef('dr_s.id', '=', sql.ref('dri.daily_report_id'))
              .where((eb2) =>
                eb2.or([
                  eb2(sql`lower(e_s.full_name)` as any, 'like', s),
                  eb2(sql`lower(e_s.employee_code)` as any, 'like', s),
                  eb2(sql`lower(dr_s.difficulty)` as any, 'like', s),
                  eb2(sql`lower(dr_s.next_plan)` as any, 'like', s),
                ])
              )
          ),
        ])
      );
    }

    const items = await itemsQuery.execute();
    const totalWorkItems = items.length;
    let doneCount = 0;
    let inProgressCount = 0;
    let blockedCount = 0;
    let todoCount = 0;
    const activeProjectIds = new Set<string>();
    const projectCountMap: Record<string, { name: string; count: number }> = {};

    for (const it of items) {
      if (it.status === 'DONE') doneCount++;
      else if (it.status === 'IN_PROGRESS') inProgressCount++;
      else if (it.status === 'BLOCKED') blockedCount++;
      else todoCount++;

      if (it.project_id) {
        const pid = String(it.project_id);
        activeProjectIds.add(pid);
        const pname = it.project_name || `Dự án #${pid}`;
        if (!projectCountMap[pid]) {
          projectCountMap[pid] = { name: pname, count: 0 };
        }
        projectCountMap[pid].count++;
      }
    }

    const topProjects = Object.entries(projectCountMap)
      .map(([projectId, info]) => ({
        id: projectId,
        projectId,
        name: info.name,
        projectName: info.name,
        taskCount: info.count,
        count: info.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const empIdsArr = [...reportedEmpIds];
    const deptCountMap: Record<string, number> = {
      DEV: 0,
      SEO: 0,
      SALES: 0,
      OPERATION: 0,
    };

    if (empIdsArr.length > 0) {
      const empTeams = await db
        .selectFrom('team_memberships as tm')
        .innerJoin('teams as t', 't.id', 'tm.team_id')
        .select(['tm.employee_id', 't.department'])
        .where('tm.employee_id', 'in', empIdsArr as any[])
        .where(sql`tm.effective_range @> NOW()` as any)
        .execute();

      const empDeptMap: Record<string, string> = {};
      for (const et of empTeams) {
        if (et.department) empDeptMap[String(et.employee_id)] = et.department;
      }

      const reportDeptMap: Record<string, string> = {};
      for (const r of matchedReports) {
        reportDeptMap[String(r.id)] = empDeptMap[String(r.employee_id)] || 'OPERATION';
      }

      for (const it of items) {
        const dept = reportDeptMap[String(it.daily_report_id)] || 'OPERATION';
        deptCountMap[dept] = (deptCountMap[dept] || 0) + 1;
      }
    }

    const deptTotal = Object.values(deptCountMap).reduce((a, b) => a + b, 0);
    const departmentBreakdown = Object.entries(deptCountMap).map(([dept, count]) => ({
      department: dept,
      name: dept === 'OPERATION' ? 'ADMIN' : dept,
      count,
      percentage: deptTotal > 0 ? Math.round((count / deptTotal) * 100) : 0,
    }));

    return {
      reportedEmployeesCount,
      totalEmployeesCount,
      notReportedCount,
      unreportedEmployeesCount: notReportedCount,
      reportedPercentage,
      totalWorkItems,
      doneCount,
      doneWorkItems: doneCount,
      inProgressCount,
      inProgressWorkItems: inProgressCount,
      blockedCount,
      blockedWorkItems: blockedCount,
      todoCount,
      activeProjectsCount: activeProjectIds.size,
      departmentBreakdown,
      departments: departmentBreakdown,
      topProjects,
    };
  }

  // ----------------------------------------------------------------
  // GET FILTER OPTIONS (Departments, Teams, Employees, Projects)
  // ----------------------------------------------------------------
  async getFilterOptions(actorEmployeeId: string, actorRoles: string[]) {
    const db = this.kysely.db;
    const isAdminOrBoss = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    const isTeamLeader = actorRoles.some((r) => r.includes('LEADER'));

    const departments = [
      { code: 'ALL', name: 'Tất cả phòng ban' },
      { code: 'DEV', name: 'Phòng Lập trình (DEV)' },
      { code: 'SEO', name: 'Phòng SEO & Content' },
      { code: 'SALES', name: 'Phòng Kinh doanh' },
      { code: 'OPERATION', name: 'Vận hành & Ban Giám đốc' },
    ];

    let teamsQuery = db.selectFrom('teams').select(['id', 'name', 'code', 'department']);
    let employeesQuery = db
      .selectFrom('employees as e')
      .leftJoin('team_memberships as tm', (join) =>
        join.onRef('tm.employee_id', '=', 'e.id').on(sql`tm.effective_range @> NOW()` as any)
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .select([
        'e.id',
        'e.full_name',
        'e.employee_code',
        't.id as team_id',
        't.department',
      ])
      .where('e.status', '=', 'ACTIVE');

    if (isAdminOrBoss) {
      // Full access
    } else if (isTeamLeader) {
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (ledTeam) {
        teamsQuery = teamsQuery.where('id', '=', ledTeam.team_id as any);
        employeesQuery = employeesQuery.where((eb) =>
          eb.or([
            eb('t.id', '=', ledTeam.team_id as any),
            eb('e.id', '=', actorEmployeeId as any),
          ])
        );
      } else {
        teamsQuery = teamsQuery.where('id', '=', -1 as any);
        employeesQuery = employeesQuery.where('e.id', '=', actorEmployeeId as any);
      }
    } else {
      teamsQuery = teamsQuery.where('id', '=', -1 as any);
      employeesQuery = employeesQuery.where('e.id', '=', actorEmployeeId as any);
    }

    const [teams, employees, projects] = await Promise.all([
      teamsQuery.execute(),
      employeesQuery.execute(),
      db.selectFrom('projects').select(['id', 'project_name']).execute(),
    ]);

    return {
      departments,
      teams: teams.map((t) => ({
        id: String(t.id),
        name: t.name,
        code: t.code,
        department: t.department,
      })),
      employees: employees.map((e) => ({
        id: String(e.id),
        fullName: e.full_name,
        employeeCode: e.employee_code,
        teamId: e.team_id ? String(e.team_id) : null,
        department: e.department || null,
      })),
      projects: projects.map((p) => ({
        id: String(p.id),
        name: p.project_name,
        projectName: p.project_name,
      })),
    };
  }

  // ----------------------------------------------------------------
  // GET PROJECT WORK ITEMS (For Project Report Tab)
  // ----------------------------------------------------------------
  async getProjectWorkItems(
    query: QueryDailyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const isAdminOrBoss = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    const isTeamLeader = actorRoles.some((r) => r.includes('LEADER'));

    let itemsQuery = db
      .selectFrom('daily_report_items as dri')
      .innerJoin('daily_reports as dr', 'dr.id', 'dri.daily_report_id')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .leftJoin('projects as p', 'p.id', 'dri.project_id')
      .leftJoin('team_memberships as tm', (join) =>
        join.onRef('tm.employee_id', '=', 'e.id').on(sql`tm.effective_range @> NOW()` as any)
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .select([
        'dri.id as item_id',
        'dr.id as report_id',
        sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date'),
        'e.id as employee_id',
        'e.full_name as employee_name',
        'e.employee_code',
        't.name as team_name',
        't.department',
        'p.id as project_id',
        'p.project_name',
        'dri.work_title',
        'dri.work_detail',
        'dri.link',
        'dri.status',
        'dri.progress_percent',
        'dri.note',
        'dr.difficulty',
        'dr.support_needed',
        'dr.next_plan',
        'dr.submitted_at',
      ]);

    const employeeId = query.employee_id || query.employeeId;
    const teamId = query.team_id || query.teamId;
    const projectId = query.project_id || query.projectId;

    if (isAdminOrBoss) {
      if (employeeId) {
        itemsQuery = itemsQuery.where('dr.employee_id', '=', employeeId as any);
      }
      if (teamId) {
        itemsQuery = itemsQuery.where('t.id', '=', teamId as any);
      }
    } else if (isTeamLeader) {
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (!ledTeam) {
        itemsQuery = itemsQuery.where('dr.employee_id', '=', actorEmployeeId as any);
      } else {
        itemsQuery = itemsQuery.where((eb) =>
          eb.or([
            eb('t.id', '=', ledTeam.team_id as any),
            eb('dr.employee_id', '=', actorEmployeeId as any),
          ])
        );
      }
    } else {
      itemsQuery = itemsQuery.where('dr.employee_id', '=', actorEmployeeId as any);
    }

    if (query.fromDate) {
      itemsQuery = itemsQuery.where(sql`dr.report_date >= ${query.fromDate}::date` as any);
    }
    if (query.toDate) {
      itemsQuery = itemsQuery.where(sql`dr.report_date <= ${query.toDate}::date` as any);
    }

    if (projectId && projectId !== 'ALL') {
      itemsQuery = itemsQuery.where('dri.project_id', '=', projectId as any);
    }
    if (query.status && query.status !== 'ALL') {
      itemsQuery = itemsQuery.where('dri.status', '=', query.status as any);
    }
    if (query.department && query.department !== 'ALL') {
      itemsQuery = itemsQuery.where('t.department', '=', query.department as any);
    }
    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      itemsQuery = itemsQuery.where((eb) =>
        eb.or([
          eb(sql`lower(e.full_name)` as any, 'like', s),
          eb(sql`lower(e.employee_code)` as any, 'like', s),
          eb(sql`lower(dri.work_title)` as any, 'like', s),
          eb(sql`lower(dri.work_detail)` as any, 'like', s),
        ])
      );
    }

    const rows = await itemsQuery
      .orderBy('dr.report_date', 'desc')
      .orderBy('dri.sort_order', 'asc')
      .execute();

    return rows.map((r) => ({
      itemId: String(r.item_id),
      reportId: String(r.report_id),
      reportDate: String(r.report_date || ''),
      employeeId: String(r.employee_id),
      employeeName: r.employee_name || r.employee_code,
      employeeCode: r.employee_code,
      teamName: r.team_name || 'Chưa vào team',
      department: r.department || '',
      projectId: r.project_id ? String(r.project_id) : null,
      projectName: r.project_name || 'Không có dự án',
      workTitle: r.work_title,
      workDetail: r.work_detail,
      link: r.link,
      status: r.status,
      progressPercent: Number(r.progress_percent || 0),
      note: r.note,
      difficulty: r.difficulty,
      supportNeeded: r.support_needed,
      nextPlan: r.next_plan,
      submittedAt: r.submitted_at,
    }));
  }
}
