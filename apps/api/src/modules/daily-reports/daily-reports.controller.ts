import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { DailyReportsService } from './daily-reports.service';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { UpdateDailyReportDto } from './dto/update-daily-report.dto';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('daily-reports')
@UseGuards(JwtAuthGuard)
export class DailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Post()
  async createDailyReport(
    @Body() dto: CreateDailyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required to submit daily reports');
    }
    return this.dailyReportsService.createDailyReport(dto, String(user.employeeId));
  }

  @Get()
  async getDailyReports(
    @Query() query: QueryDailyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getDailyReports(
      query,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get('stats')
  async getDailyReportStats(
    @Query() query: QueryDailyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getDailyReportStats(
      query,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get('filter-options')
  async getFilterOptions(@CurrentUser() user?: JwtPayload) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getFilterOptions(
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get('project-work-items')
  async getProjectWorkItems(
    @Query() query: QueryDailyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getProjectWorkItems(
      query,
      String(user.employeeId),
      user.roles || [],
    );
  }

  // Item endpoints
  @Post(':id/items')
  async addDailyReportItem(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.addDailyReportItem(
      id,
      dto,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get(':id/items')
  async getDailyReportItems(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getDailyReportItems(
      id,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Put('items/:itemId')
  async updateDailyReportItem(
    @Param('itemId') itemId: string,
    @Body() dto: any,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.updateDailyReportItem(
      itemId,
      dto,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Delete('items/:itemId')
  async deleteDailyReportItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.deleteDailyReportItem(
      itemId,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get(':id')
  async getDailyReportById(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.getDailyReportById(
      id,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Put(':id')
  async updateDailyReport(
    @Param('id') id: string,
    @Body() dto: UpdateDailyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.dailyReportsService.updateDailyReport(
      id,
      dto,
      String(user.employeeId),
      user.roles || [],
    );
  }
}
