import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, EMPTY } from 'rxjs';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Sse('stream')
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    if (!user.employeeId) {
      return EMPTY;
    }
    return this.notificationsService.getNotificationStream(user.employeeId);
  }

  @Post('test')
  async sendTestNotification(
    @CurrentUser() user: JwtPayload,
    @Body('title') title?: string,
    @Body('content') content?: string,
  ) {
    if (!user.employeeId) {
      return { success: false, message: 'Tài khoản chưa được liên kết với hồ sơ nhân viên.' };
    }

    const notif = await this.notificationsService.createNotification({
      employeeId: user.employeeId,
      eventType: 'SYSTEM_TEST',
      title: title || '🔔 Thông báo thử nghiệm Real-time',
      content:
        content ||
        'Hệ thống thông báo thời gian thực (SSE) và âm thanh chuông đang hoạt động chính xác!',
      deepLinkUrl: '/notifications',
    });

    return {
      success: true,
      message: 'Thông báo thử nghiệm đã được gửi thành công!',
      notification: notif,
    };
  }

  @Get()
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('isRead') isRead?: string,
    @Query('unread_only') unreadOnly?: string,
  ) {
    if (!user.employeeId) {
      return { data: [], total: 0, unreadCount: 0 };
    }

    const parsedIsRead =
      isRead === 'true'
        ? true
        : isRead === 'false'
        ? false
        : unreadOnly === 'true'
        ? false
        : undefined;

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
