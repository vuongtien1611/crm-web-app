import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateOrderItemRequirementsDto } from './dto/update-order-item-requirements.dto';
import { RequestMoreInfoDto } from './dto/request-more-info.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeamsService } from '../teams/teams.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get('orders')
  @RequirePermissions('ORDER_READ')
  async findOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('workflowStatus') workflowStatus?: string,
    @Query('accountId') accountId?: string,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles || [];
    const permissions: string[] = user?.permissions || [];

    // Global access: ADMIN, BOSS (or explicit ORDER_VIEW_ALL permission)
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('ORDER_VIEW_ALL');

    // SALES_TEAM_LEADER: team-scoped — only current team members' orders
    if (!hasGlobalView && roles.includes('SALES_TEAM_LEADER') && user?.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      return await this.ordersService.findOrders({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        q,
        workflowStatus,
        accountId,
        closingSaleIdIn: teamMemberIds,
      });
    }

    // SALE role (or other non-elevated): restricted to own closed order items
    let closingSaleIdOnly: string | undefined = undefined;
    if (!hasGlobalView && user?.employeeId) {
      closingSaleIdOnly = String(user.employeeId);
    }

    return await this.ordersService.findOrders({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      workflowStatus,
      accountId,
      closingSaleIdOnly,
    });
  }

  @Get('orders/:id')
  @RequirePermissions('ORDER_READ')
  async findOrderById(@Param('id') id: string, @CurrentUser() user?: any) {
    const order = await this.ordersService.findOrderById(id);
    const roles: string[] = user?.roles || [];
    const permissions: string[] = user?.permissions || [];

    // Global access: ADMIN, BOSS only
    const hasGlobalView =
      roles.includes('ADMIN') ||
      roles.includes('BOSS') ||
      permissions.includes('ORDER_VIEW_ALL');

    if (hasGlobalView) return order;

    // SALES_TEAM_LEADER: verify at least one order item belongs to a current team member
    if (roles.includes('SALES_TEAM_LEADER') && user?.employeeId) {
      const teamMemberIds = await this.resolveTeamMemberIds(user.employeeId);
      const hasTeamMemberItem = order.items.some(
        (item: any) => item.closing_sale_id && teamMemberIds.includes(String(item.closing_sale_id)),
      );
      if (!hasTeamMemberItem) {
        throw new ForbiddenException(
          'Trưởng nhóm chỉ có quyền xem đơn hàng của thành viên trong nhóm mình phụ trách',
        );
      }
      return order;
    }

    // SALE role: own order items only
    if (user?.employeeId) {
      const isOwnerOfItem = order.items.some(
        (item: any) => String(item.closing_sale_id) === String(user.employeeId),
      );
      if (!isOwnerOfItem) {
        throw new ForbiddenException('You are not authorized to view this order');
      }
    }

    return order;
  }

  // ── Private helper ──────────────────────────────────────────────────────
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  @Post('orders/:id/submit')
  async submitOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.submitOrder(id, user?.employeeId);
  }

  @Post('orders/:id/approve')
  @RequirePermissions('ORDER_APPROVE')
  async approveOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.approveOrder(id, user?.employeeId);
  }

  @Post('orders/:id/request-more-info')
  @RequirePermissions('ORDER_APPROVE')
  async requestMoreInfo(
    @Param('id') id: string,
    @Body() dto: RequestMoreInfoDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.requestMoreInfo(id, dto, user?.employeeId);
  }

  @Post('orders/:id/resubmit')
  async resubmitOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.resubmitOrder(id, user?.employeeId);
  }

  @Post('orders/:id/reject')
  @RequirePermissions('ORDER_APPROVE')
  async rejectOrder(
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.rejectOrder(id, dto, user?.employeeId);
  }

  @Post('orders/:id/cancel')
  async cancelOrder(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.cancelOrder(id, dto, user?.employeeId);
  }

  // --------------------------------------------------
  // ORDER ITEMS ENDPOINTS
  // --------------------------------------------------

  @Post('orders/:orderId/items')
  async addOrderItem(
    @Param('orderId') orderId: string,
    @Body() dto: CreateOrderItemDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.addOrderItem(orderId, dto, user?.employeeId);
  }

  @Post('order-items/:id/submit')
  async submitOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.submitOrderItem(id, user?.employeeId);
  }

  @Post('order-items/:id/approve')
  @RequirePermissions('ORDER_APPROVE')
  async approveOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.approveOrderItem(id, user?.employeeId);
  }

  @Post('order-items/:id/reject')
  @RequirePermissions('ORDER_APPROVE')
  async rejectOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.rejectOrderItem(id, user?.employeeId);
  }

  @Post('order-items/:id/cancel')
  async cancelOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.cancelOrderItem(id, user?.employeeId);
  }

  @Put('order-items/:id/requirements')
  async updateOrderItemRequirements(
    @Param('id') id: string,
    @Body() dto: UpdateOrderItemRequirementsDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.updateOrderItemRequirements(id, dto, user?.employeeId);
  }

  // --------------------------------------------------
  // CHANGE REQUESTS ENDPOINTS
  // --------------------------------------------------

  @Post('order-items/:itemId/change-requests')
  async createChangeRequest(
    @Param('itemId') itemId: string,
    @Body() dto: CreateChangeRequestDto,
    @CurrentUser() user?: any,
  ) {
    const requestedBy = user?.employeeId ? String(user.employeeId) : '1';
    return await this.ordersService.createChangeRequest(itemId, dto, requestedBy);
  }

  @Post('change-requests/:id/approve')
  @RequirePermissions('ORDER_APPROVE')
  async approveChangeRequest(@Param('id') id: string, @CurrentUser() user?: any) {
    const approvedBy = user?.employeeId ? String(user.employeeId) : '1';
    return await this.ordersService.approveChangeRequest(id, approvedBy);
  }

  @Post('change-requests/:id/reject')
  @RequirePermissions('ORDER_APPROVE')
  async rejectChangeRequest(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.rejectChangeRequest(id, user?.employeeId);
  }

  @Post('change-requests/:id/implement')
  async implementChangeRequest(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.implementChangeRequest(id, user?.employeeId);
  }
}
