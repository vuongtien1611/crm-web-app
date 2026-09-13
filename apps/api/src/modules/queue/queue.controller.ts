import {
  Controller,
  Get,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('system/queues')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get()
  async getQueueMetrics(@CurrentUser() user?: JwtPayload) {
    const roles = user?.roles || [];
    const isExecutive = roles.includes('ADMIN') || roles.includes('BOSS');

    if (!isExecutive) {
      throw new ForbiddenException(
        'Chỉ có cấp Quản trị (ADMIN / BOSS) mới có quyền truy cập giám sát Hàng đợi hệ thống (Queue Observability)',
      );
    }

    const metrics = await this.queueService.getQueueMetrics();
    return {
      success: true,
      queues: metrics,
      timestamp: new Date().toISOString(),
    };
  }
}
