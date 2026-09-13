import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { DealsService } from './deals.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { AssignDealDto } from './dto/assign-deal.dto';
import { SetClosingSaleDto } from './dto/set-closing-sale.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from '../teams/teams.service';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(
    private readonly dealsService: DealsService,
    private readonly teamsService: TeamsService,
  ) {}

  @Post()
  async createDeal(@Body() dto: CreateDealDto) {
    return this.dealsService.createDeal(dto);
  }

  @Get()
  async findDeals(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('assignedSaleId') assignedSaleId?: string,
    @Query('accountId') accountId?: string,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles || [];
    const permissions: string[] = user?.permissions || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('DEAL_VIEW_ALL');

    const filter: any = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      status,
      assignedSaleId,
      accountId,
    };

    // SALES_TEAM_LEADER: team-scoped
    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && user?.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      filter.assignedSaleIdIn = teamMemberIds;
      return this.dealsService.findDeals(filter);
    }

    // SALE role: own deals only
    if (!hasGlobalView && user?.employeeId) {
      filter.assignedSaleIdOnly = String(user.employeeId);
    }

    return this.dealsService.findDeals(filter);
  }

  @Get(':id')
  async findDealById(@Param('id') id: string, @CurrentUser() user?: any) {
    const deal: any = await this.dealsService.findDealById(id);
    const roles: string[] = user?.roles || [];
    const permissions: string[] = user?.permissions || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('DEAL_VIEW_ALL');

    if (hasGlobalView) return deal;

    // SALES_TEAM_LEADER: verify assigned sale is a current team member
    if (roles.includes('SALES_TEAM_LEADER') && user?.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      if (!teamMemberIds.includes(String(deal.assigned_sale_id))) {
        throw new ForbiddenException(
          'Trưởng nhóm chỉ có quyền xem deals của thành viên trong nhóm mình phụ trách',
        );
      }
      return deal;
    }

    // SALE role: own deals only
    if (user?.employeeId && String(deal.assigned_sale_id) !== String(user.employeeId)) {
      throw new ForbiddenException('You are not authorized to view deals assigned to other sales reps');
    }

    return deal;
  }

  @Patch(':id')
  async updateDeal(@Param('id') id: string, @Body() dto: UpdateDealDto) {
    return this.dealsService.updateDeal(id, dto);
  }

  @Post(':id/start-negotiation')
  async startNegotiation(@Param('id') id: string) {
    return this.dealsService.startNegotiation(id);
  }

  @Post(':id/assign')
  async assignDeal(@Param('id') id: string, @Body() dto: AssignDealDto) {
    return this.dealsService.assignDeal(id, dto);
  }

  @Post(':id/set-closing-sale')
  async setClosingSale(@Param('id') id: string, @Body() dto: SetClosingSaleDto) {
    return this.dealsService.setClosingSale(id, dto);
  }

  @Post(':id/win')
  async markWon(@Param('id') id: string) {
    return this.dealsService.markWon(id);
  }

  @Post(':id/lose')
  async markLost(@Param('id') id: string, @Body() dto: MarkLostDto) {
    return this.dealsService.markLost(id, dto);
  }

  // ── Private helper ──────────────────────────────────────────────────────
  /**
   * Resolve current team member employee IDs for a SALES_TEAM_LEADER.
   * Returns empty array if leader has no active team (→ no deals visible).
   */
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }
}
