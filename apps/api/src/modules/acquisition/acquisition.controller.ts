import { Controller, Get, Post, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { AcquisitionService } from './acquisition.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateSalesContentDto } from './dto/create-sales-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('acquisition')
export class AcquisitionController {
  constructor(private readonly acquisitionService: AcquisitionService) {}

  private assertMutationAuthorized(user: any): void {
    const roles: string[] = user?.roles || [];
    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS');
    if (!isElevated) {
      throw new ForbiddenException(
        'Chỉ ADMIN hoặc BOSS mới có quyền cấu hình nguồn tiếp thị và phân bổ thị trường (Market Assignment)',
      );
    }
  }

  @Get('overview')
  async getOverview(@CurrentUser() user?: any) {
    return this.acquisitionService.getAcquisitionOverview(user);
  }

  @Get('distribution')
  async getDistribution(@CurrentUser() user?: any) {
    return this.acquisitionService.getLeadDistribution(user);
  }

  @Get('platforms')
  async getPlatforms() {
    return this.acquisitionService.findAllPlatforms();
  }

  @Post('platforms')
  async createPlatform(@Body() dto: CreatePlatformDto, @CurrentUser() user?: any) {
    this.assertMutationAuthorized(user);
    return this.acquisitionService.createPlatform(dto);
  }

  @Get('channels')
  async getChannels() {
    return this.acquisitionService.findAllChannels();
  }

  @Post('channels')
  async createChannel(@Body() dto: CreateChannelDto, @CurrentUser() user?: any) {
    this.assertMutationAuthorized(user);
    return this.acquisitionService.createChannel(dto);
  }

  @Get('market-assignments')
  async getMarketAssignments(@CurrentUser() user?: any) {
    return this.acquisitionService.findAllMarketAssignments(user);
  }

  @Post('market-assignments')
  async assignMarket(
    @Body('employeeId') employeeId: string,
    @Body('platformId') platformId?: string,
    @Body('channelId') channelId?: string,
    @CurrentUser() user?: any,
  ) {
    this.assertMutationAuthorized(user);
    return this.acquisitionService.assignMarket(employeeId, platformId, channelId);
  }

  @Patch('market-assignments/:id/deactivate')
  async deactivateMarketAssignment(@Param('id') id: string, @CurrentUser() user?: any) {
    this.assertMutationAuthorized(user);
    return this.acquisitionService.deactivateMarketAssignment(id);
  }

  @Get('sales-contents')
  async getSalesContents() {
    return this.acquisitionService.findAllSalesContents();
  }

  @Post('sales-contents')
  async createSalesContent(@Body() dto: CreateSalesContentDto) {
    return this.acquisitionService.createSalesContent(dto);
  }
}
