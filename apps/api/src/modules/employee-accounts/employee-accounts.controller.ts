import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { EmployeeAccountsService } from './employee-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BossOnlyGuard } from '../rbac/guards/boss-only.guard';
import { QueryEmployeeAccountsDto } from './dto/query-employee-accounts.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { UpdateEmployeeAccountDto } from './dto/update-employee-account.dto';

@Controller('employee-accounts')
@UseGuards(JwtAuthGuard, BossOnlyGuard)
export class EmployeeAccountsController {
  constructor(private readonly accountsService: EmployeeAccountsService) {}

  @Get()
  async getAccounts(@Query() query: QueryEmployeeAccountsDto, @Req() req: any) {
    const actorUserId = req.user?.sub;
    const actorSessionId = req.user?.sessionId;
    return await this.accountsService.getAccounts(query, actorUserId, actorSessionId);
  }

  @Get('pin-status')
  async getPinStatus(@Req() req: any) {
    const actorUserId = req.user?.sub;
    const actorSessionId = req.user?.sessionId;
    return await this.accountsService.getPinStatus(actorUserId, actorSessionId);
  }

  @Post('verify-pin')
  async verifyPin(@Body() dto: VerifyPinDto, @Req() req: any) {
    const actorUserId = req.user?.sub;
    const actorSessionId = req.user?.sessionId;
    return await this.accountsService.verifyPin(actorUserId, actorSessionId, dto.pin);
  }

  @Post('change-pin')
  async changePin(@Body() dto: ChangePinDto, @Req() req: any) {
    const actorUserId = req.user?.sub;
    return await this.accountsService.changePin(actorUserId, dto.currentPin, dto.newPin, dto.confirmPin);
  }

  @Get(':id')
  async getAccountDetail(
    @Param('id') id: string,
    @Query('resetRequest') resetRequestId: string,
    @Req() req: any,
  ) {
    const actorUserId = req.user?.sub;
    const actorSessionId = req.user?.sessionId;
    return await this.accountsService.getAccountDetail(
      id,
      actorUserId,
      actorSessionId,
      resetRequestId,
    );
  }

  @Put(':id')
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeAccountDto,
    @Req() req: any,
  ) {
    const actorEmployeeId = req.user?.employeeId;
    const actorUserId = req.user?.sub;
    const actorSessionId = req.user?.sessionId;
    const ip = req.ip;

    if (!actorEmployeeId) {
      throw new ForbiddenException('Tài khoản của bạn không được liên kết với hồ sơ nhân sự BOSS');
    }

    return await this.accountsService.updateAccount(
      id,
      dto,
      actorEmployeeId,
      actorUserId,
      actorSessionId,
      ip,
    );
  }
}
