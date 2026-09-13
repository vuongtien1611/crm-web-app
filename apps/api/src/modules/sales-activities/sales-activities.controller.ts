import { Controller, Get, Post, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { SalesActivitiesService } from './sales-activities.service';
import { CreateSalesActivityDto } from './dto/create-sales-activity.dto';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sales-activities')
export class SalesActivitiesController {
  constructor(private readonly salesActivitiesService: SalesActivitiesService) {}

  @Post()
  async createActivity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSalesActivityDto,
  ) {
    if (!user.employeeId) {
      throw new BadRequestException('Current user is not linked to an employee record');
    }
    return this.salesActivitiesService.createActivity(user.employeeId, dto);
  }

  @Get()
  async getActivities(
    @Query('leadId') leadId?: string,
    @Query('dealId') dealId?: string,
  ) {
    if (leadId) {
      return this.salesActivitiesService.findByLead(leadId);
    }
    if (dealId) {
      return this.salesActivitiesService.findByDeal(dealId);
    }
    throw new BadRequestException('Specify either leadId or dealId query parameter');
  }
}
