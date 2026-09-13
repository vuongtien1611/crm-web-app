import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('isRead') isRead?: string,
  ) {
    if (!user.employeeId) {
      return { data: [], total: 0, unreadCount: 0 };
    }

    const parsedIsRead =
      isRead === 'true' ? true : isRead === 'false' ? false : undefined;

    return this.notificationsService.getUserNotifications(user.employeeId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      isRead: parsedIsRead,
    });
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    if (!user.employeeId) {
      return { unreadCount: 0 };
    }

    const count = await this.notificationsService.getUnreadCount(user.employeeId);
    return { unreadCount: count };
  }

  @Patch(':id/read')
  async markAsRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    if (!user.employeeId) {
      return { success: false };
    }

    return this.notificationsService.markAsRead(id, user.employeeId);
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: JwtPayload) {
    if (!user.employeeId) {
      return { updatedCount: 0 };
    }

    return this.notificationsService.markAllAsRead(user.employeeId);
  }
}
