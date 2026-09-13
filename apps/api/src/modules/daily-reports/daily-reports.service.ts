import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { UpdateDailyReportDto } from './dto/update-daily-report.dto';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DailyReportsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ----------------------------------------------------------------
  // CREATE DAILY REPORT
  // ----------------------------------------------------------------
  async createDailyReport(dto: CreateDailyReportDto, actorEmployeeId: string) {
    if (!dto.report_date || !/^\d{4}-\d{2}-\d{2}$/.test(dto.report_date)) {
      throw new BadRequestException('report_date must be in YYYY-MM-DD format');
    }

    const db = this.kysely.db;

    // Check duplicate (employee_id, report_date) -> DR-06
    const existing = await db
      .selectFrom('daily_reports')
      .select('id')
      .where('employee_id', '=', actorEmployeeId as any)
      .where('report_date', '=', dto.report_date as any)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Daily report for employee #${actorEmployeeId} on ${dto.report_date} already exists`,
      );
    }

    return await this.kysely.db.transaction().execute(async (trx) => {
      const [report] = await trx
        .insertInto('daily_reports')
        .values({
          employee_id: actorEmployeeId as any,
          report_date: dto.report_date as any,
          difficulty: dto.difficulty || null,
          support_needed: dto.support_needed || null,
          next_plan: dto.next_plan || null,
          note: dto.note || null,
          submitted_at: new Date(),
        })
        .returningAll()
        .execute();

      if (dto.support_needed && dto.support_needed.trim() !== '') {
        if (this.notificationsService) {
          const emp = await trx
            .selectFrom('employees')
            .select(['employee_code', 'full_name'])
            .where('id', '=', actorEmployeeId as any)
            .executeTakeFirst();
          const empName = emp ? `${emp.full_name} (${emp.employee_code})` : `Nhân viên #${actorEmployeeId}`;

          await this.notificationsService.notifyTeamLeader(
            actorEmployeeId,
            {
              eventType: 'DAILY_REPORT_SUPPORT_NEEDED',
              title: 'Yêu cầu hỗ trợ từ thành viên',
              content: `${empName} báo cáo cần hỗ trợ: "${dto.support_needed.trim()}"`,
              deepLinkUrl: `/daily-reports?employee_id=${actorEmployeeId}&date=${dto.report_date}`,
              entityType: 'DAILY_REPORT',
              entityId: String(report.id),
            },
            trx,
          );
        }
      }

      // Insert daily report items if provided
      if (dto.items && Array.isArray(dto.items) && dto.items.length > 0) {
        for (let idx = 0; idx < dto.items.length; idx++) {
          const item = dto.items[idx];
          const workTitle = item.work_title ?? item.workTitle;
          const workDetail = item.work_detail ?? item.workDetail;
          if (workTitle && workDetail) {
            const progressVal = item.progress_percent !== undefined ? item.progress_percent : item.progressPercent;
            if (progressVal !== undefined && progressVal !== null) {
              const num = Number(progressVal);
              if (isNaN(num) || num < 0 || num > 100) {
                throw new BadRequestException('progress_percent must be between 0 and 100');
              }
            }

            await trx
              .insertInto('daily_report_items')
              .values({
                daily_report_id: report.id,
                project_id: item.project_id ?? item.projectId ?? null,
                work_title: workTitle,
                work_detail: workDetail,
                link: item.link ?? null,
                status: item.status ?? 'TODO',
                progress_percent: progressVal !== undefined ? Number(progressVal) : 0,
                note: item.note ?? null,
                sort_order: item.sort_order ?? item.sortOrder ?? idx,
              })
              .execute();
          }
        }
      }

      return report;
    });
  }

  // ----------------------------------------------------------------
  // GET DAILY REPORTS LIST (Scoped by Role)
  // ----------------------------------------------------------------
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
        const teamMemberIds = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', teamId as any)
          .where(sql`effective_range @> NOW()` as any)
          .execute();
        const ids = teamMemberIds.map((m) => m.employee_id);
        if (ids.length === 0) return [];
        baseQuery = baseQuery.where('dr.employee_id', 'in', ids as any[]);
      }
    }
    // 2. TEAM LEADER: Current team members only (NOW() <@ effective_range)
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
        // Find current members of led team
        const currentMembers = await db
          .selectFrom('team_memberships')
          .select('employee_id')
          .where('team_id', '=', ledTeam.team_id)
          .where(sql`effective_range @> NOW()` as any)
          .execute();

        const memberIds = currentMembers.map((m) => String(m.employee_id));
        // Leader can also see own reports
        if (!memberIds.includes(String(actorEmployeeId))) {
          memberIds.push(String(actorEmployeeId));
        }

        if (query.scope === 'own') {
          baseQuery = baseQuery.where('dr.employee_id', '=', actorEmployeeId as any);
        } else if (employeeId) {
          if (!memberIds.includes(String(employeeId))) {
            return []; // Outside team scope -> return empty
          }
          baseQuery = baseQuery.where('dr.employee_id', '=', employeeId as any);
        } else {
          baseQuery = baseQuery.where('dr.employee_id', 'in', memberIds as any[]);
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
            .whereRef('tm_dept.employee_id', '=', 'dr.employee_id')
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
            .whereRef('dri_proj.daily_report_id', '=', 'dr.id')
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
            .whereRef('dri_stat.daily_report_id', '=', 'dr.id')
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
              .whereRef('dri_srch.daily_report_id', '=', 'dr.id')
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
                .whereRef('dr_s.id', '=', 'dri.daily_report_id')
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
    const teamMap: Record<string, { teamId: string; teamName: string; department: string }> = {};
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
  async updateDailyReport(
    id: string,
    dto: UpdateDailyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const report = await db
      .selectFrom('daily_reports')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Daily report #${id} not found`);
    }

    const isAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    if (!isAdmin && String(report.employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('You can only update your own daily reports');
    }

    const [updated] = await db
      .updateTable('daily_reports')
      .set({
        difficulty: dto.difficulty !== undefined ? dto.difficulty : report.difficulty,
        support_needed: dto.support_needed !== undefined ? dto.support_needed : report.support_needed,
        next_plan: dto.next_plan !== undefined ? dto.next_plan : report.next_plan,
        note: dto.note !== undefined ? dto.note : report.note,
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updated;
  }

  // ----------------------------------------------------------------
  // DAILY REPORT ITEMS: GET ITEMS FOR REPORT
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
  async addDailyReportItem(
    reportId: string,
    itemDto: any,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const report = await db
      .selectFrom('daily_reports')
      .select(['id', 'employee_id'])
      .where('id', '=', reportId as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Daily report #${reportId} not found`);
    }

    const isAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    if (!isAdmin && String(report.employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('You can only add items to your own daily reports');
    }

    const workTitle = itemDto.work_title ?? itemDto.workTitle;
    const workDetail = itemDto.work_detail ?? itemDto.workDetail;

    if (!workTitle || !workDetail) {
      throw new BadRequestException('work_title and work_detail are required');
    }

    const progressVal = itemDto.progress_percent !== undefined ? itemDto.progress_percent : itemDto.progressPercent;
    if (progressVal !== undefined && progressVal !== null) {
      const num = Number(progressVal);
      if (isNaN(num) || num < 0 || num > 100) {
        throw new BadRequestException('progress_percent must be between 0 and 100');
      }
    }

    const [inserted] = await db
      .insertInto('daily_report_items')
      .values({
        daily_report_id: report.id,
        project_id: itemDto.project_id ?? itemDto.projectId ?? null,
        work_title: workTitle,
        work_detail: workDetail,
        link: itemDto.link ?? null,
        status: itemDto.status ?? 'TODO',
        progress_percent: progressVal !== undefined ? Number(progressVal) : 0,
        note: itemDto.note ?? null,
        sort_order: itemDto.sort_order ?? itemDto.sortOrder ?? 0,
      })
      .returningAll()
      .execute();

    return {
      id: String(inserted.id),
      dailyReportId: String(inserted.daily_report_id),
      projectId: inserted.project_id ? String(inserted.project_id) : null,
      workTitle: inserted.work_title,
      workDetail: inserted.work_detail,
      link: inserted.link,
      status: inserted.status,
      progressPercent: Number(inserted.progress_percent || 0),
      note: inserted.note,
      sortOrder: Number(inserted.sort_order || 0),
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    };
  }

  // ----------------------------------------------------------------
  // DAILY REPORT ITEMS: UPDATE ITEM (Own report or Admin only)
  // ----------------------------------------------------------------
  async updateDailyReportItem(
    itemId: string,
    dto: any,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const item = await db
      .selectFrom('daily_report_items as dri')
      .innerJoin('daily_reports as dr', 'dr.id', 'dri.daily_report_id')
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
        'dr.employee_id as report_employee_id',
      ])
      .where('dri.id', '=', itemId as any)
      .executeTakeFirst();

    if (!item) {
      throw new NotFoundException(`Daily report item #${itemId} not found`);
    }

    const isAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    if (!isAdmin && String(item.report_employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('You can only update items in your own daily reports');
    }

    const workTitle = dto.work_title ?? dto.workTitle;
    const workDetail = dto.work_detail ?? dto.workDetail;
    const projectId = dto.project_id !== undefined ? dto.project_id : dto.projectId;
    const progressPercent = dto.progress_percent !== undefined ? dto.progress_percent : dto.progressPercent;
    if (progressPercent !== undefined && progressPercent !== null) {
      const num = Number(progressPercent);
      if (isNaN(num) || num < 0 || num > 100) {
        throw new BadRequestException('progress_percent must be between 0 and 100');
      }
    }
    const sortOrder = dto.sort_order !== undefined ? dto.sort_order : dto.sortOrder;

    const [updated] = await db
      .updateTable('daily_report_items')
      .set({
        project_id: projectId !== undefined ? projectId : item.project_id,
        work_title: workTitle !== undefined ? workTitle : item.work_title,
        work_detail: workDetail !== undefined ? workDetail : item.work_detail,
        link: dto.link !== undefined ? dto.link : item.link,
        status: dto.status !== undefined ? dto.status : item.status,
        progress_percent: progressPercent !== undefined ? Number(progressPercent) : item.progress_percent,
        note: dto.note !== undefined ? dto.note : item.note,
        sort_order: sortOrder !== undefined ? sortOrder : item.sort_order,
        updated_at: new Date(),
      })
      .where('id', '=', itemId as any)
      .returningAll()
      .execute();

    return {
      id: String(updated.id),
      dailyReportId: String(updated.daily_report_id),
      projectId: updated.project_id ? String(updated.project_id) : null,
      workTitle: updated.work_title,
      workDetail: updated.work_detail,
      link: updated.link,
      status: updated.status,
      progressPercent: Number(updated.progress_percent || 0),
      note: updated.note,
      sortOrder: Number(updated.sort_order || 0),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    };
  }

  // ----------------------------------------------------------------
  // DAILY REPORT ITEMS: DELETE ITEM (Own report or Admin only)
  // ----------------------------------------------------------------
  async deleteDailyReportItem(
    itemId: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const item = await db
      .selectFrom('daily_report_items as dri')
      .innerJoin('daily_reports as dr', 'dr.id', 'dri.daily_report_id')
      .select(['dri.id', 'dr.employee_id as report_employee_id'])
      .where('dri.id', '=', itemId as any)
      .executeTakeFirst();

    if (!item) {
      throw new NotFoundException(`Daily report item #${itemId} not found`);
    }

    const isAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    if (!isAdmin && String(item.report_employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('You can only delete items in your own daily reports');
    }

    await db
      .deleteFrom('daily_report_items')
      .where('id', '=', itemId as any)
      .execute();

    return { success: true, id: itemId };
  }

  // ----------------------------------------------------------------
  // GET STATS & SUMMARY KPI (Scoped by Role)
  // ----------------------------------------------------------------
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
            .whereRef('tm_dept.employee_id', '=', 'dr.employee_id')
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
            .whereRef('dri_p.daily_report_id', '=', 'dr.id')
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
            .whereRef('dri_st.daily_report_id', '=', 'dr.id')
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
              .whereRef('dri_srch.daily_report_id', '=', 'dr.id')
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
              .whereRef('dr_s.id', '=', 'dri.daily_report_id')
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
        empDeptMap[String(et.employee_id)] = et.department;
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
