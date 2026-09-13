import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  FORMULA_INJECTION_PREFIXES,
  MAX_EXPORT_ROWS,
  EXCEL_STYLES,
} from './export.constants';
import { ExcelColumnDef, ExportResult } from './export.types';
import { LeadsService } from '../leads/leads.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { ProjectsService } from '../projects/projects.service';
import { KpiService } from '../kpi/kpi.service';
import { PayrollService } from '../payroll/payroll.service';
import { ExpensesService } from '../expenses/expenses.service';
import { TeamsService } from '../teams/teams.service';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

@Injectable()
export class ExportService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly leadsService: LeadsService,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
    private readonly projectsService: ProjectsService,
    private readonly kpiService: KpiService,
    private readonly payrollService: PayrollService,
    private readonly expensesService: ExpensesService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Neutralizes potential formula injection (CSV/Excel Formula Injection).
   * If a string starts with =, +, -, @, \t, or \r, prefix it with a single quote.
   */
  sanitizeCellValue(value: any): any {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      const trimmedStart = value;
      if (
        FORMULA_INJECTION_PREFIXES.some((prefix) =>
          trimmedStart.startsWith(prefix),
        )
      ) {
        return `'${value}`;
      }
      return value;
    }
    return value;
  }

  /**
   * Helper to resolve team member IDs for a team leader
   */
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m: any) => String(m.id));
  }

  /**
   * Generates a styled Excel workbook buffer from column definitions and rows.
   */
  async buildWorkbook<T>(
    sheetName: string,
    columns: ExcelColumnDef<T>[],
    rows: T[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BranchSync CRM';
    workbook.lastModifiedBy = 'BranchSync CRM';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
    });

    // Configure headers
    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || Math.max(col.header.length + 4, 12),
    }));

    // Header styling
    const headerRow = sheet.getRow(1);
    headerRow.height = 26;
    headerRow.font = {
      name: EXCEL_STYLES.HEADER_FONT_NAME,
      size: EXCEL_STYLES.HEADER_FONT_SIZE,
      bold: true,
      color: { argb: EXCEL_STYLES.HEADER_FONT_COLOR },
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: EXCEL_STYLES.HEADER_FILL_COLOR },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Insert rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowValues: any = {};

      for (const col of columns) {
        let rawVal = col.getValue ? col.getValue(row) : (row as any)[col.key];
        let cellVal = this.sanitizeCellValue(rawVal);

        if (col.format === 'date' && rawVal) {
          try {
            cellVal = new Date(rawVal).toISOString().slice(0, 10);
          } catch {
            cellVal = String(rawVal);
          }
        } else if (col.format === 'datetime' && rawVal) {
          try {
            cellVal = new Date(rawVal).toISOString().replace('T', ' ').slice(0, 19);
          } catch {
            cellVal = String(rawVal);
          }
        } else if (col.format === 'currency' && typeof cellVal === 'number') {
          // Number remains number for currency format
        }

        rowValues[col.key] = cellVal;
      }

      const insertedRow = sheet.addRow(rowValues);
      insertedRow.height = 20;
      insertedRow.font = {
        name: EXCEL_STYLES.ROW_FONT_NAME,
        size: EXCEL_STYLES.ROW_FONT_SIZE,
      };

      // Set formats and borders
      insertedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = columns[colNumber - 1];
        if (colDef?.format === 'currency') {
          cell.numFmt = '#,##0 "VND"';
          cell.alignment = { horizontal: 'right' };
        } else if (colDef?.format === 'number') {
          cell.alignment = { horizontal: 'right' };
        }

        cell.border = {
          top: { style: 'thin', color: { argb: EXCEL_STYLES.BORDER_COLOR } },
          left: { style: 'thin', color: { argb: EXCEL_STYLES.BORDER_COLOR } },
          bottom: { style: 'thin', color: { argb: EXCEL_STYLES.BORDER_COLOR } },
          right: { style: 'thin', color: { argb: EXCEL_STYLES.BORDER_COLOR } },
        };
      });
    }

    // Auto width adjustment
    sheet.columns.forEach((column) => {
      let maxLen = column.header ? column.header.length : 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellLen = cell.value ? String(cell.value).length : 0;
        if (cellLen > maxLen) {
          maxLen = cellLen;
        }
      });
      column.width = Math.min(Math.max(maxLen + 3, 12), 50);
    });

    const rawBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(rawBuffer as any);
  }

  // ==========================================================================
  // 1. LEADS EXPORT
  // ==========================================================================
  async exportLeads(actor: any, filter: any = {}): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const permissions: string[] = actor?.permissions || [];
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('LEAD_VIEW_ALL');

    let assignedSaleIdOnly: string | undefined = undefined;
    let assignedSaleIdIn: string[] | undefined = undefined;

    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && actor?.employeeId) {
      assignedSaleIdIn = await this.resolveTeamMemberIds(actor.employeeId);
    } else if (!hasGlobalView && actor?.employeeId) {
      assignedSaleIdOnly = String(actor.employeeId);
    }

    const leadsResult = await this.leadsService.findLeads({
      ...filter,
      page: 1,
      limit: MAX_EXPORT_ROWS,
      assignedSaleIdOnly,
      assignedSaleIdIn,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'Mã Lead', key: 'id', width: 12 },
      { header: 'Họ và tên', key: 'full_name', width: 22 },
      { header: 'Số điện thoại', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Nền tảng', key: 'platform_name', width: 15 },
      { header: 'Kênh', key: 'channel_name', width: 18 },
      { header: 'Chất lượng', key: 'quality', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Sale phụ trách', key: 'assigned_sale_name', width: 20 },
      { header: 'Mã Sale', key: 'assigned_sale_code', width: 14 },
      { header: 'Người tạo', key: 'creator_employee_name', width: 20 },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `leads_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Leads', columns, leadsResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: leadsResult.data.length,
    };
  }

  // ==========================================================================
  // 2. ORDERS EXPORT
  // ==========================================================================
  async exportOrders(actor: any, filter: any = {}): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const permissions: string[] = actor?.permissions || [];
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('ORDER_VIEW_ALL');

    let closingSaleIdOnly: string | undefined = undefined;
    let closingSaleIdIn: string[] | undefined = undefined;

    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && actor?.employeeId) {
      closingSaleIdIn = await this.resolveTeamMemberIds(actor.employeeId);
    } else if (!hasGlobalView && actor?.employeeId) {
      closingSaleIdOnly = String(actor.employeeId);
    }

    const ordersResult = await this.ordersService.findOrders({
      ...filter,
      page: 1,
      limit: MAX_EXPORT_ROWS,
      closingSaleIdOnly,
      closingSaleIdIn,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'Mã đơn hàng', key: 'order_code', width: 18 },
      { header: 'Khách hàng', key: 'company_name', width: 26 },
      { header: 'Người liên hệ', key: 'primary_contact_name', width: 20 },
      { header: 'Trạng thái quy trình', key: 'workflow_status', width: 20 },
      { header: 'Số lượng dịch vụ', key: 'itemCount', format: 'number', width: 16 },
      {
        header: 'Tổng giá trị (VND)',
        key: 'totalNetValue',
        format: 'currency',
        width: 22,
      },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `orders_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Orders', columns, ordersResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: ordersResult.data.length,
    };
  }

  // ==========================================================================
  // 3. PAYMENTS EXPORT (DATA MINIMIZED - NO STORAGE SECRETS / OBJECTKEYS)
  // ==========================================================================
  async exportPayments(actor: any, filter: any = {}): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const permissions: string[] = actor?.permissions || [];

    // Payments requires PAYMENT_READ permission (ACCOUNTANT, ADMIN, BOSS)
    // Tech leaders / Sales have no access unless explicitly granted
    const paymentsResult = await this.paymentsService.findPayments({
      status: filter.status,
      page: 1,
      limit: MAX_EXPORT_ROWS,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'Mã thanh toán', key: 'payment_code', width: 18 },
      { header: 'Phương thức TT', key: 'payment_method', width: 18 },
      { header: 'Số tiền (VND)', key: 'gross_cash_amount', format: 'currency', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Người tạo', key: 'created_by_employee_id', width: 16 },
      { header: 'Người xác nhận', key: 'confirmed_by_employee_id', width: 16 },
      { header: 'Ngày xác nhận', key: 'confirmed_at', format: 'datetime', width: 20 },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
      // NOTE: evidence_url and storage objectKey are deliberately OMITTED for data minimization
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `payments_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Payments', columns, paymentsResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: paymentsResult.data.length,
    };
  }

  // ==========================================================================
  // 4. PROJECTS EXPORT
  // ==========================================================================
  async exportProjects(actor: any, filter: any = {}): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const permissions: string[] = actor?.permissions || [];
    const isElevated =
      roles.some((r: string) => ['ADMIN', 'BOSS'].includes(r)) ||
      permissions.includes('PROJECT_VIEW_ALL');

    let assignedEmployeeIdOnly: string | undefined = undefined;
    let assignedEmployeeIdIn: string[] | undefined = undefined;

    if (!isElevated && actor?.employeeId) {
      if (roles.includes('DEV_TEAM_LEADER') || roles.includes('SEO_TEAM_LEADER')) {
        assignedEmployeeIdIn = await this.resolveTeamMemberIds(actor.employeeId);
      } else {
        assignedEmployeeIdOnly = String(actor.employeeId);
      }
    }

    const projectsResult = await this.projectsService.findProjects({
      ...filter,
      page: 1,
      limit: MAX_EXPORT_ROWS,
      assignedEmployeeIdOnly,
      assignedEmployeeIdIn,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'Tên dự án', key: 'project_name', width: 26 },
      { header: 'Mã đơn hàng', key: 'order_code', width: 18 },
      { header: 'Khách hàng', key: 'company_name', width: 24 },
      { header: 'Dịch vụ', key: 'service_name', width: 22 },
      { header: 'Trạng thái', key: 'status', width: 16 },
      {
        header: 'Tiến độ (%)',
        key: 'materialized_progress_percent',
        format: 'number',
        width: 14,
      },
      {
        header: 'Dev chính',
        key: 'primaryAssignees',
        width: 22,
        getValue: (row: any) =>
          row.primaryAssignees?.map((a: any) => a.employee_name).join(', ') || '',
      },
      {
        header: 'Dev hỗ trợ',
        key: 'supportAssignees',
        width: 22,
        getValue: (row: any) =>
          row.supportAssignees?.map((a: any) => a.employee_name).join(', ') || '',
      },
      { header: 'Bắt đầu', key: 'started_at', format: 'date', width: 14 },
      { header: 'Hoàn thành', key: 'completed_at', format: 'date', width: 14 },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `projects_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Projects', columns, projectsResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: projectsResult.data.length,
    };
  }

  // ==========================================================================
  // 5. KPI EXPORT
  // ==========================================================================
  async exportKpi(actor: any, filter: any = {}): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const hasGlobalView = roles.includes('ADMIN') || roles.includes('BOSS');

    const isTeamLeader = roles.some((r: string) =>
      ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'].includes(r),
    );

    let employeeIdIn: string[] | undefined = undefined;
    let employeeId: string | undefined = filter.employeeId;

    if (!hasGlobalView && isTeamLeader && actor?.employeeId) {
      employeeIdIn = await this.resolveTeamMemberIds(actor.employeeId);
    } else if (!hasGlobalView && actor?.employeeId) {
      employeeId = String(actor.employeeId);
    }

    const kpiResult = await this.kpiService.findKpiEvents({
      page: 1,
      limit: MAX_EXPORT_ROWS,
      employeeId,
      employeeIdIn,
      targetPeriod: filter.targetPeriod,
      sourceType: filter.sourceType,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'ID sự kiện', key: 'id', width: 12 },
      { header: 'Nhân viên', key: 'employee_name', width: 22 },
      { header: 'Chính sách KPI', key: 'policy_name', width: 24 },
      { header: 'Nguồn', key: 'source_type', width: 16 },
      { header: 'Loại chỉ số', key: 'metric_type', width: 18 },
      { header: 'Giá trị chỉ số', key: 'metric_value', format: 'number', width: 16 },
      { header: 'Điểm KPI', key: 'kpi_points', format: 'number', width: 14 },
      {
        header: 'Doanh số đủ ĐK (VND)',
        key: 'eligible_revenue',
        format: 'currency',
        width: 22,
      },
      { header: 'Kỳ KPI', key: 'target_kpi_period', width: 14 },
      { header: 'Ngày ghi nhận', key: 'created_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `kpi_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('KPI', columns, kpiResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: kpiResult.data.length,
    };
  }

  // ==========================================================================
  // 6. PAYROLL EXPORT
  // ==========================================================================
  async exportPayroll(actor: any, periodId: string): Promise<ExportResult> {
    const employees = await this.payrollService.findPeriodEmployees(periodId, actor);

    const columns: ExcelColumnDef[] = [
      { header: 'Mã nhân viên', key: 'employee_code', width: 16 },
      { header: 'Họ và tên', key: 'employee_name', width: 24 },
      { header: 'Lương cơ bản (VND)', key: 'base_salary', format: 'currency', width: 20 },
      {
        header: 'Hoa hồng (VND)',
        key: 'released_commission_amount',
        format: 'currency',
        width: 20,
      },
      {
        header: 'Thưởng KPI (VND)',
        key: 'kpi_bonus_amount',
        format: 'currency',
        width: 20,
      },
      {
        header: 'Phụ cấp / Override (VND)',
        key: 'team_override_amount',
        format: 'currency',
        width: 22,
      },
      {
        header: 'Điều chỉnh (VND)',
        key: 'adjustment_amount',
        format: 'currency',
        width: 18,
      },
      {
        header: 'Thực lĩnh (VND)',
        key: 'net_salary_amount',
        format: 'currency',
        width: 22,
      },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
      // NOTE: Password hashes, credentials, banking tokens are strictly NOT exported
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `payroll_period_${periodId}_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Payroll', columns, employees);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: employees.length,
    };
  }

  // ==========================================================================
  // 7. EXPENSES EXPORT
  // ==========================================================================
  async exportExpenses(actor: any, filter: any = {}): Promise<ExportResult> {
    const expensesResult = await this.expensesService.findAll({
      sourceType: filter.sourceType,
      categoryId: filter.categoryId,
      page: 1,
      limit: MAX_EXPORT_ROWS,
    });

    const columns: ExcelColumnDef[] = [
      { header: 'Mã chi phí', key: 'id', width: 12 },
      { header: 'Mã danh mục', key: 'category_code', width: 16 },
      { header: 'Tên danh mục', key: 'category_name', width: 24 },
      { header: 'Số tiền (VND)', key: 'amount', format: 'currency', width: 20 },
      { header: 'Ngày chi', key: 'expense_date', format: 'date', width: 14 },
      { header: 'Nguồn chi', key: 'source_type', width: 16 },
      { header: 'Ghi chú', key: 'note', width: 30 },
      { header: 'Ngày tạo', key: 'created_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `expenses_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('Expenses', columns, expensesResult.data);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: expensesResult.data.length,
    };
  }

  // ==========================================================================
  // 8. DAILY & WEEKLY REPORTS EXPORT
  // ==========================================================================
  async exportDailyReports(
    actor: any,
    filter: {
      date?: string;
      month?: string;
      fromDate?: string;
      toDate?: string;
      weekStart?: string;
      weekEnd?: string;
      department?: string;
      teamId?: string;
      employeeId?: string;
      projectId?: string;
      status?: string;
      search?: string;
      scope?: string;
    } = {},
  ): Promise<ExportResult> {
    const roles: string[] = actor?.roles || [];
    const hasGlobalView = roles.includes('ADMIN') || roles.includes('BOSS');
    const isTeamLeader = roles.some((r: string) =>
      ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'].includes(r),
    );

    let baseQuery = this.kysely.db
      .selectFrom('daily_reports as dr')
      .innerJoin('employees as e', 'e.id', 'dr.employee_id')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .leftJoin('team_memberships as tm', (join) =>
        join.onRef('tm.employee_id', '=', 'e.id').on(sql`tm.effective_range @> NOW()` as any),
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .leftJoin('daily_report_items as dri', 'dri.daily_report_id', 'dr.id')
      .leftJoin('projects as prj', 'prj.id', 'dri.project_id')
      .select([
        'dr.id',
        sql<string>`to_char(dr.report_date, 'YYYY-MM-DD')`.as('report_date'),
        'e.employee_code',
        'e.full_name as employee_name',
        'p.name as position_name',
        't.name as team_name',
        't.department as department',
        'prj.project_name',
        sql<string>`coalesce(dri.work_title, '(Không có công việc)')`.as('task_name'),
        sql<string>`coalesce(dri.status, 'IN_PROGRESS')`.as('task_status'),
        'dri.progress_percent',
        'dr.difficulty',
        'dr.support_needed',
        'dr.next_plan',
        'dr.note',
        'dr.submitted_at',
      ]);

    if (!hasGlobalView && isTeamLeader && actor?.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(actor.employeeId);
      const allowedIds = Array.from(new Set([...teamMemberIds, String(actor.employeeId)]));
      baseQuery = baseQuery.where('dr.employee_id', 'in', allowedIds as any);
    } else if (!hasGlobalView && actor?.employeeId) {
      baseQuery = baseQuery.where('dr.employee_id', '=', actor.employeeId as any);
    }

    if (filter.employeeId) {
      baseQuery = baseQuery.where('dr.employee_id', '=', filter.employeeId as any);
    }
    if (filter.teamId) {
      baseQuery = baseQuery.where('t.id', '=', filter.teamId as any);
    }
    if (filter.department) {
      baseQuery = baseQuery.where('t.department', '=', filter.department as any);
    }
    if (filter.projectId) {
      baseQuery = baseQuery.where('dri.project_id', '=', filter.projectId as any);
    }
    if (filter.status) {
      baseQuery = baseQuery.where('dri.status', '=', filter.status as any);
    }
    if (filter.search) {
      const searchPattern = `%${filter.search}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb('e.full_name', 'ilike', searchPattern),
          eb('e.employee_code', 'ilike', searchPattern),
          eb('dri.work_title', 'ilike', searchPattern),
          eb('dri.work_detail', 'ilike', searchPattern),
        ]),
      );
    }

    if (filter.fromDate) {
      baseQuery = baseQuery.where('dr.report_date', '>=', filter.fromDate as any);
    }
    if (filter.toDate) {
      baseQuery = baseQuery.where('dr.report_date', '<=', filter.toDate as any);
    }
    if (filter.date) {
      baseQuery = baseQuery.where(
        sql`to_char(dr.report_date, 'YYYY-MM-DD') = ${filter.date}` as any,
      );
    }
    if (filter.month) {
      baseQuery = baseQuery.where(
        sql`to_char(dr.report_date, 'YYYY-MM') = ${filter.month}` as any,
      );
    }
    if (filter.weekStart && filter.weekEnd) {
      baseQuery = baseQuery
        .where('dr.report_date', '>=', filter.weekStart as any)
        .where('dr.report_date', '<=', filter.weekEnd as any);
    }

    // No limit to export full filtered results
    const rows = await baseQuery
      .orderBy('dr.report_date', 'desc')
      .orderBy('dr.submitted_at', 'desc')
      .execute();

    const columns: ExcelColumnDef[] = [
      { header: 'Ngày báo cáo', key: 'report_date', width: 14 },
      { header: 'Mã NV', key: 'employee_code', width: 14 },
      { header: 'Họ và tên', key: 'employee_name', width: 22 },
      { header: 'Phòng ban', key: 'department', width: 15 },
      { header: 'Team', key: 'team_name', width: 18 },
      { header: 'Dự án', key: 'project_name', width: 22 },
      { header: 'Công việc', key: 'task_name', width: 30 },
      { header: 'Trạng thái', key: 'task_status', width: 16 },
      { header: 'Tiến độ (%)', key: 'progress_percent', format: 'number', width: 14 },
      { header: 'Khó khăn / Trở ngại', key: 'difficulty', width: 30 },
      { header: 'Cần hỗ trợ', key: 'support_needed', width: 30 },
      { header: 'Kế hoạch tiếp theo', key: 'next_plan', width: 35 },
      { header: 'Thời gian nộp', key: 'submitted_at', format: 'datetime', width: 20 },
    ];

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `daily_reports_${todayStr}.xlsx`;
    const buffer = await this.buildWorkbook('DailyReports', columns, rows);

    return {
      filename,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: rows.length,
    };
  }
}
