import { Controller, Post, Body, Param, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService, CreateSubscriptionDto, RecordPeriodAcceptanceDto } from './subscriptions.service';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  private assertMutationAuthorized(user: any) {
    const roles: string[] = user?.roles || [];
    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS');

    if (!isElevated) {
      throw new ForbiddenException(
        'Bạn không có quyền thực hiện thao tác này trên hợp đồng định kỳ (Yêu cầu quyền ADMIN hoặc BOSS)',
      );
    }
  }

  private assertCreationAuthorized(user: any) {
    const roles: string[] = user?.roles || [];
    if (!roles.some((role) => ['ACCOUNTANT', 'ADMIN', 'BOSS'].includes(role))) {
      throw new ForbiddenException(
        'Bạn không có quyền tạo hợp đồng định kỳ (Yêu cầu quyền Kế toán, ADMIN hoặc BOSS)',
      );
    }
  }

  @Get()
  async getSubscriptions(@Query() query: QuerySubscriptionDto, @CurrentUser() user?: any) {
    return await this.subscriptionsService.findSubscriptions(query, user);
  }

  @Get('eligible-order-items')
  async getEligibleOrderItems(@CurrentUser() user?: any) {
    this.assertCreationAuthorized(user);
    return await this.subscriptionsService.findEligibleOrderItems();
  }

  @Get(':id')
  async getSubscriptionById(@Param('id') id: string, @CurrentUser() user?: any) {
    return await this.subscriptionsService.getSubscriptionById(id, user);
  }

  @Post()
  async createSubscription(@Body() dto: CreateSubscriptionDto, @CurrentUser() user?: any) {
    this.assertCreationAuthorized(user);
    return await this.subscriptionsService.createSubscription(dto, user?.employeeId ? String(user.employeeId) : undefined);
  }

  @Post(':id/generate-periods')
  async generateServicePeriods(
    @Param('id') id: string,
    @Body() body: { count?: number },
    @CurrentUser() user?: any,
  ) {
    this.assertMutationAuthorized(user);
    return await this.subscriptionsService.generateServicePeriods(id, body?.count || 1);
  }

  @Post('periods/:id/assign')
  async assignServicePeriod(
    @Param('id') periodId: string,
    @Body() body: { employeeId: string; assignmentType?: 'PRIMARY' | 'SUPPORT'; reason?: string },
    @CurrentUser() user?: any,
  ) {
    this.assertMutationAuthorized(user);
    return await this.subscriptionsService.assignServicePeriod(
      periodId,
      body.employeeId,
      body.assignmentType || 'PRIMARY',
      body.reason,
    );
  }

  @Post('periods/:id/accept')
  async recordAcceptance(
    @Param('id') periodId: string,
    @Body() dto: RecordPeriodAcceptanceDto,
    @CurrentUser() user?: any,
  ) {
    return await this.subscriptionsService.recordServicePeriodAcceptance(
      periodId,
      dto,
      user?.employeeId ? String(user.employeeId) : '1',
    );
  }

  @Post('periods/:id/payment')
  async recordPayment(
    @Param('id') periodId: string,
    @Body() body: { paymentAllocationId?: string; isFullyPaid?: boolean },
  ) {
    return await this.subscriptionsService.recordServicePeriodPayment(
      periodId,
      body.paymentAllocationId,
      body.isFullyPaid ?? true,
    );
  }

  @Post(':id/renew')
  async processRenewal(@Param('id') id: string, @CurrentUser() user?: any) {
    this.assertMutationAuthorized(user);
    return await this.subscriptionsService.processSubscriptionRenewal(id);
  }

  @Post(':id/cancel')
  async cancelSubscription(@Param('id') id: string, @CurrentUser() user?: any) {
    this.assertMutationAuthorized(user);
    return await this.subscriptionsService.cancelSubscription(id);
  }
}

