import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

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
  constructor(private readonly kysely: KyselyService) {}

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

    const created: any[] = [];
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
  ): Promise<{ data: any[]; total: number; unreadCount: number }> {
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
