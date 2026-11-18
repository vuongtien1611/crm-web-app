import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadQualityDto } from './dto/update-lead-quality.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { MarkFailedDto } from './dto/mark-failed.dto';
import { ConvertLeadToDealDto } from './dto/convert-lead-to-deal.dto';
import { UpdateLeadInfoDto } from './dto/update-lead-info.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { AuthorizationService, EmployeeScope } from '../rbac/authorization.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly teamsService: TeamsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post()
  async createLead(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.createLead(dto, user);
  }

  @Get()
  async getLeads(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('quality') quality?: string,
    @Query('assignedSaleId') assignedSaleId?: string,
    @Query('platformId') platformId?: string,
    @Query('channelId') channelId?: string,
    @Query('unassigned') unassigned?: string,
  ) {
    const scope = await this.resolveLeadScope(user);
    const scopeFilter =
      scope.type === 'all'
        ? {}
        : scope.type === 'self'
          ? { assignedSaleIdOnly: scope.employeeIds[0] }
          : { assignedSaleIdIn: scope.employeeIds };

    return this.leadsService.findLeads({
      page,
      limit,
      q,
      status,
      quality,
      assignedSaleId,
      platformId,
      channelId,
      unassigned: unassigned === 'true' || unassigned === '1',
      ...scopeFilter,
    });
  }

  @Get(':id')
  async getLeadById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const lead = await this.leadsService.findLeadById(id);
    const scope = await this.resolveLeadScope(user);
    if (!this.authorizationService.canAccessEmployee(scope, lead.assigned_sale_id)) {
      throw new ForbiddenException(
        scope.type === 'team'
          ? 'Trưởng nhóm chỉ có quyền xem leads của thành viên trong nhóm mình phụ trách'
          : 'You do not have access to view this assigned lead',
      );
    }

    return lead;
  }

  @Patch(':id')
  @RequirePermissions('LEAD_UPDATE')
  async updateLeadInfo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLeadInfoDto,
  ) {
    const lead = await this.leadsService.findLeadById(id);
    const scope = await this.resolveLeadScope(user);
    if (!this.authorizationService.canAccessEmployee(scope, lead.assigned_sale_id)) {
      throw new ForbiddenException('You do not have access to update this lead');
    }

    return this.leadsService.updateLeadInfo(id, dto);
  }

  @Patch(':id/qualify')
  async qualifyLead(
    @Param('id') id: string,
    @Body() dto: UpdateLeadQualityDto,
  ) {
    return this.leadsService.qualifyLead(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leadsService.updateStatus(id, dto, user);
  }

  @Post(':id/restore-converted')
  async restoreConverted(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leadsService.restoreConverted(id, user);
  }

  @Post(':id/assign')
  @RequirePermissions('LEAD_ASSIGN')
  async assignLead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
  ) {
    const roles: string[] = user.roles || [];
    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('SUPER_ADMIN');
    const isSalesLeader = roles.includes('SALES_TEAM_LEADER');
    const permissions: string[] = user.permissions || [];

    if (!isElevated && !isSalesLeader && !permissions.includes('LEAD_ASSIGN')) {
      throw new ForbiddenException('Nhân viên kinh doanh không có quyền phân công Lead');
    }

    return this.leadsService.assignLead(id, dto, user.employeeId || undefined, user);
  }

  @Post(':id/mark-failed')
  async markFailed(
    @Param('id') id: string,
    @Body() dto: MarkFailedDto,
  ) {
    return this.leadsService.markFailed(id, dto);
  }

  @Post(':id/convert-to-deal')
  async convertToDeal(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ConvertLeadToDealDto,
  ) {
    return this.leadsService.convertToDeal(id, dto, user.employeeId || undefined, user);
  }

  // ── Private helper ──────────────────────────────────────────────────────
  /**
   * Resolve current team member employee IDs for a SALES_TEAM_LEADER.
   * Returns empty array if leader has no active team (→ no leads visible).
   */
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  private async resolveLeadScope(user: JwtPayload): Promise<EmployeeScope> {
    const isSalesLeader = this.authorizationService.hasAnyRole(user, ['SALES_TEAM_LEADER']);
    const teamEmployeeIds =
      isSalesLeader && user.employeeId
        ? await this.resolveTeamMemberIds(user.employeeId)
        : [];

    return this.authorizationService.resolveEmployeeScope(user, {
      elevatedRoles: ['ADMIN', 'BOSS'],
      elevatedPermissions: ['LEAD_VIEW_ALL'],
      teamRoles: ['SALES_TEAM_LEADER'],
      teamEmployeeIds,
    });
  }
}
