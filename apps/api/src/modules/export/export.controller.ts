import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('exports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  private sendExcelResponse(res: FastifyReply, filename: string, buffer: Buffer) {
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('leads')
  @RequirePermissions('LEAD_READ')
  async exportLeads(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('quality') quality?: string,
    @Query('platformId') platformId?: string,
    @Query('channelId') channelId?: string,
    @Query('q') q?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportLeads(user, {
      status,
      quality,
      platformId,
      channelId,
      q,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('orders')
  @RequirePermissions('ORDER_READ')
  async exportOrders(
    @CurrentUser() user: any,
    @Query('workflowStatus') workflowStatus?: string,
    @Query('accountId') accountId?: string,
    @Query('q') q?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportOrders(user, {
      workflowStatus,
      accountId,
      q,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('payments')
  @RequirePermissions('PAYMENT_READ')
  async exportPayments(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportPayments(user, { status });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('projects')
  @RequirePermissions('PROJECT_READ')
  async exportProjects(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportProjects(user, {
      status,
      q,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('kpi')
  @RequirePermissions('KPI_READ')
  async exportKpi(
    @CurrentUser() user: any,
    @Query('targetPeriod') targetPeriod?: string,
    @Query('sourceType') sourceType?: string,
    @Query('employeeId') employeeId?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportKpi(user, {
      targetPeriod,
      sourceType,
      employeeId,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('payroll/periods/:id')
  @RequirePermissions('PAYROLL_READ')
  async exportPayroll(
    @CurrentUser() user: any,
    @Param('id') periodId: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportPayroll(user, periodId);
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('expenses')
  @RequirePermissions('EXPENSE_READ')
  async exportExpenses(
    @CurrentUser() user: any,
    @Query('sourceType') sourceType?: string,
    @Query('categoryId') categoryId?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportExpenses(user, {
      sourceType,
      categoryId,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }

  @Get('daily-reports')
  async exportDailyReports(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('weekStart') weekStart?: string,
    @Query('weekEnd') weekEnd?: string,
    @Query('department') department?: string,
    @Query('teamId') teamId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('scope') scope?: string,
    @Res() res?: FastifyReply,
  ) {
    const result = await this.exportService.exportDailyReports(user, {
      date,
      month,
      fromDate,
      toDate,
      weekStart,
      weekEnd,
      department,
      teamId,
      employeeId,
      projectId,
      status,
      search,
      scope,
    });
    return this.sendExcelResponse(res!, result.filename, result.buffer);
  }
}
