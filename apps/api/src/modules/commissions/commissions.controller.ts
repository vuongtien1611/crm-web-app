import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { AdjustCommissionDto } from './dto/adjust-commission.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { TeamsService } from '../teams/teams.service';

@Controller('commissions')
@UseGuards(PermissionsGuard)
export class CommissionsController {
  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get()
  @RequirePermissions('COMMISSION_READ')
  async findCommissions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('employeeId') employeeId?: string,
    @Query('commissionType') commissionType?: string,
    @Query('status') status?: string,
  ) {
    const roles = user?.roles || [];
    const permissions = user?.permissions || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('COMMISSION_VIEW_ALL');

    // SALES_TEAM_LEADER: team-scoped — only current team members + own commissions
    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const allowedIds = Array.from(new Set([...teamMemberIds, String(user.employeeId)]));

      let scopedEmployeeId: string | undefined = undefined;
      let scopedEmployeeIdIn: string[] | undefined = allowedIds;

      if (employeeId) {
        if (!allowedIds.includes(String(employeeId))) {
          throw new ForbiddenException(
            'Trưởng nhóm chỉ có quyền xem hoa hồng của thành viên trong nhóm mình phụ trách',
          );
        }
        scopedEmployeeId = String(employeeId);
        scopedEmployeeIdIn = undefined;
      }

      return this.commissionsService.findCommissions({
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        employeeId: scopedEmployeeId,
        beneficiaryEmployeeIdIn: scopedEmployeeIdIn,
        commissionType,
        status,
      });
    }

    // SALE, DEV, SEO, DEV_TEAM_LEADER, SEO_TEAM_LEADER: Own commissions only
    let scopedEmployeeId = employeeId;
    if (!hasGlobalView) {
      if (!user.employeeId) {
        throw new ForbiddenException('Tài khoản chưa được liên kết với hồ sơ nhân viên');
      }
      scopedEmployeeId = String(user.employeeId);
    }

    return this.commissionsService.findCommissions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      employeeId: scopedEmployeeId,
      commissionType,
      status,
    });
  }

  @Get(':id')
  @RequirePermissions('COMMISSION_READ')
  async findCommissionById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const commission = await this.commissionsService.findCommissionById(id);
    const roles = user?.roles || [];
    const permissions = user?.permissions || [];

    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('COMMISSION_VIEW_ALL');

    if (hasGlobalView) return commission;

    // SALES_TEAM_LEADER: verify beneficiary is a current team member or self
    if (roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const allowedIds = Array.from(new Set([...teamMemberIds, String(user.employeeId)]));
      if (!allowedIds.includes(String((commission as any).beneficiary_employee_id))) {
        throw new ForbiddenException(
          'Trưởng nhóm chỉ có quyền xem hoa hồng của thành viên trong nhóm mình phụ trách',
        );
      }
      return commission;
    }

    // Individual roles (SALE, DEV, SEO, DEV_TEAM_LEADER, SEO_TEAM_LEADER): Own commission only
    if (
      !user.employeeId ||
      String((commission as any).beneficiary_employee_id) !== String(user.employeeId)
    ) {
      throw new ForbiddenException('Bạn chỉ có quyền xem hoa hồng cá nhân của chính mình');
    }

    return commission;
  }

  @Post(':id/approve')
  @RequirePermissions('COMMISSION_APPROVE')
  async approveCommission(@Param('id') id: string, @Req() req: any) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.commissionsService.approveCommission(id, actorEmployeeId);
  }

  @Post(':id/adjust')
  @RequirePermissions('COMMISSION_ADJUST')
  async adjustCommission(
    @Param('id') id: string,
    @Body() dto: AdjustCommissionDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.commissionsService.adjustCommission(id, dto, actorEmployeeId);
  }

  @Post(':id/reject')
  @RequirePermissions('COMMISSION_REJECT')
  async rejectCommission(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employee_id || req.user?.id;
    return await this.commissionsService.rejectCommission(id, reason, actorEmployeeId);
  }

  // ── Private helper ──────────────────────────────────────────────────────
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }
}
