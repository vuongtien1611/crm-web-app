import { Controller, Get, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { TeamsService } from '../teams/teams.service';
import {
  AuthorizationPrincipal,
  AuthorizationService,
  EmployeeScope,
} from '../rbac/authorization.service';

@Controller('kpi')
@UseGuards(PermissionsGuard)
export class KpiController {
  constructor(
    private readonly kpiService: KpiService,
    private readonly teamsService: TeamsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('events')
  @RequirePermissions('KPI_READ')
  async findKpiEvents(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('employeeId') employeeId?: string,
    @Query('targetPeriod') targetPeriod?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    const scope = await this.resolveKpiScope(user);
    if (scope.type === 'team') {
      let scopedEmployeeId: string | undefined = undefined;
      let scopedEmployeeIdIn: string[] | undefined = scope.employeeIds;

      if (employeeId) {
        if (!this.authorizationService.canAccessEmployee(scope, employeeId)) {
          throw new ForbiddenException(
            'Trưởng nhóm chỉ có quyền xem KPI của thành viên trong nhóm mình phụ trách',
          );
        }
        scopedEmployeeId = String(employeeId);
        scopedEmployeeIdIn = undefined;
      }

      return this.kpiService.findKpiEvents({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        employeeId: scopedEmployeeId,
        employeeIdIn: scopedEmployeeIdIn,
        targetPeriod,
        sourceType,
      });
    }

    let scopedEmployeeId = employeeId;
    if (scope.type === 'self' || scope.type === 'none') {
      if (scope.type === 'none') {
        throw new ForbiddenException('Tài khoản chưa được liên kết với hồ sơ nhân viên');
      }
      scopedEmployeeId = scope.employeeIds[0];
    }

    return await this.kpiService.findKpiEvents({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      employeeId: scopedEmployeeId,
      targetPeriod,
      sourceType,
    });
  }

  @Get('employees/:id')
  @RequirePermissions('KPI_READ')
  async getEmployeeKpiSummary(
    @Param('id') id: string,
    @Query('period') period?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const scope = await this.resolveKpiScope(user ?? {});
    if (!this.authorizationService.canAccessEmployee(scope, id)) {
      throw new ForbiddenException(
        scope.type === 'team'
          ? 'Trưởng nhóm chỉ có quyền xem KPI của thành viên trong nhóm mình phụ trách'
          : 'Bạn chỉ có quyền xem chỉ số KPI cá nhân của chính mình',
      );
    }

    return this.kpiService.getEmployeeKpiSummary(id, period);
  }

  // ── Private helper ──────────────────────────────────────────────────────
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  private async resolveKpiScope(user: AuthorizationPrincipal): Promise<EmployeeScope> {
    const teamRoles = ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'];
    const isTeamLeader = this.authorizationService.hasAnyRole(user, teamRoles);
    const teamEmployeeIds =
      isTeamLeader && user.employeeId
        ? await this.resolveTeamMemberIds(String(user.employeeId))
        : [];

    return this.authorizationService.resolveEmployeeScope(user, {
      elevatedRoles: ['ADMIN', 'BOSS'],
      teamRoles,
      teamEmployeeIds,
    });
  }
}
