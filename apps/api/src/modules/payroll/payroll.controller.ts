import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@Controller('payroll')
@UseGuards(PermissionsGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('periods')
  @RequirePermissions('PAYROLL_CALCULATE')
  async createPeriod(@Body() dto: CreatePayrollPeriodDto) {
    return await this.payrollService.createPeriod(dto);
  }

  @Get('periods')
  @RequirePermissions('PAYROLL_READ')
  async findPeriods(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return await this.payrollService.findPeriods({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Get('periods/:id')
  @RequirePermissions('PAYROLL_READ')
  async findPeriodById(@Param('id') id: string) {
    return await this.payrollService.findPeriodById(id);
  }

  @Post('periods/:id/calculate')
  @RequirePermissions('PAYROLL_CALCULATE')
  async calculatePayrollPeriod(@Param('id') id: string, @Req() req: any) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.payrollService.calculatePayrollPeriod(id, actorEmployeeId);
  }

  @Post('periods/:id/submit-review')
  @RequirePermissions('PAYROLL_REVIEW')
  async submitReview(@Param('id') id: string, @Req() req: any) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.payrollService.submitReview(id, actorEmployeeId);
  }

  @Post('periods/:id/approve')
  @RequirePermissions('PAYROLL_APPROVE')
  async approvePeriod(@Param('id') id: string, @Req() req: any) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.payrollService.approvePeriod(id, actorEmployeeId);
  }

  @Post('periods/:id/lock')
  @RequirePermissions('PAYROLL_LOCK')
  async lockPeriod(@Param('id') id: string, @Req() req: any) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.payrollService.lockPeriod(id, actorEmployeeId);
  }

  @Post('periods/:id/adjustments')
  @RequirePermissions('PAYROLL_REVIEW')
  async createAdjustment(
    @Param('id') id: string,
    @Body() dto: CreatePayrollAdjustmentDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.payrollService.createAdjustment(id, dto, actorEmployeeId);
  }

  @Get('periods/:id/employees')
  @RequirePermissions('PAYROLL_READ')
  async findPeriodEmployees(@Param('id') id: string, @Req() req: any) {
    return await this.payrollService.findPeriodEmployees(id, req.user);
  }

  @Get('periods/:id/employees/:employeeId')
  @RequirePermissions('PAYROLL_READ')
  async findEmployeePayrollDetail(
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Req() req: any,
  ) {
    return await this.payrollService.findEmployeePayrollDetail(id, employeeId, req.user);
  }
}
