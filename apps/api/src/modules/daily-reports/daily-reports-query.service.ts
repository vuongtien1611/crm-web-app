import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';

@Injectable()
export class DailyReportsQueryService {
  constructor(private readonly kysely: KyselyService) {}

  async getDailyReports(
    query: QueryDailyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const isAdminOrBoss = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    const isTeamLeader = actorRoles.some((r) => r.includes('LEADER'));

    let baseQuery = db
      .selectFrom('daily_reports as dr')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .select([
        'dr.id',
        'dr.employee_id',
        sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date'),
        'dr.difficulty',
        'dr.support_needed',
        'dr.next_plan',
        'dr.note',
        'dr.submitted_at',
        'e.full_name',
        'e.employee_code',
        'u.email',
        'p.name as position_name',
      ]);

    const employeeId = query.employee_id || query.employeeId;
    const teamId = query.team_id || query.teamId;
    const projectId = query.project_id || query.projectId;

    // 1. ADMIN / BOSS: Global Access
    if (isAdminOrBoss) {
      if (employeeId) {
        baseQuery = baseQuery.where('dr.employee_id', '=', employeeId as any);
      }
      if (teamId) {
        baseQuery = baseQuery.where(
          sql`EXISTS (
            SELECT 1 FROM team_memberships tm
            WHERE tm.employee_id = dr.employee_id
              AND tm.team_id = ${teamId}
              AND tm.effective_range @> dr.submitted_at
          )` as any,
        );
      }
    }
    // 2. TEAM LEADER: Historical and current reports based on submitted_at inside team membership range
    else if (isTeamLeader) {
      // Find current led team
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      // DR-09: No active team -> return empty list
      if (!ledTeam) {
        // If explicitly requesting own reports, allow own
        if (query.scope === 'own') {
          baseQuery = baseQuery.where('dr.employee_id', '=', actorEmployeeId as any);
        } else {
          return [];
        }
      } else {
        if (query.scope === 'own') {
          baseQuery = baseQuery.where('dr.employee_id', '=', actorEmployeeId as any);
        } else if (employeeId) {
          if (String(employeeId) === String(actorEmployeeId)) {
            baseQuery = baseQuery.where('dr.employee_id', '=', actorEmployeeId as any);
          } else {
            baseQuery = baseQuery
              .where('dr.employee_id', '=', employeeId as any)
              .where(
                sql`EXISTS (
                  SELECT 1 FROM team_memberships tm
                  WHERE tm.employee_id = dr.employee_id
                    AND tm.team_id = ${ledTeam.team_id}
                    AND tm.effective_range @> dr.submitted_at
                )` as any,
              );
          }
        } else {
          baseQuery = baseQuery.where((eb) =>
            eb.or([
              eb('dr.employee_id', '=', actorEmployeeId as any),
              eb(
                sql`EXISTS (
                  SELECT 1 FROM team_memberships tm
                  WHERE tm.employee_id = dr.employee_id
                    AND tm.team_id = ${ledTeam.team_id}
                    AND tm.effective_range @> dr.submitted_at
                )`,
                '=',
                sql`true`,
              ),
            ]),
          );
        }
      }
    }
    // 3. EMPLOYEE / ACCOUNTANT / STAFF (SALE, DEV, SEO): Own reports only
    else {
      baseQuery = baseQuery.where('dr.employee_id', '=', actorEmployeeId as any);
    }

    // Validate date range
    if (query.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(query.fromDate)) {
      throw new BadRequestException('fromDate must be in YYYY-MM-DD format');
    }
    if (query.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(query.toDate)) {
      throw new BadRequestException('toDate must be in YYYY-MM-DD format');
    }
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw new BadRequestException('fromDate must be less than or equal to toDate');
    }

    // Apply date, month & date range filters directly in DB
    if (query.date) {
      baseQuery = baseQuery.where(
        sql`to_char(dr.report_date, 'YYYY-MM-DD') = ${query.date}` as any,
      );
    }
    if (query.month) {
      baseQuery = baseQuery.where(
        sql`to_char(dr.report_date, 'YYYY-MM') = ${query.month}` as any,
      );
    }
    if (query.fromDate) {
      baseQuery = baseQuery.where(
        sql`dr.report_date >= ${query.fromDate}::date` as any,
      );
    }
    if (query.toDate) {
      baseQuery = baseQuery.where(
        sql`dr.report_date <= ${query.toDate}::date` as any,
      );
    }

    // Filter by department
    if (query.department && query.department !== 'ALL') {
      baseQuery = baseQuery.where((eb) =>
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

    // Filter by project
    if (projectId && projectId !== 'ALL') {
      baseQuery = baseQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('daily_report_items as dri_proj')
            .select('dri_proj.id')
            .whereRef('dri_proj.daily_report_id', '=', sql.ref('dr.id'))
            .where('dri_proj.project_id', '=', projectId as any)
        )
      );
    }

    // Filter by status
    if (query.status && query.status !== 'ALL') {
      baseQuery = baseQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('daily_report_items as dri_stat')
            .select('dri_stat.id')
            .whereRef('dri_stat.daily_report_id', '=', sql.ref('dr.id'))
            .where('dri_stat.status', '=', query.status as any)
        )
      );
    }

    // Filter by search text
    if (query.search && query.search.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
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

    const reports = await baseQuery
      .orderBy('dr.report_date', 'desc')
      .orderBy('dr.submitted_at', 'desc')
      .execute();

    const reportIds = reports.map((r) => r.id);
    const itemsMap: Record<string, any[]> = {};
    if (reportIds.length > 0) {
      let itemsQuery = db
        .selectFrom('daily_report_items as dri')
        .leftJoin('projects as p', 'p.id', 'dri.project_id')
        .select([
          'dri.id',
          'dri.daily_report_id',
          'dri.project_id',
          'p.project_name',
          'dri.work_title',
          'dri.work_detail',
          'dri.link',
          'dri.status',
          'dri.progress_percent',
          'dri.note',
          'dri.sort_order',
          'dri.created_at',
          'dri.updated_at',
        ])
        .where('dri.daily_report_id', 'in', reportIds as any[])
        .orderBy('dri.sort_order', 'asc');

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

      const allItems = await itemsQuery.execute();
      for (const it of allItems) {
        const rid = String(it.daily_report_id);
        if (!itemsMap[rid]) itemsMap[rid] = [];
        itemsMap[rid].push({
          id: String(it.id),
          dailyReportId: rid,
          projectId: it.project_id ? String(it.project_id) : null,
          projectName: it.project_name || null,
          workTitle: it.work_title,
          workDetail: it.work_detail,
          link: it.link,
          status: it.status,
          progressPercent: Number(it.progress_percent || 0),
          note: it.note,
          sortOrder: Number(it.sort_order || 0),
          createdAt: it.created_at,
          updatedAt: it.updated_at,
        });
      }
    }

    // Map employees to team and department
    const empIds = [...new Set(reports.map((r) => r.employee_id))];
    const teamMap: Record<string, { teamId: string; teamName: string; department: string | null }> = {};
    if (empIds.length > 0) {
      const empTeams = await db
        .selectFrom('team_memberships as tm')
        .innerJoin('teams as t', 't.id', 'tm.team_id')
        .select([
          'tm.employee_id',
          't.id as team_id',
          't.name as team_name',
          't.department',
        ])
        .where('tm.employee_id', 'in', empIds as any[])
        .where(sql`tm.effective_range @> NOW()` as any)
        .execute();

      for (const et of empTeams) {
        teamMap[String(et.employee_id)] = {
          teamId: String(et.team_id),
          teamName: et.team_name,
          department: et.department,
        };
      }
    }

    return reports.map((r) => {
      const rId = String(r.id);
      const empId = String(r.employee_id);
      const tm = teamMap[empId];
      return {
        id: rId,
        employeeId: empId,
        employeeName: r.full_name || r.employee_code,
        employeeCode: r.employee_code,
        email: r.email || '',
        positionName: r.position_name,
        teamId: tm?.teamId || null,
        teamName: tm?.teamName || null,
        department: tm?.department || null,
        reportDate: String(r.report_date || ''),
        difficulty: r.difficulty,
        supportNeeded: r.support_needed,
        nextPlan: r.next_plan,
        note: r.note,
        submittedAt: r.submitted_at,
        items: itemsMap[rId] || [],
      };
    });
  }

  // ----------------------------------------------------------------
  // GET DAILY REPORT BY ID (Detail Scope Check)
  // ----------------------------------------------------------------

  async getDailyReportById(
    id: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const report = await db
      .selectFrom('daily_reports as dr')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .select([
        'dr.id',
        'dr.employee_id',
        sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date'),
        'dr.difficulty',
        'dr.support_needed',
        'dr.next_plan',
        'dr.note',
        'dr.submitted_at',
        'e.full_name',
        'e.employee_code',
        'u.email',
        'p.name as position_name',
      ])
      .where('dr.id', '=', id as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Daily report #${id} not found`);
    }

    const isAdminOrBoss = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    const isTeamLeader = actorRoles.some((r) => r.includes('LEADER'));
    const isOwn = String(report.employee_id) === String(actorEmployeeId);

    // 1. ADMIN / BOSS: Allowed
    if (isAdminOrBoss) {
      // Proceed
    }
    // 2. Own report: Allowed
    else if (isOwn) {
      // Proceed
    }
    // 3. TEAM LEADER: Allowed ONLY if author is currently in led team
    else if (isTeamLeader) {
      const ledTeam = await db
        .selectFrom('team_memberships')
        .select('team_id')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (!ledTeam) {
        throw new ForbiddenException('You do not lead any active team');
      }

      // Check if report author is a current member of the led team
      const isMember = await db
        .selectFrom('team_memberships')
        .select('id')
        .where('team_id', '=', ledTeam.team_id)
        .where('employee_id', '=', report.employee_id)
        .where(sql`effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (!isMember) {
        throw new ForbiddenException('Forbidden: Report belongs to an employee outside your team');
      }
    }
    // 4. Other Employee: Blocked (DR-02)
    else {
      throw new ForbiddenException('Forbidden: You can only view your own daily reports');
    }

    // Query daily report items
    const items = await db
      .selectFrom('daily_report_items as dri')
      .leftJoin('projects as p', 'p.id', 'dri.project_id')
      .select([
        'dri.id',
        'dri.daily_report_id',
        'dri.project_id',
        'dri.work_title',
        'dri.work_detail',
        'dri.link',
        'dri.status',
        'dri.progress_percent',
        'dri.note',
        'dri.sort_order',
        'dri.created_at',
        'dri.updated_at',
        'p.project_name as project_name',
      ])
      .where('dri.daily_report_id', '=', id as any)
      .orderBy('dri.sort_order', 'asc')
      .orderBy('dri.id', 'asc')
      .execute();

    return {
      id: String(report.id),
      employeeId: String(report.employee_id),
      employeeName: report.full_name || report.employee_code,
      employeeCode: report.employee_code,
      email: report.email || '',
      positionName: report.position_name,
      reportDate: String(report.report_date || ''),
      difficulty: report.difficulty,
      supportNeeded: report.support_needed,
      nextPlan: report.next_plan,
      note: report.note,
      submittedAt: report.submitted_at,
      items: items.map((it) => ({
        id: String(it.id),
        dailyReportId: String(it.daily_report_id),
        projectId: it.project_id ? String(it.project_id) : null,
        projectName: it.project_name || null,
        workTitle: it.work_title,
        workDetail: it.work_detail,
        link: it.link,
        status: it.status,
        progressPercent: Number(it.progress_percent || 0),
        note: it.note,
        sortOrder: Number(it.sort_order || 0),
        createdAt: it.created_at,
        updatedAt: it.updated_at,
      })),
    };
  }

  // ----------------------------------------------------------------
  // UPDATE DAILY REPORT (Own only)
  // ----------------------------------------------------------------

  async getDailyReportItems(
    reportId: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    // Validate report exists & actor has permission to read it
    await this.getDailyReportById(reportId, actorEmployeeId, actorRoles);

    const db = this.kysely.db;
    const items = await db
      .selectFrom('daily_report_items as dri')
      .leftJoin('projects as p', 'p.id', 'dri.project_id')
      .select([
        'dri.id',
        'dri.daily_report_id',
        'dri.project_id',
        'dri.work_title',
        'dri.work_detail',
        'dri.link',
        'dri.status',
        'dri.progress_percent',
        'dri.note',
        'dri.sort_order',
        'dri.created_at',
        'dri.updated_at',
        'p.project_name as project_name',
      ])
      .where('dri.daily_report_id', '=', reportId as any)
      .orderBy('dri.sort_order', 'asc')
      .orderBy('dri.id', 'asc')
      .execute();

    return items.map((it) => ({
      id: String(it.id),
      dailyReportId: String(it.daily_report_id),
      projectId: it.project_id ? String(it.project_id) : null,
      projectName: it.project_name || null,
      workTitle: it.work_title,
      workDetail: it.work_detail,
      link: it.link,
      status: it.status,
      progressPercent: Number(it.progress_percent || 0),
      note: it.note,
      sortOrder: Number(it.sort_order || 0),
      createdAt: it.created_at,
      updatedAt: it.updated_at,
    }));
  }

  // ----------------------------------------------------------------
  // DAILY REPORT ITEMS: ADD ITEM (Own report or Admin only)
  // ----------------------------------------------------------------
}
