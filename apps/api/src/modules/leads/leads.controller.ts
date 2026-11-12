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
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly teamsService: TeamsService,
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
    const roles = user.roles || [];
    const permissions = user.permissions || [];

    // Global access: ADMIN, BOSS (or explicit LEAD_VIEW_ALL permission)
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('LEAD_VIEW_ALL');

    // SALES_TEAM_LEADER: team-scoped — only current team members' leads
    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
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
        assignedSaleIdIn: teamMemberIds,
      });
    }

    // SALE role (or no global view): restricted to own leads only
    const assignedSaleIdOnly =
      !hasGlobalView && user.employeeId ? user.employeeId : undefined;

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
      assignedSaleIdOnly,
    });
  }

  @Get(':id')
  async getLeadById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const lead = await this.leadsService.findLeadById(id);
    const roles = user.roles || [];
    const permissions = user.permissions || [];

    // Global access: ADMIN, BOSS (or explicit LEAD_VIEW_ALL permission)
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('LEAD_VIEW_ALL');

    if (hasGlobalView) return lead;

    // SALES_TEAM_LEADER: verify assigned sale is a current team member
    if (roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      if (!teamMemberIds.includes(String(lead.assigned_sale_id))) {
        throw new ForbiddenException(
          'Trưởng nhóm chỉ có quyền xem leads của thành viên trong nhóm mình phụ trách',
        );
      }
      return lead;
    }

    // SALE role: own leads only
    if (user.employeeId && String(lead.assigned_sale_id) !== String(user.employeeId)) {
      throw new ForbiddenException('You do not have access to view this assigned lead');
    }

    return lead;
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
}
