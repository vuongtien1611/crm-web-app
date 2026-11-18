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
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
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
import { AuthorizationPrincipal, AuthorizationService, EmployeeScope } from '../rbac/authorization.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly teamsService: TeamsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get('services')
  async getServices() {
    return await this.ordersService.getActiveServices();
  }

  @Post('services')
  @RequirePermissions('ORDER_CREATE')
  async createService(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.createService(dto, user?.employeeId);
  }

  @Get('orders/sales-reps')
  @RequirePermissions('ORDER_READ')
  async getSalesReps() {
    return await this.ordersService.getActiveSalesReps();
  }

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
    const scope = await this.resolveOrderScope(user);
    const scopeFilter =
      scope.type === 'all'
        ? {}
        : scope.type === 'self'
          ? { closingSaleIdOnly: scope.employeeIds[0] }
          : { closingSaleIdIn: scope.employeeIds };

    return await this.ordersService.findOrders({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      q,
      workflowStatus,
      accountId,
      ...scopeFilter,
    });
  }

  @Get('orders/:id')
  @RequirePermissions('ORDER_READ')
  async findOrderById(@Param('id') id: string, @CurrentUser() user?: any) {
    const order = await this.ordersService.findOrderById(id);
    const scope = await this.resolveOrderScope(user);
    if (
      scope.type !== 'all' &&
      !order.items.some((item: any) =>
        this.authorizationService.canAccessEmployee(scope, item.closing_sale_id),
      )
    ) {
      throw new ForbiddenException(
        scope.type === 'team'
          ? 'Trưởng nhóm chỉ có quyền xem đơn hàng của thành viên trong nhóm mình phụ trách'
          : 'You are not authorized to view this order',
      );
    }

    return order;
  }

  // ── Private helper ──────────────────────────────────────────────────────
  private async resolveOrderScope(user?: AuthorizationPrincipal): Promise<EmployeeScope> {
    const principal = user ?? {};
    const isSalesLeader = this.authorizationService.hasAnyRole(principal, ['SALES_TEAM_LEADER']);
    const teamEmployeeIds =
      isSalesLeader && principal.employeeId !== undefined && principal.employeeId !== null
        ? await this.resolveTeamMemberIds(String(principal.employeeId))
        : [];

    return this.authorizationService.resolveEmployeeScope(principal, {
      elevatedRoles: ['ADMIN', 'BOSS'],
      elevatedPermissions: ['ORDER_VIEW_ALL'],
      teamRoles: ['SALES_TEAM_LEADER'],
      teamEmployeeIds,
    });
  }

  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  @Post('orders/:id/submit')
  @RequirePermissions('ORDER_SUBMIT')
  async submitOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.submitOrder(id, user?.employeeId);
  }

  @Post('orders/:id/approve')
  @RequirePermissions('ORDER_APPROVE')
  async approveOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    const roles: string[] = user?.roles || [];
    if (!roles.includes('BOSS') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Chỉ có Giám đốc (BOSS) mới có quyền phê duyệt đơn hàng');
    }
    return await this.ordersService.approveOrder(id, user?.employeeId);
  }

  @Post('orders/:id/request-more-info')
  @RequirePermissions('ORDER_APPROVE')
  async requestMoreInfo(
    @Param('id') id: string,
    @Body() dto: RequestMoreInfoDto,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles || [];
    if (!roles.includes('BOSS') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Chỉ có Giám đốc (BOSS) mới có quyền yêu cầu bổ sung thông tin');
    }
    return await this.ordersService.requestMoreInfo(id, dto, user?.employeeId);
  }

  @Post('orders/:id/resubmit')
  @RequirePermissions('ORDER_SUBMIT')
  async resubmitOrder(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.resubmitOrder(id, user?.employeeId);
  }

  @Post('orders/:id/reject')
  @RequirePermissions('ORDER_REJECT')
  async rejectOrder(
    @Param('id') id: string,
    @Body() dto: RejectOrderDto,
    @CurrentUser() user?: any,
  ) {
    const roles: string[] = user?.roles || [];
    if (!roles.includes('BOSS') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Chỉ có Giám đốc (BOSS) mới có quyền từ chối đơn hàng');
    }
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

  @Put('orders/:id')
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.updateOrder(id, dto, user?.employeeId);
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

  @Put('order-items/:id')
  async updateOrderItem(
    @Param('id') id: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.updateOrderItem(id, dto, user?.employeeId);
  }

  @Put('orders/:orderId/items/:itemId')
  async updateOrderItemNested(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentUser() user?: any,
  ) {
    return await this.ordersService.updateOrderItem(itemId, dto, user?.employeeId);
  }

  @Post('order-items/:id/submit')
  @RequirePermissions('ORDER_SUBMIT')
  async submitOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.ordersService.submitOrderItem(id, user?.employeeId);
  }

  @Post('order-items/:id/approve')
  @RequirePermissions('ORDER_APPROVE')
  async approveOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    const roles: string[] = user?.roles || [];
    if (!roles.includes('BOSS') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Chỉ có Giám đốc (BOSS) mới có quyền phê duyệt dịch vụ');
    }
    return await this.ordersService.approveOrderItem(id, user?.employeeId);
  }

  @Post('order-items/:id/reject')
  @RequirePermissions('ORDER_REJECT')
  async rejectOrderItem(@Param('id') id: string, @CurrentUser() user?: any) {
    const roles: string[] = user?.roles || [];
    if (!roles.includes('BOSS') && !roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Chỉ có Giám đốc (BOSS) mới có quyền từ chối dịch vụ');
    }
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
