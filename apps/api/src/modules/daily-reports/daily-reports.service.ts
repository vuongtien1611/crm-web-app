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
import { DailyReportsReadService } from './daily-reports-read.service';
import { DailyReportsQueryService } from './daily-reports-query.service';

import { NotificationsService } from '../notifications/notifications.service';
import { normalizeDailyReportItem } from '../../common/mappers/data-mapping.util';

@Injectable()
export class DailyReportsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly notificationsService: NotificationsService,
    private readonly readService: DailyReportsReadService,
    private readonly queryService: DailyReportsQueryService,
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
        `Bạn đã gửi báo cáo công việc cho ngày ${dto.report_date} rồi. Mỗi nhân sự chỉ tạo 1 báo cáo/ngày. Vui lòng mở báo cáo hôm nay trong danh sách để cập nhật hoặc bấm "+ Thêm đầu việc".`,
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
          const norm = normalizeDailyReportItem(dto.items[idx], idx);
          if (norm.workTitle && norm.workDetail) {
            await trx
              .insertInto('daily_report_items')
              .values({
                daily_report_id: report.id,
                project_id: norm.projectId as any,
                work_title: norm.workTitle,
                work_detail: norm.workDetail,
                link: norm.link,
                status: norm.status,
                progress_percent: norm.progressPercent,
                note: norm.note,
                sort_order: norm.sortOrder,
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
  async getDailyReports(query: QueryDailyReportDto, actorEmployeeId: string, actorRoles: string[]) {
    return this.queryService.getDailyReports(query, actorEmployeeId, actorRoles);
  }

  async getDailyReportById(id: string, actorEmployeeId: string, actorRoles: string[]) {
    return this.queryService.getDailyReportById(id, actorEmployeeId, actorRoles);
  }

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

    return await this.kysely.db.transaction().execute(async (trx) => {
      const [updated] = await trx
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

      // If support_needed was updated and is non-empty, send notification if changed
      if (
        dto.support_needed &&
        dto.support_needed.trim() !== '' &&
        dto.support_needed !== report.support_needed &&
        this.notificationsService
      ) {
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
            content: `${empName} cập nhật cần hỗ trợ: "${dto.support_needed.trim()}"`,
            deepLinkUrl: `/daily-reports?employee_id=${actorEmployeeId}&date=${report.report_date}`,
            entityType: 'DAILY_REPORT',
            entityId: String(report.id),
          },
          trx,
        );
      }

      // Sync items if dto.items is provided
      if (dto.items && Array.isArray(dto.items)) {
        const currentItems = await trx
          .selectFrom('daily_report_items')
          .select(['id'])
          .where('daily_report_id', '=', id as any)
          .execute();

        const keptItemIds: number[] = [];

        for (let idx = 0; idx < dto.items.length; idx++) {
          const norm = normalizeDailyReportItem(dto.items[idx], idx);
          if (!norm.workTitle || !norm.workDetail) continue;

          const itemId = norm.id ? Number(norm.id) : null;
          const existingItem = itemId && currentItems.some((ci) => Number(ci.id) === itemId);

          if (existingItem) {
            await trx
              .updateTable('daily_report_items')
              .set({
                work_title: norm.workTitle,
                work_detail: norm.workDetail,
                link: norm.link,
                status: norm.status,
                progress_percent: norm.progressPercent,
                note: norm.note,
                sort_order: norm.sortOrder,
                project_id: norm.projectId as any,
                updated_at: new Date(),
              })
              .where('id', '=', itemId as any)
              .execute();
            keptItemIds.push(itemId);
          } else {
            const [inserted] = await trx
              .insertInto('daily_report_items')
              .values({
                daily_report_id: report.id,
                work_title: norm.workTitle,
                work_detail: norm.workDetail,
                link: norm.link,
                status: norm.status,
                progress_percent: norm.progressPercent,
                note: norm.note,
                sort_order: norm.sortOrder,
                project_id: norm.projectId as any,
              })
              .returning('id')
              .execute();
            if (inserted?.id) {
              keptItemIds.push(Number(inserted.id));
            }
          }
        }

        // Delete any items that were removed
        const toDelete = currentItems.map((c) => Number(c.id)).filter((cid) => !keptItemIds.includes(cid));
        if (toDelete.length > 0) {
          await trx
            .deleteFrom('daily_report_items')
            .where('id', 'in', toDelete as any)
            .execute();
        }
      }

      return updated;
    });
  }

  // ----------------------------------------------------------------
  // DAILY REPORT ITEMS: GET ITEMS FOR REPORT
  // ----------------------------------------------------------------
  async getDailyReportItems(reportId: string, actorEmployeeId: string, actorRoles: string[]) {
    return this.queryService.getDailyReportItems(reportId, actorEmployeeId, actorRoles);
  }

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
  // DELETE DAILY REPORT (Own report or Admin only)
  // ----------------------------------------------------------------
  async deleteDailyReport(
    id: string,
    actorEmployeeId: string,
    actorRoles: string[],
  ) {
    const db = this.kysely.db;
    const report = await db
      .selectFrom('daily_reports')
      .select(['id', 'employee_id'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!report) {
      throw new NotFoundException(`Daily report #${id} not found`);
    }

    const isAdmin = actorRoles.includes('ADMIN') || actorRoles.includes('BOSS');
    if (!isAdmin && String(report.employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('You can only delete your own daily reports');
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('daily_report_items')
        .where('daily_report_id', '=', id as any)
        .execute();

      await trx
        .deleteFrom('daily_reports')
        .where('id', '=', id as any)
        .execute();
    });

    return { success: true, id };
  }

  // ----------------------------------------------------------------
  // GET STATS & SUMMARY KPI (Scoped by Role)
  // ----------------------------------------------------------------
  async getDailyReportStats(query: QueryDailyReportDto, actorEmployeeId: string, actorRoles: string[]) {
    return this.readService.getDailyReportStats(query, actorEmployeeId, actorRoles);
  }

  async getFilterOptions(actorEmployeeId: string, actorRoles: string[]) {
    return this.readService.getFilterOptions(actorEmployeeId, actorRoles);
  }

  async getProjectWorkItems(query: QueryDailyReportDto, actorEmployeeId: string, actorRoles: string[]) {
    return this.readService.getProjectWorkItems(query, actorEmployeeId, actorRoles);
  }

}
