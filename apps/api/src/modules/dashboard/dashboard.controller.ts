import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('executive')
  async getExecutiveDashboard(
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const roles = user?.roles || [];
    const isExecutive = roles.includes('ADMIN') || roles.includes('BOSS');

    if (!isExecutive) {
      throw new ForbiddenException(
        'Chỉ có cấp Quản trị (ADMIN / BOSS) mới có quyền truy cập Executive Dashboard',
      );
    }

    return await this.dashboardService.getExecutiveDashboard(period);
  }
}
