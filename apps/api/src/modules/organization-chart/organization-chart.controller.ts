import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { OrganizationChartService } from './organization-chart.service';
import { MoveMemberDto } from './dto/move-member.dto';
import { ChangeLeaderDto } from './dto/change-leader.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BossOnlyGuard } from '../rbac/guards/boss-only.guard';

@Controller('organization-chart')
@UseGuards(JwtAuthGuard, BossOnlyGuard)
export class OrganizationChartController {
  constructor(
    private readonly orgChartService: OrganizationChartService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getOrganizationChart() {
    return await this.orgChartService.getOrganizationChart();
  }

  @Get('employee-workload/:employeeId')
  @HttpCode(HttpStatus.OK)
  async getEmployeeWorkload(@Param('employeeId') employeeId: string) {
    return await this.orgChartService.getEmployeeWorkload(employeeId);
  }

  @Post('move-member')
  @HttpCode(HttpStatus.OK)
  async moveMember(@Body() dto: MoveMemberDto, @Req() req: any) {
    const actorEmployeeId = req.user?.employeeId || req.user?.sub || '1';
    return await this.orgChartService.moveMember(dto, actorEmployeeId);
  }

  @Post('change-leader')
  @HttpCode(HttpStatus.OK)
  async changeLeader(@Body() dto: ChangeLeaderDto, @Req() req: any) {
    const actorEmployeeId = req.user?.employeeId || req.user?.sub || '1';
    return await this.orgChartService.changeLeader(dto, actorEmployeeId);
  }
}
