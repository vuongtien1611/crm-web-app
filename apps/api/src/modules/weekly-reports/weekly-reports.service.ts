import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { CreateWeeklyReportDto } from './dto/create-weekly-report.dto';
import { UpdateWeeklyReportDto } from './dto/update-weekly-report.dto';
import { QueryWeeklyReportDto } from './dto/query-weekly-report.dto';
import * as ExcelJS from 'exceljs';

@Injectable()
export class WeeklyReportsService {
  constructor(private readonly kysely: KyselyService) {}

  /**
   * Enforce role and team scoping:
   * BOSS -> full company access + export (returns null)
   * Team Leader -> scoped to own led team (returns led team_id)
   * All other roles (ADMIN, SALE, DEV, SEO) -> ForbiddenException (403)
   */
  async enforceScope(actorEmployeeId: string, actorRoles: string[]): Promise<number | null> {
    const isBoss = actorRoles.includes('BOSS');
    if (isBoss) {
      return null;
    }

    const isLeader = actorRoles.some((r) => r.includes('LEADER'));
    if (!isLeader) {
      throw new ForbiddenException('Forbidden: Non-leader roles have no access to weekly reports');
    }

    const db = this.kysely.db;
    const ledTeam = await db
      .selectFrom('team_memberships')
      .select('team_id')
      .where('employee_id', '=', actorEmployeeId as any)
      .where('is_leader', '=', true)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    if (!ledTeam) {
      throw new ForbiddenException('Forbidden: You do not lead any active team');
    }

    return Number(ledTeam.team_id);
  }

  // ----------------------------------------------------------------
  // SYNTHESIZE FROM TEAM DAILY REPORTS
  // ----------------------------------------------------------------
  async synthesize(
    teamIdParam: number | string | undefined,
    weekStart: string,
    weekEnd: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const leaderTeamId = await this.enforceScope(actorEmployeeId, actorRoles);
    let targetTeamId: number;

    if (leaderTeamId !== null) {
      if (teamIdParam && Number(teamIdParam) !== leaderTeamId) {
        throw new ForbiddenException('Forbidden: Leader cannot access another team');
      }
      targetTeamId = leaderTeamId;
    } else {
      if (!teamIdParam) {
        throw new BadRequestException('team_id is required for synthesizing');
      }
      targetTeamId = Number(teamIdParam);
    }

    if (!weekStart || !weekEnd) {
      throw new BadRequestException('week_start and week_end are required (YYYY-MM-DD)');
    }

    const db = this.kysely.db;

    // Get team info
    const team = await db
      .selectFrom('teams')
      .selectAll()
      .where('id', '=', targetTeamId as any)
      .executeTakeFirst();

    if (!team) {
      throw new NotFoundException(`Team #${targetTeamId} not found`);
    }

    // Get current members of the team
    const members = await db
      .selectFrom('team_memberships as tm')
      .innerJoin('employees as e', 'e.id', 'tm.employee_id')
      .select(['e.id as employee_id', 'e.full_name', 'e.employee_code', 'tm.is_leader'])
      .where('tm.team_id', '=', targetTeamId as any)
      .where(sql`tm.effective_range @> NOW()` as any)
      .execute();

    const memberIds = members.map((m) => m.employee_id);

    if (memberIds.length === 0) {
      return {
        team_id: targetTeamId,
        team_name: team.name,
        week_start: weekStart,
        week_end: weekEnd,
        summary_work_done: 'Chưa có thành viên nào trong team.',
        summary_blockers: 'Không có khó khăn ghi nhận.',
        summary_next_week: 'Kế hoạch tuần tới chưa xác định.',
        member_reports: [],
      };
    }

    // Query daily reports of team members in week range
    const dailyReports = await db
      .selectFrom('daily_reports as dr')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .select([
        'dr.id',
        'dr.employee_id',
        'e.full_name',
        'e.employee_code',
        sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date'),
        'dr.difficulty',
        'dr.support_needed',
        'dr.next_plan',
        'dr.note',
      ])
      .where('dr.employee_id', 'in', memberIds as any[])
      .where(sql`to_char(dr.report_date, 'YYYY-MM-DD') >= ${weekStart}` as any)
      .where(sql`to_char(dr.report_date, 'YYYY-MM-DD') <= ${weekEnd}` as any)
      .orderBy('dr.report_date', 'asc')
      .execute();

    const reportIds = dailyReports.map((r) => r.id);

    // Query daily report items
    let reportItems: any[] = [];
    if (reportIds.length > 0) {
      reportItems = await db
        .selectFrom('daily_report_items as dri')
        .leftJoin('projects as p', 'p.id', 'dri.project_id')
        .select([
          'dri.id',
          'dri.daily_report_id',
          'dri.work_title',
          'dri.work_detail',
          'dri.status',
          'dri.progress_percent',
          'dri.note',
          'p.project_name as project_name',
        ])
        .where('dri.daily_report_id', 'in', reportIds as any[])
        .orderBy('dri.sort_order', 'asc')
        .execute();
    }

    // Aggregate work done
    const doneLines: string[] = [];
    const blockerLines: string[] = [];
    const nextWeekLines: string[] = [];

    // Group items by report
    const itemsByReport = new Map<string, any[]>();
    for (const item of reportItems) {
      const rid = String(item.daily_report_id);
      if (!itemsByReport.has(rid)) itemsByReport.set(rid, []);
      itemsByReport.get(rid)!.push(item);
    }

    for (const rep of dailyReports) {
      const empLabel = `${rep.full_name || rep.employee_code} (${rep.report_date})`;
      const rItems = itemsByReport.get(String(rep.id)) || [];

      for (const item of rItems) {
        if (item.status === 'DONE' || item.progress_percent >= 100) {
          doneLines.push(`- [${empLabel}] ${item.work_title}: ${item.work_detail}`);
        } else if (item.status === 'BLOCKED') {
          blockerLines.push(`- [${empLabel}] [BLOCKED] ${item.work_title}: ${item.work_detail} (${item.note || 'Cần hỗ trợ'})`);
        } else if (item.status === 'IN_PROGRESS') {
          doneLines.push(`- [${empLabel}] [Đang làm ${item.progress_percent}%] ${item.work_title}`);
        }
      }

      if (rep.difficulty && rep.difficulty.trim()) {
        blockerLines.push(`- [${empLabel}] Khó khăn: ${rep.difficulty.trim()}`);
      }
      if (rep.support_needed && rep.support_needed.trim()) {
        blockerLines.push(`- [${empLabel}] Cần hỗ trợ: ${rep.support_needed.trim()}`);
      }
      if (rep.next_plan && rep.next_plan.trim()) {
        nextWeekLines.push(`- [${empLabel}] Kế hoạch: ${rep.next_plan.trim()}`);
      }
    }

    return {
      team_id: targetTeamId,
      team_name: team.name,
      week_start: weekStart,
      week_end: weekEnd,
      summary_work_done: doneLines.length > 0 ? doneLines.join('\n') : 'Tổng hợp các công việc đã hoàn thành trong tuần.',
      summary_blockers: blockerLines.length > 0 ? blockerLines.join('\n') : 'Không có trở ngại lớn trong tuần.',
      summary_next_week: nextWeekLines.length > 0 ? nextWeekLines.join('\n') : 'Tiếp tục triển khai các mục tiêu công việc tuần tiếp theo.',
      member_reports_count: dailyReports.length,
      items_count: reportItems.length,
    };
  }

  // ----------------------------------------------------------------
  // CREATE WEEKLY REPORT
  // ----------------------------------------------------------------
  async createWeeklyReport(
    dto: CreateWeeklyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const leaderTeamId = await this.enforceScope(actorEmployeeId, actorRoles);
    let targetTeamId: number;

    if (leaderTeamId !== null) {
      if (dto.team_id && Number(dto.team_id) !== leaderTeamId) {
        throw new ForbiddenException('Forbidden: Leader cannot create report for another team');
      }
      targetTeamId = leaderTeamId;
    } else {
      if (!dto.team_id) {
        throw new BadRequestException('team_id is required');
      }
      targetTeamId = Number(dto.team_id);
    }

    const db = this.kysely.db;

    // Check unique (team_id, week_start, week_end)
    const existing = await db
      .selectFrom('weekly_reports')
      .select('id')
      .where('team_id', '=', targetTeamId as any)
      .where('week_start', '=', dto.week_start as any)
      .where('week_end', '=', dto.week_end as any)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(
        `Weekly report for team #${targetTeamId} from ${dto.week_start} to ${dto.week_end} already exists`,
      );
    }

    const [created] = await db
      .insertInto('weekly_reports')
      .values({
        team_id: targetTeamId as any,
        created_by_employee_id: actorEmployeeId as any,
        week_start: dto.week_start as any,
        week_end: dto.week_end as any,
        summary_work_done: dto.summary_work_done || null,
        summary_blockers: dto.summary_blockers || null,
        summary_next_week: dto.summary_next_week || null,
        leader_note: dto.leader_note || null,
        status: dto.status || 'DRAFT',
      })
      .returningAll()
      .execute();

    return this.getWeeklyReportById(String(created.id), actorEmployeeId, actorRoles);
  }

  // ----------------------------------------------------------------
  // GET WEEKLY REPORTS LIST
  // ----------------------------------------------------------------
  async getWeeklyReports(
    query: QueryWeeklyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const leaderTeamId = await this.enforceScope(actorEmployeeId, actorRoles);
    const db = this.kysely.db;

    let baseQuery = db
      .selectFrom('weekly_reports as wr')
      .innerJoin('teams as t', 't.id', 'wr.team_id')
      .innerJoin('employees as e', 'e.id', 'wr.created_by_employee_id')
      .select([
        'wr.id',
        'wr.team_id',
        't.name as team_name',
        'wr.created_by_employee_id',
        'e.full_name as creator_name',
        'e.employee_code as creator_code',
        sql<string>`to_char(wr.week_start, 'YYYY-MM-DD')`.as('week_start'),
        sql<string>`to_char(wr.week_end, 'YYYY-MM-DD')`.as('week_end'),
        'wr.summary_work_done',
        'wr.summary_blockers',
        'wr.summary_next_week',
        'wr.leader_note',
        'wr.status',
        'wr.created_at',
        'wr.updated_at',
      ]);

    // Scoping
    if (leaderTeamId !== null) {
      if (query.team_id && Number(query.team_id) !== leaderTeamId) {
        throw new ForbiddenException('Forbidden: Leader cannot view reports of another team');
      }
      baseQuery = baseQuery.where('wr.team_id', '=', leaderTeamId as any);
    } else {
      // BOSS / ADMIN
      if (query.team_id) {
        baseQuery = baseQuery.where('wr.team_id', '=', Number(query.team_id) as any);
      }
    }

    if (query.week_start) {
      baseQuery = baseQuery.where(sql`to_char(wr.week_start, 'YYYY-MM-DD') >= ${query.week_start}` as any);
    }
    if (query.week_end) {
      baseQuery = baseQuery.where(sql`to_char(wr.week_end, 'YYYY-MM-DD') <= ${query.week_end}` as any);
    }
    if (query.status) {
      baseQuery = baseQuery.where('wr.status', '=', query.status as any);
    }

    const reports = await baseQuery
      .orderBy('wr.week_start', 'desc')
      .orderBy('wr.id', 'desc')
      .execute();

    return reports.map((r) => ({
      id: String(r.id),
      teamId: Number(r.team_id),
      teamName: r.team_name,
      createdByEmployeeId: String(r.created_by_employee_id),
      creatorName: r.creator_name || r.creator_code,
      creatorCode: r.creator_code,
      weekStart: String(r.week_start),
      weekEnd: String(r.week_end),
      summaryWorkDone: r.summary_work_done,
      summaryBlockers: r.summary_blockers,
      summaryNextWeek: r.summary_next_week,
      leaderNote: r.leader_note,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  // ----------------------------------------------------------------
  // GET WEEKLY REPORT BY ID
  // ----------------------------------------------------------------
  async getWeeklyReportById(
    id: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const leaderTeamId = await this.enforceScope(actorEmployeeId, actorRoles);
    const db = this.kysely.db;

    const report = await db
      .selectFrom('weekly_reports as wr')
      .innerJoin('teams as t', 't.id', 'wr.team_id')
      .innerJoin('employees as e', 'e.id', 'wr.created_by_employee_id')
      .select([
        'wr.id',
        'wr.team_id',
        't.name as team_name',
        'wr.created_by_employee_id',
        'e.full_name as creator_name',
        'e.employee_code as creator_code',
        sql<string>`to_char(wr.week_start, 'YYYY-MM-DD')`.as('week_start'),
        sql<string>`to_char(wr.week_end, 'YYYY-MM-DD')`.as('week_end'),
        'wr.summary_work_done',
        'wr.summary_blockers',
        'wr.summary_next_week',
        'wr.leader_note',
        'wr.status',
        'wr.created_at',
        'wr.updated_at',
      ])
      .where('wr.id', '=', id as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Weekly report #${id} not found`);
    }

    if (leaderTeamId !== null && Number(report.team_id) !== leaderTeamId) {
      throw new ForbiddenException('Forbidden: Leader cannot access weekly report of another team');
    }

    return {
      id: String(report.id),
      teamId: Number(report.team_id),
      teamName: report.team_name,
      createdByEmployeeId: String(report.created_by_employee_id),
      creatorName: report.creator_name || report.creator_code,
      creatorCode: report.creator_code,
      weekStart: String(report.week_start),
      weekEnd: String(report.week_end),
      summaryWorkDone: report.summary_work_done,
      summaryBlockers: report.summary_blockers,
      summaryNextWeek: report.summary_next_week,
      leaderNote: report.leader_note,
      status: report.status,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
    };
  }

  // ----------------------------------------------------------------
  // UPDATE WEEKLY REPORT
  // ----------------------------------------------------------------
  async updateWeeklyReport(
    id: string,
    dto: UpdateWeeklyReportDto,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const leaderTeamId = await this.enforceScope(actorEmployeeId, actorRoles);
    const db = this.kysely.db;

    const report = await db
      .selectFrom('weekly_reports')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Weekly report #${id} not found`);
    }

    if (leaderTeamId !== null && Number(report.team_id) !== leaderTeamId) {
      throw new ForbiddenException('Forbidden: Leader cannot update weekly report of another team');
    }

    const [updated] = await db
      .updateTable('weekly_reports')
      .set({
        summary_work_done: dto.summary_work_done !== undefined ? dto.summary_work_done : report.summary_work_done,
        summary_blockers: dto.summary_blockers !== undefined ? dto.summary_blockers : report.summary_blockers,
        summary_next_week: dto.summary_next_week !== undefined ? dto.summary_next_week : report.summary_next_week,
        leader_note: dto.leader_note !== undefined ? dto.leader_note : report.leader_note,
        status: dto.status !== undefined ? dto.status : report.status,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return this.getWeeklyReportById(String(updated.id), actorEmployeeId, actorRoles);
  }

  // ----------------------------------------------------------------
  // COMPLETE WEEKLY REPORT
  // ----------------------------------------------------------------
  async completeWeeklyReport(
    id: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    return this.updateWeeklyReport(id, { status: 'COMPLETED' }, actorEmployeeId, actorRoles);
  }

  // ----------------------------------------------------------------
  // EXPORT EXCEL
  // ----------------------------------------------------------------
  async exportExcel(
    query: QueryWeeklyReportDto,
    reportId: string | undefined,
    actorEmployeeId: string,
    actorRoles: string[],
  ): Promise<{ buffer: Buffer; filename: string }> {
    let reports: any[];
    if (reportId) {
      const single = await this.getWeeklyReportById(reportId, actorEmployeeId, actorRoles);
      reports = [single];
    } else {
      reports = await this.getWeeklyReports(query, actorEmployeeId, actorRoles);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BranchSync CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Weekly Reports', {
      views: [{ showGridLines: true }],
    });

    // Styling headers
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Đội ngũ / Team', key: 'teamName', width: 25 },
      { header: 'Từ ngày (Start)', key: 'weekStart', width: 15 },
      { header: 'Đến ngày (End)', key: 'weekEnd', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Người lập', key: 'creatorName', width: 22 },
      { header: 'Công việc hoàn thành', key: 'summaryWorkDone', width: 45 },
      { header: 'Khó khăn / Trở ngại', key: 'summaryBlockers', width: 40 },
      { header: 'Kế hoạch tuần tới', key: 'summaryNextWeek', width: 45 },
      { header: 'Ghi chú Leader', key: 'leaderNote', width: 35 },
      { header: 'Ngày tạo', key: 'createdAt', width: 20 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1890FF' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    for (const rep of reports) {
      const row = sheet.addRow({
        id: rep.id,
        teamName: rep.teamName,
        weekStart: rep.weekStart,
        weekEnd: rep.weekEnd,
        status: rep.status === 'COMPLETED' ? 'Hoàn tất (COMPLETED)' : 'Bản nháp (DRAFT)',
        creatorName: rep.creatorName,
        summaryWorkDone: rep.summaryWorkDone || '',
        summaryBlockers: rep.summaryBlockers || '',
        summaryNextWeek: rep.summaryNextWeek || '',
        leaderNote: rep.leaderNote || '',
        createdAt: rep.createdAt ? new Date(rep.createdAt).toLocaleString('vi-VN') : '',
      });
      row.alignment = { vertical: 'top', wrapText: true };
    }

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const filename = reportId
      ? `Bao_Cao_Tuan_${reportId}.xlsx`
      : `Danh_Sach_Bao_Cao_Tuan_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return {
      buffer: Buffer.from(rawBuffer),
      filename,
    };
  }
}
