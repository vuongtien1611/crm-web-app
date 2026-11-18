import { Injectable, NotFoundException, ForbiddenException, MessageEvent } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { Subject, Observable, interval, merge, of } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface SseNotificationPayload {
  id: string;
  employee_id: string;
  employeeId: string;
  event_type: string;
  eventType: string;
  title: string;
  content: string;
  deep_link_url: string | null;
  deepLinkUrl: string | null;
  entity_type: string | null;
  entityType: string | null;
  entity_id: string | null;
  entityId: string | null;
  is_read: boolean;
  isRead: boolean;
  created_at: any;
  createdAt: any;
}

export type NotificationItem = SseNotificationPayload;

export interface CreateNotificationDto {
  employeeId: string | number;
  eventType: string;
  title: string;
  content: string;
  deepLinkUrl?: string;
  entityType?: string;
  entityId?: string | number;
  idempotent?: boolean;
}

export interface GetNotificationsFilter {
  limit?: number;
  offset?: number;
  isRead?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly notificationStream$ = new Subject<{
    recipientEmployeeId: string;
    data: SseNotificationPayload;
  }>();

  constructor(private readonly kysely: KyselyService) {}

  /**
   * Subscribe to real-time notifications for a specific employee.
   * Merges initial connection confirmation, employee events, and keepalive heartbeat.
   */
  getNotificationStream(employeeId: string | number): Observable<MessageEvent> {
    const targetEmployeeId = String(employeeId);

    const initial$ = of({
      data: {
        type: 'connected',
        employeeId: targetEmployeeId,
        timestamp: Date.now(),
      },
    } as MessageEvent);

    const employeeEvents$ = this.notificationStream$.pipe(
      filter((event) => String(event.recipientEmployeeId) === targetEmployeeId),
      map((event) => ({
        data: {
          type: 'notification',
          data: event.data,
        },
      } as MessageEvent)),
    );

    // Heartbeat ping every 20 seconds to prevent Cloudflare Tunnel or reverse proxies from dropping idle stream
    const heartbeat$ = interval(20000).pipe(
      map(() => ({
        data: {
          type: 'ping',
          timestamp: Date.now(),
        },
      } as MessageEvent)),
    );

    return merge(initial$, employeeEvents$, heartbeat$);
  }

  /**
   * Create an in-app notification for a recipient employee.
   * If idempotent is true, duplicate notifications for the same
   * employee_id + event_type + entity_type + entity_id will be ignored (Best-effort at app level).
   * Supports optional trx for transactional consistency with business mutations.
   */
  async createNotification(data: CreateNotificationDto, trx?: any): Promise<any> {
    const db = trx || this.kysely.db;

    const idempotencyKey = data.idempotent
      ? `${data.employeeId}:${data.eventType}:${data.entityType || ''}:${data.entityId || ''}`
      : null;

    if (idempotencyKey) {
      const existing = await db
        .selectFrom('notifications')
        .selectAll()
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();
      if (existing) {
        return existing;
      }
    }

    try {
      const [notification] = await db
        .insertInto('notifications')
        .values({
          employee_id: data.employeeId as any,
          event_type: data.eventType,
          title: data.title,
          content: data.content,
          deep_link_url: data.deepLinkUrl || null,
          entity_type: data.entityType || null,
          entity_id: data.entityId ? (data.entityId as any) : null,
          is_read: false,
          created_at: new Date(),
          idempotency_key: idempotencyKey,
        })
        .returningAll()
        .execute();

      const mapped: SseNotificationPayload = {
        id: String(notification.id),
        employee_id: String(notification.employee_id),
        employeeId: String(notification.employee_id),
        event_type: notification.event_type,
        eventType: notification.event_type,
        title: notification.title,
        content: notification.content,
        deep_link_url: notification.deep_link_url,
        deepLinkUrl: notification.deep_link_url,
        entity_type: notification.entity_type,
        entityType: notification.entity_type,
        entity_id: notification.entity_id ? String(notification.entity_id) : null,
        entityId: notification.entity_id ? String(notification.entity_id) : null,
        is_read: Boolean(notification.is_read),
        isRead: Boolean(notification.is_read),
        created_at: notification.created_at,
        createdAt: notification.created_at,
      };

      setImmediate(() => {
        this.notificationStream$.next({
          recipientEmployeeId: String(notification.employee_id),
          data: mapped,
        });
      });

      return notification;
    } catch (err: any) {
      if (idempotencyKey && (err.code === '23505' || err.message?.includes('uq_notifications_idempotency_key') || err.message?.includes('unique constraint'))) {
        const existing = await db
          .selectFrom('notifications')
          .selectAll()
          .where('idempotency_key', '=', idempotencyKey)
          .executeTakeFirst();
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  /**
   * Dispatch notifications to all active employees holding any of the specified roles.
   * Supports optional trx.
   */
  async notifyRoles(
    roles: string[],
    data: Omit<CreateNotificationDto, 'employeeId'>,
    trx?: any,
  ): Promise<any[]> {
    const db = trx || this.kysely.db;

    const employees = await db
      .selectFrom('employees as e')
      .innerJoin('users as u', 'u.id', 'e.user_id')
      .innerJoin('user_roles as ur', 'ur.user_id', 'u.id')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select('e.id as employee_id')
      .where('e.status', '=', 'ACTIVE')
      .where('r.code', 'in', roles)
      .distinct()
      .execute();

    const created: NotificationItem[] = [];
    for (const emp of employees) {
      const notif = await this.createNotification(
        {
          ...data,
          employeeId: emp.employee_id,
        },
        trx,
      );
      created.push(notif);
    }

    return created;
  }

  /**
   * Resolve an employee's currently active team leader and send a notification.
   * Supports optional trx.
   */
  async notifyTeamLeader(
    employeeId: string | number,
    data: Omit<CreateNotificationDto, 'employeeId'>,
    trx?: any,
  ): Promise<any | null> {
    const db = trx || this.kysely.db;

    // 1. Find employee's active team
    const membership = await db
      .selectFrom('team_memberships')
      .select('team_id')
      .where('employee_id', '=', employeeId as any)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    if (!membership) {
      return null;
    }

    // 2. Find team's active leader
    const leaderMembership = await db
      .selectFrom('team_memberships')
      .select('employee_id')
      .where('team_id', '=', membership.team_id)
      .where('is_leader', '=', true)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    if (!leaderMembership || String(leaderMembership.employee_id) === String(employeeId)) {
      return null;
    }

    return this.createNotification(
      {
        ...data,
        employeeId: leaderMembership.employee_id,
      },
      trx,
    );
  }

  /**
   * Fetch paginated notifications for the actor employee.
   * Strictly recipient isolated.
   */
  async getUserNotifications(
    actorEmployeeId: string | number,
    filter?: GetNotificationsFilter,
  ): Promise<{ data: NotificationItem[]; total: number; unreadCount: number }> {
    const db = this.kysely.db;
    const limit = Math.max(1, Math.min(100, Number(filter?.limit) || 20));
    const offset = Math.max(0, Number(filter?.offset) || 0);

    let baseQuery = db
      .selectFrom('notifications')
      .where('employee_id', '=', actorEmployeeId as any);

    if (filter?.isRead !== undefined) {
      baseQuery = baseQuery.where('is_read', '=', Boolean(filter.isRead));
    }

    const [totalRow, unreadRow, rows] = await Promise.all([
      baseQuery.select(sql<number>`count(id)`.as('total')).executeTakeFirst(),
      db
        .selectFrom('notifications')
        .where('employee_id', '=', actorEmployeeId as any)
        .where('is_read', '=', false)
        .select(sql<number>`count(id)`.as('unread'))
        .executeTakeFirst(),
      baseQuery
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
    ]);

    return {
      data: rows.map((r) => ({
        id: String(r.id),
        employee_id: String(r.employee_id),
        employeeId: String(r.employee_id),
        event_type: r.event_type,
        eventType: r.event_type,
        title: r.title,
        content: r.content,
        deep_link_url: r.deep_link_url,
        deepLinkUrl: r.deep_link_url,
        entity_type: r.entity_type,
        entityType: r.entity_type,
        entity_id: r.entity_id ? String(r.entity_id) : null,
        entityId: r.entity_id ? String(r.entity_id) : null,
        is_read: Boolean(r.is_read),
        isRead: Boolean(r.is_read),
        created_at: r.created_at,
        createdAt: r.created_at,
      })),
      total: Number(totalRow?.total || 0),
      unreadCount: Number(unreadRow?.unread || 0),
    };
  }

  /**
   * Count unread notifications for the actor employee.
   */
  async getUnreadCount(actorEmployeeId: string | number): Promise<number> {
    const db = this.kysely.db;
    const row = await db
      .selectFrom('notifications')
      .where('employee_id', '=', actorEmployeeId as any)
      .where('is_read', '=', false)
      .select(sql<number>`count(id)`.as('unread'))
      .executeTakeFirst();

    return Number(row?.unread || 0);
  }

  /**
   * Mark a single notification as read.
   * Throws ForbiddenException if the notification does not belong to the actor.
   */
  async markAsRead(
    id: string | number,
    actorEmployeeId: string | number,
  ): Promise<any> {
    const db = this.kysely.db;

    const notif = await db
      .selectFrom('notifications')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!notif) {
      throw new NotFoundException(`Notification #${id} not found`);
    }

    // Strict recipient isolation: only recipient can read
    if (String(notif.employee_id) !== String(actorEmployeeId)) {
      throw new ForbiddenException('Bạn không có quyền truy cập hoặc đánh dấu thông báo này');
    }

    const [updated] = await db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return {
      id: String(updated.id),
      employee_id: String(updated.employee_id),
      employeeId: String(updated.employee_id),
      event_type: updated.event_type,
      eventType: updated.event_type,
      title: updated.title,
      content: updated.content,
      deep_link_url: updated.deep_link_url,
      deepLinkUrl: updated.deep_link_url,
      entity_type: updated.entity_type,
      entityType: updated.entity_type,
      entity_id: updated.entity_id ? String(updated.entity_id) : null,
      entityId: updated.entity_id ? String(updated.entity_id) : null,
      is_read: Boolean(updated.is_read),
      isRead: Boolean(updated.is_read),
      created_at: updated.created_at,
      createdAt: updated.created_at,
    };
  }

  /**
   * Mark all notifications of the actor employee as read.
   */
  async markAllAsRead(actorEmployeeId: string | number): Promise<{ updatedCount: number }> {
    const db = this.kysely.db;

    const updated = await db
      .updateTable('notifications')
      .set({ is_read: true })
      .where('employee_id', '=', actorEmployeeId as any)
      .where('is_read', '=', false)
      .returningAll()
      .execute();

    return { updatedCount: updated.length };
  }
}
