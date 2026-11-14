import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto, TeamDepartment } from './dto/create-team.dto';
import { AssignMemberDto } from './dto/assign-member.dto';
import { MoveMemberDto } from './dto/move-member.dto';
import { ChangeLeaderDto } from './dto/change-leader.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @RequirePermissions('TEAM_READ')
  async getTeams(
    @Query('department') department?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getTeams({ department, search }, user!);
  }

  @Get('workspaces/sales/summary')
  @RequirePermissions('TEAM_READ')
  async getSalesWorkspaceSummary(
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getSalesWorkspaceSummary(user!, period);
  }

  @Get('workspaces/dev/summary')
  @RequirePermissions('TEAM_READ')
  async getDevWorkspaceSummary(
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getDevWorkspaceSummary(user!, period);
  }

  @Get('workspaces/seo/summary')
  @RequirePermissions('TEAM_READ')
  async getSeoWorkspaceSummary(
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getSeoWorkspaceSummary(user!, period);
  }

  @Get('preview-code')
  @RequirePermissions('TEAM_READ')
  async getPreviewTeamCode(
    @Query('department') department?: string,
  ) {
    if (!department || !Object.values(TeamDepartment).includes(department as TeamDepartment)) {
      throw new BadRequestException(
        'Phòng ban không hợp lệ. Phải là một trong các giá trị: SALES, DEV, SEO, OPERATION',
      );
    }
    const code = await this.teamsService.generateNextTeamCode(department as TeamDepartment);
    return {
      department: department as TeamDepartment,
      code,
    };
  }

  @Post()
  @RequirePermissions('TEAM_CREATE')
  @HttpCode(HttpStatus.CREATED)
  async createTeam(
    @Body() dto: CreateTeamDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const actorEmployeeId = user?.employeeId || '1';
    // Backend is source of truth: auto-generate canonical team code upon creation
    return this.teamsService.createTeam(dto, actorEmployeeId, { forceAutoCode: true });
  }

  @Get(':id')
  @RequirePermissions('TEAM_READ')
  async getTeamById(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getTeamById(id, user!);
  }

  @Get(':id/members')
  @RequirePermissions('TEAM_READ')
  async getTeamMembers(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getTeamMembers(id, user!);
  }

  @Get(':id/history')
  @RequirePermissions('TEAM_READ')
  async getTeamHistory(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.teamsService.getTeamHistory(id, user!);
  }

  @Post(':id/assign-member')
  @RequirePermissions('TEAM_ASSIGN_MEMBER')
  @HttpCode(HttpStatus.OK)
  async assignMember(
    @Param('id') id: string,
    @Body() dto: AssignMemberDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const actorEmployeeId = user?.employeeId || '1';
    return this.teamsService.assignMember(id, dto, actorEmployeeId);
  }

  @Post(':id/move-member')
  @RequirePermissions('TEAM_ASSIGN_MEMBER')
  @HttpCode(HttpStatus.OK)
  async moveMember(
    @Param('id') id: string,
    @Body() dto: MoveMemberDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const actorEmployeeId = user?.employeeId || '1';
    return this.teamsService.moveMember(id, dto, actorEmployeeId);
  }

  @Post(':id/change-leader')
  @RequirePermissions('TEAM_UPDATE')
  @HttpCode(HttpStatus.OK)
  async changeLeader(
    @Param('id') id: string,
    @Body() dto: ChangeLeaderDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const actorEmployeeId = user?.employeeId || '1';
    return this.teamsService.changeLeader(id, dto, actorEmployeeId);
  }
}
