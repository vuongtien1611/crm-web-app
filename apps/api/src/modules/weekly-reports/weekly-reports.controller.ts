import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { WeeklyReportsService } from './weekly-reports.service';
import { CreateWeeklyReportDto } from './dto/create-weekly-report.dto';
import { UpdateWeeklyReportDto } from './dto/update-weekly-report.dto';
import { QueryWeeklyReportDto } from './dto/query-weekly-report.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('weekly-reports')
@UseGuards(JwtAuthGuard)
export class WeeklyReportsController {
  constructor(private readonly weeklyReportsService: WeeklyReportsService) {}

  private sendExcelResponse(res: FastifyReply, filename: string, buffer: Buffer) {
    res.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.header('Content-Length', buffer.length);
    return res.send(buffer);
  }

  @Get('synthesize')
  async synthesize(
    @Query('team_id') teamId?: string,
    @Query('week_start') weekStart?: string,
    @Query('week_end') weekEnd?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.synthesize(
      teamId,
      String(weekStart || ''),
      String(weekEnd || ''),
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get('export/:id')
  async exportSingle(
    @Param('id') id: string,
    @Res() res: FastifyReply,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    const result = await this.weeklyReportsService.exportExcel(
      {},
      id,
      String(user.employeeId),
      user.roles || [],
    );
    return this.sendExcelResponse(res, result.filename, result.buffer);
  }

  @Get('export')
  async exportList(
    @Query() query: QueryWeeklyReportDto,
    @Res() res: FastifyReply,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    const result = await this.weeklyReportsService.exportExcel(
      query,
      undefined,
      String(user.employeeId),
      user.roles || [],
    );
    return this.sendExcelResponse(res, result.filename, result.buffer);
  }

  @Get(':id')
  async getWeeklyReportById(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.getWeeklyReportById(
      id,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Get()
  async getWeeklyReports(
    @Query() query: QueryWeeklyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.getWeeklyReports(
      query,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Post()
  async createWeeklyReport(
    @Body() dto: CreateWeeklyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.createWeeklyReport(
      dto,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Put(':id/complete')
  async completeWeeklyReport(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.completeWeeklyReport(
      id,
      String(user.employeeId),
      user.roles || [],
    );
  }

  @Put(':id')
  async updateWeeklyReport(
    @Param('id') id: string,
    @Body() dto: UpdateWeeklyReportDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    if (!user?.employeeId) {
      throw new UnauthorizedException('Employee identity required');
    }
    return this.weeklyReportsService.updateWeeklyReport(
      id,
      dto,
      String(user.employeeId),
      user.roles || [],
    );
  }
}
