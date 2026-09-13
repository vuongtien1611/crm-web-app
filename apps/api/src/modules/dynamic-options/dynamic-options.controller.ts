import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DynamicOptionsService } from './dynamic-options.service';
import { RecordOptionUseDto } from './dto/record-option-use.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('dynamic-options')
@UseGuards(JwtAuthGuard)
export class DynamicOptionsController {
  constructor(private readonly dynamicOptionsService: DynamicOptionsService) {}

  @Get()
  async getOptions(
    @Query('fieldKey') fieldKey: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.dynamicOptionsService.getOptions({
      fieldKey,
      q,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('use')
  @HttpCode(HttpStatus.OK)
  async recordOptionUse(
    @Body() dto: RecordOptionUseDto,
    @CurrentUser() user?: any,
  ) {
    return await this.dynamicOptionsService.recordOptionUse(
      dto.fieldKey,
      dto.value,
      user?.employeeId,
    );
  }
}
