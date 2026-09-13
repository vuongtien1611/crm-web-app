import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@Controller('payments')
@UseGuards(PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequirePermissions('PAYMENT_READ')
  async findPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return await this.paymentsService.findPayments({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Get('gross-cash')
  @RequirePermissions('PAYMENT_READ')
  async getGrossCash() {
    const grossCash = await this.paymentsService.calculateGrossCash();
    return { grossCash };
  }

  @Get(':id')
  @RequirePermissions('PAYMENT_READ')
  async findPaymentById(@Param('id') id: string) {
    return await this.paymentsService.findPaymentById(id);
  }

  @Post()
  @RequirePermissions('PAYMENT_CREATE')
  async createPayment(@Body() dto: CreatePaymentDto, @Req() req: any) {
    const actorEmployeeId = req.user?.employeeId || req.user?.id || '1';
    return await this.paymentsService.createPayment(dto, String(actorEmployeeId));
  }

  @Post(':id/confirm')
  @RequirePermissions('PAYMENT_CONFIRM')
  async confirmPayment(
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId || req.user?.id || '1';
    return await this.paymentsService.confirmPayment(id, dto, String(actorEmployeeId));
  }

  @Post(':id/reject')
  @RequirePermissions('PAYMENT_REJECT')
  async rejectPayment(
    @Param('id') id: string,
    @Body() dto: RejectPaymentDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId || req.user?.id || '1';
    return await this.paymentsService.rejectPayment(id, dto, String(actorEmployeeId));
  }
}
