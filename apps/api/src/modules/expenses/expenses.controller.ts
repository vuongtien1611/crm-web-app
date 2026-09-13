import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ProcessPayrollExpenseDto } from './dto/process-payroll-expense.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@Controller('expenses')
@UseGuards(PermissionsGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('manual')
  @RequirePermissions('EXPENSE_CREATE')
  async createManualExpense(@Body() dto: CreateExpenseDto, @Req() req: any) {
    const actorEmployeeId = req.user?.employeeId;
    if (!actorEmployeeId) {
      throw new ForbiddenException('User is not associated with an employee profile');
    }
    return await this.expensesService.createManualExpense(dto, String(actorEmployeeId));
  }

  @Post('from-payroll')
  @RequirePermissions('EXPENSE_CREATE')
  async processPayrollExpense(
    @Body() dto: ProcessPayrollExpenseDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId;
    if (!actorEmployeeId) {
      throw new ForbiddenException('User is not associated with an employee profile');
    }
    return await this.expensesService.processPayrollExpense(dto, String(actorEmployeeId));
  }

  @Get('categories')
  @RequirePermissions('EXPENSE_READ')
  async getCategories() {
    return await this.expensesService.getCategories();
  }

  @Get()
  @RequirePermissions('EXPENSE_READ')
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sourceType') sourceType?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return await this.expensesService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sourceType,
      categoryId,
    });
  }

  @Get(':id')
  @RequirePermissions('EXPENSE_READ')
  async findById(@Param('id') id: string) {
    return await this.expensesService.findById(id);
  }
}
