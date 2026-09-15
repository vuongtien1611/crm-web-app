import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  private checkFinanceAccess(user?: JwtPayload) {
    const roles = user?.roles || [];
    const hasAccess =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      roles.includes('ACCOUNTANT');

    if (!hasAccess) {
      throw new ForbiddenException(
        'Chỉ có cấp Quản trị (ADMIN / BOSS) hoặc Kế toán (ACCOUNTANT) mới có quyền truy cập dữ liệu Tài chính',
      );
    }
  }

  @Get('overview')
  async getOverview(
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    this.checkFinanceAccess(user);
    return await this.financeService.getOverview(period);
  }

  @Get('receivables')
  async getReceivables(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    this.checkFinanceAccess(user);
    return await this.financeService.getReceivables({
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('cashflow')
  async getCashflow(
    @Query('type') type?: 'IN' | 'OUT' | 'ALL',
    @Query('period') period?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    this.checkFinanceAccess(user);
    return await this.financeService.getCashflow({
      type,
      period,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 25,
    });
  }
}
