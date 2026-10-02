import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeAccountDto } from './dto/create-employee.dto';
import { ChangePositionDto } from './dto/change-position.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@Controller('employees')
@UseGuards(PermissionsGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @RequirePermissions('EMPLOYEE_CREATE')
  async createEmployeeAccount(
    @Body() dto: CreateEmployeeAccountDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId;
    if (!actorEmployeeId) {
      throw new ForbiddenException('User is not associated with an employee profile');
    }
    return await this.employeesService.createEmployeeAccount(dto, String(actorEmployeeId));
  }

  @Post(':id/change-position')
  @RequirePermissions('EMPLOYEE_UPDATE')
  async changePosition(
    @Param('id') id: string,
    @Body() dto: ChangePositionDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId;
    return await this.employeesService.changePosition(id, dto, actorEmployeeId);
  }

  @Put(':id')
  @RequirePermissions('EMPLOYEE_UPDATE')
  async updateEmployee(
    @Param('id') id: string,
    @Body() dto: any,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId;
    return await this.employeesService.updateEmployee(id, dto, actorEmployeeId);
  }

  @Get('meta/options')
  @RequirePermissions('EMPLOYEE_READ')
  async getFormOptions() {
    return await this.employeesService.getFormOptions();
  }

  @Get()
  @RequirePermissions('EMPLOYEE_READ')
  async getEmployees(@Query() query: any) {
    return await this.employeesService.getEmployees(query);
  }

  @Get(':id')
  @RequirePermissions('EMPLOYEE_READ')
  async getEmployeeById(@Param('id') id: string) {
    return await this.employeesService.getEmployeeById(id);
  }
}
