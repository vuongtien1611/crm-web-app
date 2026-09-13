import { Controller, Get, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { TeamsService } from '../teams/teams.service';

@Controller('kpi')
@UseGuards(PermissionsGuard)
export class KpiController {
  constructor(
    private readonly kpiService: KpiService,
    private readonly teamsService: TeamsService,
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
    const roles = user?.roles || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView = roles.includes('ADMIN') || roles.includes('BOSS');

    // Team Leaders (Sales, Dev, SEO): team-scoped events only
    const isTeamLeader = roles.some((r: string) =>
      ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'].includes(r),
    );

    if (!hasGlobalView && isTeamLeader && user.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const allowedIds = Array.from(new Set([...teamMemberIds, String(user.employeeId)]));

      let scopedEmployeeId: string | undefined = undefined;
      let scopedEmployeeIdIn: string[] | undefined = allowedIds;

      if (employeeId) {
        if (!allowedIds.includes(String(employeeId))) {
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

    // SALE, DEV, SEO: Own KPI events only
    let scopedEmployeeId = employeeId;
    if (!hasGlobalView) {
      if (!user.employeeId) {
        throw new ForbiddenException('Tài khoản chưa được liên kết với hồ sơ nhân viên');
      }
      scopedEmployeeId = String(user.employeeId);
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
    const roles = user?.roles || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView = roles.includes('ADMIN') || roles.includes('BOSS');

    const isTeamLeader = roles.some((r: string) =>
      ['SALES_TEAM_LEADER', 'DEV_TEAM_LEADER', 'SEO_TEAM_LEADER'].includes(r),
    );

    if (!hasGlobalView && isTeamLeader && user?.employeeId) {
      // Verify target employee is in current team or self
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const allowedIds = Array.from(new Set([...teamMemberIds, String(user.employeeId)]));
      if (!allowedIds.includes(String(id))) {
        throw new ForbiddenException(
          'Trưởng nhóm chỉ có quyền xem KPI của thành viên trong nhóm mình phụ trách',
        );
      }
    } else if (!hasGlobalView) {
      // Individual: Own KPI only
      if (!user?.employeeId || String(id) !== String(user.employeeId)) {
        throw new ForbiddenException('Bạn chỉ có quyền xem chỉ số KPI cá nhân của chính mình');
      }
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
}
