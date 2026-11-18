import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../database/kysely.service';
import type { Services } from '../../database/db';
import type { Selectable } from 'kysely';
import { CreateOrderItemDto } from './dto/create-order-item.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderItemRequirementsDto } from './dto/update-order-item-requirements.dto';
import { RequestMoreInfoDto } from './dto/request-more-info.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { sql } from 'kysely';
import { NotificationsService } from '../notifications/notifications.service';

export interface FindOrdersFilter {
  page?: number;
  limit?: number;
  q?: string;
  workflowStatus?: string;
  accountId?: string;
  closingSaleIdOnly?: string; // Object-level authorization constraint
  closingSaleIdIn?: string[]; // Team-scope authorization constraint
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // --------------------------------------------------
  // AUDIT LOG HELPER
  // --------------------------------------------------
  private async logAudit(
    trx: CrmTransaction,
    action: string,
    entityType: string,
    entityId: string | number,
    actorEmployeeId?: string | number | null,
    payloadBefore?: Record<string, unknown> | null,
    payloadAfter?: Record<string, unknown> | null,
  ) {
    await trx
      .insertInto('audit_logs')
      .values({
        actor_employee_id: actorEmployeeId ? (actorEmployeeId as any) : null,
        actor_type: 'USER',
        action,
        entity_type: entityType,
        entity_id: entityId as any,
        payload_before_sanitized: payloadBefore ? JSON.stringify(payloadBefore) : null,
        payload_after_sanitized: payloadAfter ? JSON.stringify(payloadAfter) : null,
      })
      .execute();
  }

  // --------------------------------------------------
  // ORDER WORKFLOW ACTIONS
  // --------------------------------------------------

  async submitOrder(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (order.workflow_status !== 'DRAFT') {
        throw new BadRequestException(`Only DRAFT orders can be submitted (current: ${order.workflow_status})`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'PENDING_APPROVAL',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_SUBMIT', 'orders', order.id, actorEmployeeId, order, updatedOrder);

      await this.notificationsService.notifyRoles(
        ['BOSS', 'ADMIN'],
        {
          eventType: 'ORDER_PENDING_APPROVAL',
          title: `Đơn hàng #${id} chờ phê duyệt`,
          content: `Đơn hàng #${id} đã được gửi và đang chờ Boss/Admin phê duyệt`,
          deepLinkUrl: `/orders/${id}`,
          entityType: 'orders',
          entityId: id,
        },
        trx,
      );

      return updatedOrder;
    });
  }

  async approveOrder(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (order.workflow_status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL orders can be approved (current: ${order.workflow_status})`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'APPROVED',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_APPROVE', 'orders', order.id, actorEmployeeId, order, updatedOrder);

      // Collect target SALE employees to notify (Rule 3)
      const items = await trx
        .selectFrom('order_items')
        .select(['closing_sale_id'])
        .where('order_id', '=', order.id)
        .execute();

      const saleEmployeeIds = new Set<string>();
      for (const item of items) {
        if (item.closing_sale_id) {
          saleEmployeeIds.add(String(item.closing_sale_id));
        }
      }

      if (saleEmployeeIds.size === 0) {
        const submitLog = await trx
          .selectFrom('audit_logs')
          .select(['actor_employee_id'])
          .where('entity_id', '=', String(order.id) as any)
          .where('action', 'in', ['ORDER_SUBMIT', 'ORDER_RESUBMIT'])
          .orderBy('created_at', 'desc')
          .executeTakeFirst();

        if (submitLog?.actor_employee_id) {
          saleEmployeeIds.add(String(submitLog.actor_employee_id));
        }
      }

      const orderDisplayName = order.order_name || order.order_code;
      for (const saleId of saleEmployeeIds) {
        await this.notificationsService.createNotification(
          {
            employeeId: saleId,
            eventType: 'ORDER_APPROVED',
            title: 'Đơn hàng đã được phê duyệt',
            content: `Đơn hàng ${orderDisplayName} đã được phê duyệt.`,
            deepLinkUrl: `/orders/${order.id}`,
            entityType: 'orders',
            entityId: order.id,
            idempotent: true,
          },
          trx,
        );
      }

      return updatedOrder;
    });
  }

  async requestMoreInfo(id: string, dto: RequestMoreInfoDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (order.workflow_status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL orders can request more info (current: ${order.workflow_status})`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'NEED_MORE_INFO',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_REQUEST_MORE_INFO', 'orders', order.id, actorEmployeeId, { ...order, note: dto.note }, updatedOrder);
      return updatedOrder;
    });
  }

  async resubmitOrder(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (order.workflow_status !== 'NEED_MORE_INFO') {
        throw new BadRequestException(`Only NEED_MORE_INFO orders can be resubmitted (current: ${order.workflow_status})`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'PENDING_APPROVAL',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_RESUBMIT', 'orders', order.id, actorEmployeeId, order, updatedOrder);

      await this.notificationsService.notifyRoles(
        ['BOSS', 'ADMIN'],
        {
          eventType: 'ORDER_PENDING_APPROVAL',
          title: `Đơn hàng #${id} đã được gửi lại chờ duyệt`,
          content: `Đơn hàng #${id} vừa được cập nhật thông tin và gửi lại chờ phê duyệt`,
          deepLinkUrl: `/orders/${id}`,
          entityType: 'orders',
          entityId: id,
        },
        trx,
      );

      return updatedOrder;
    });
  }

  async rejectOrder(id: string, dto: RejectOrderDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (order.workflow_status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL orders can be rejected (current: ${order.workflow_status})`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'REJECTED',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_REJECT', 'orders', order.id, actorEmployeeId, { ...order, reason: dto.reason }, updatedOrder);

      // Collect target SALE employees to notify
      const items = await trx
        .selectFrom('order_items')
        .select(['closing_sale_id'])
        .where('order_id', '=', order.id)
        .execute();

      const saleEmployeeIds = new Set<string>();
      for (const item of items) {
        if (item.closing_sale_id) {
          saleEmployeeIds.add(String(item.closing_sale_id));
        }
      }

      if (saleEmployeeIds.size === 0) {
        const submitLog = await trx
          .selectFrom('audit_logs')
          .select(['actor_employee_id'])
          .where('entity_id', '=', String(order.id) as any)
          .where('action', 'in', ['ORDER_SUBMIT', 'ORDER_RESUBMIT'])
          .orderBy('created_at', 'desc')
          .executeTakeFirst();

        if (submitLog?.actor_employee_id) {
          saleEmployeeIds.add(String(submitLog.actor_employee_id));
        }
      }

      const orderDisplayName = order.order_name || order.order_code;
      for (const saleId of saleEmployeeIds) {
        await this.notificationsService.createNotification(
          {
            employeeId: saleId,
            eventType: 'ORDER_REJECTED',
            title: 'Đơn hàng bị từ chối',
            content: `Đơn hàng ${orderDisplayName} đã bị từ chối: ${dto.reason}`,
            deepLinkUrl: `/orders/${order.id}`,
            entityType: 'orders',
            entityId: order.id,
            idempotent: true,
          },
          trx,
        );
      }

      return updatedOrder;
    });
  }

  async cancelOrder(id: string, dto: CancelOrderDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status)) {
        throw new BadRequestException(`Terminal order [${order.workflow_status}] cannot be cancelled`);
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set({
          workflow_status: 'CANCELLED',
          updated_at: new Date(),
        })
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_CANCEL', 'orders', order.id, actorEmployeeId, { ...order, reason: dto.reason }, updatedOrder);
      return updatedOrder;
    });
  }

  async updateOrder(id: string, dto: UpdateOrderDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${id}] not found`);
      }

      if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status)) {
        throw new BadRequestException(`Cannot edit order in status ${order.workflow_status}`);
      }

      const updates: {
        updated_at: Date;
        order_name?: string;
        start_date?: string | null;
        end_date?: string | null;
      } = { updated_at: new Date() };
      if (dto.orderName !== undefined) {
        updates.order_name = dto.orderName;
      }
      if (dto.startDate !== undefined) {
        updates.start_date = dto.startDate ? dto.startDate : null;
      }
      if (dto.endDate !== undefined) {
        updates.end_date = dto.endDate ? dto.endDate : null;
      }

      if (updates.start_date && updates.end_date) {
        if (new Date(updates.end_date) < new Date(updates.start_date)) {
          throw new BadRequestException('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
        }
      }

      const [updatedOrder] = await trx
        .updateTable('orders')
        .set(updates)
        .where('id', '=', order.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_UPDATE', 'orders', order.id, actorEmployeeId, order, updatedOrder);
      return updatedOrder;
    });
  }

  // --------------------------------------------------
  // ORDER ITEM ACTIONS
  // --------------------------------------------------

  async addOrderItem(orderId: string, dto: CreateOrderItemDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', orderId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Order [${orderId}] not found`);
      }

      if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status)) {
        throw new BadRequestException(`Cannot add items to a non-active order (${order.workflow_status})`);
      }

      // Find or auto-create active service
      const serviceIdStr = String(dto.serviceId).replace(/^__NEW__:/, '').trim();
      let service: Selectable<Services> | undefined;

      if (/^\d+$/.test(serviceIdStr)) {
        service = await trx
          .selectFrom('services')
          .selectAll()
          .where('id', '=', serviceIdStr)
          .executeTakeFirst();
      }

      if (!service) {
        service = await trx
          .selectFrom('services')
          .selectAll()
          .where((eb) => eb(eb.fn('lower', ['name']), '=', serviceIdStr.toLowerCase()))
          .executeTakeFirst();
      }

      if (!service) {
        // Auto-create new service catalog entry
        const slug = serviceIdStr
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '')
          .toUpperCase()
          .slice(0, 20);
        let code = `SVC_${slug || 'NEW'}_${Date.now().toString().slice(-4)}`;
        const codeCheck = await trx
          .selectFrom('services')
          .select('id')
          .where('code', '=', code)
          .executeTakeFirst();
        if (codeCheck) {
          code = `SVC_${Date.now()}`;
        }

        const [createdService] = await trx
          .insertInto('services')
          .values({
            code,
            name: serviceIdStr,
            service_type: 'PROJECT',
            description: `Dịch vụ ${serviceIdStr}`,
            is_active: true,
          })
          .returningAll()
          .execute();

        service = createdService;
      }

      if (service.is_active === false) {
        throw new BadRequestException(`Dịch vụ [${service.name}] đang tạm ngưng hoạt động`);
      }

      // Verify closing sale employee exists and has sales-eligible role/position
      const closingSaleIdStr = String(dto.closingSaleId);
      const employee = await trx
        .selectFrom('employees as e')
        .leftJoin('positions as p', 'p.id', 'e.position_id')
        .select([
          'e.id',
          'e.employee_code',
          'e.full_name',
          'e.status',
          'p.code as position_code',
          'p.name as position_name',
        ])
        .where('e.id', '=', closingSaleIdStr as any)
        .executeTakeFirst();

      if (!employee) {
        throw new NotFoundException(`Nhân viên chốt sale [${dto.closingSaleId}] không tồn tại`);
      }

      if (employee.status !== 'ACTIVE' && employee.status !== 'PROBATION') {
        throw new BadRequestException(`Nhân viên [${employee.full_name}] không ở trạng thái hoạt động`);
      }

      const allowedPositionCodes = ['SALE', 'SALES_TEAM_LEADER', 'BOSS', 'ADMIN'];
      if (employee.position_code && !allowedPositionCodes.includes(employee.position_code)) {
        throw new BadRequestException(`Nhân viên [${employee.full_name}] không thuộc bộ phận kinh doanh`);
      }

      const originalPrice = Number(dto.originalPrice);
      if (isNaN(originalPrice) || originalPrice <= 0) {
        throw new BadRequestException('Đơn giá gốc phải lớn hơn 0');
      }

      const discountAmount = Number(dto.discountAmount || 0);
      if (isNaN(discountAmount) || discountAmount < 0) {
        throw new BadRequestException('Số tiền giảm giá không được nhỏ hơn 0');
      }

      if (discountAmount > originalPrice) {
        throw new BadRequestException('Số tiền giảm giá không được vượt quá đơn giá gốc');
      }

      // Find active requirement template
      let template = await trx
        .selectFrom('service_requirement_templates')
        .selectAll()
        .where('service_id', '=', service.id)
        .where('is_active', '=', true)
        .orderBy('version', 'desc')
        .executeTakeFirst();

      if (!template) {
        const [newTemplate] = await trx
          .insertInto('service_requirement_templates')
          .values({
            service_id: service.id,
            version: 1,
            template_name: `Template for ${service.name}`,
            is_active: true,
          })
          .returningAll()
          .execute();
        template = newTemplate;
      }

      const netServiceValue = originalPrice - discountAmount;
      const vatAmount = Number(dto.vatAmount || 0);

      let startDate: string | null = dto.startDate || null;
      let endDate: string | null = dto.endDate || null;
      if (startDate && endDate) {
        if (new Date(endDate) < new Date(startDate)) {
          throw new BadRequestException('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
        }
      }

      // Insert OrderItem
      const [orderItem] = await trx
        .insertInto('order_items')
        .values({
          order_id: order.id,
          deal_id: dto.dealId ? (dto.dealId as any) : null,
          closing_sale_id: dto.closingSaleId as any,
          service_id: service.id,
          requirement_template_id: template.id,
          requirement_template_version: template.version,
          original_price: originalPrice,
          discount_amount: discountAmount,
          net_service_value: netServiceValue,
          vat_amount: vatAmount,
          start_date: startDate ? (startDate as any) : null,
          end_date: endDate ? (endDate as any) : null,
          approval_status: 'DRAFT',
          delivery_status: 'PENDING',
          payment_status: 'UNPAID',
        })
        .returningAll()
        .execute();

      // Snapshot requirement fields into order_item_requirements
      const fields = await trx
        .selectFrom('service_requirement_fields')
        .selectAll()
        .where('template_id', '=', template.id)
        .execute();

      for (const field of fields) {
        await trx
          .insertInto('order_item_requirements')
          .values({
            order_item_id: orderItem.id,
            field_id: field.id,
            field_key_snapshot: field.field_key,
            label_snapshot: field.field_label,
            field_type_snapshot: field.field_type,
            options_snapshot: field.options_json ? JSON.stringify(field.options_json) : null,
            value_text: null,
            value_json: null,
          })
          .execute();
      }

      await this.logAudit(trx, 'ORDER_ITEM_ADD', 'order_items', orderItem.id, actorEmployeeId, null, orderItem);
      return orderItem;
    });
  }

  async updateOrderItem(itemId: string, dto: UpdateOrderItemDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] không tồn tại`);
      }

      const order = await trx
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', item.order_id)
        .forUpdate()
        .executeTakeFirst();

      if (!order) {
        throw new NotFoundException(`Đơn hàng [${item.order_id}] không tồn tại`);
      }

      if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(order.workflow_status)) {
        throw new BadRequestException(`Không thể chỉnh sửa đơn hàng ở trạng thái ${order.workflow_status}`);
      }

      if (item.approval_status !== 'DRAFT') {
        throw new BadRequestException(
          `Chỉ có thể chỉnh sửa dịch vụ ở trạng thái Nháp (DRAFT). Trạng thái hiện tại: ${item.approval_status}`,
        );
      }

      let serviceId = item.service_id;
      let requirementTemplateId = item.requirement_template_id;
      let requirementTemplateVersion = item.requirement_template_version;

      // Handle service change
      if (dto.serviceId && String(dto.serviceId) !== String(item.service_id)) {
        const serviceIdStr = String(dto.serviceId).replace(/^__NEW__:/, '').trim();
        let service: Selectable<Services> | undefined;

        if (/^\d+$/.test(serviceIdStr)) {
          service = await trx
            .selectFrom('services')
            .selectAll()
            .where('id', '=', serviceIdStr)
            .executeTakeFirst();
        }

        if (!service) {
          service = await trx
            .selectFrom('services')
            .selectAll()
            .where((eb) => eb(eb.fn('lower', ['name']), '=', serviceIdStr.toLowerCase()))
            .executeTakeFirst();
        }

        if (!service) {
          const slug = serviceIdStr
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toUpperCase()
            .slice(0, 20);
          let code = `SVC_${slug || 'NEW'}_${Date.now().toString().slice(-4)}`;
          const codeCheck = await trx
            .selectFrom('services')
            .select('id')
            .where('code', '=', code)
            .executeTakeFirst();
          if (codeCheck) {
            code = `SVC_${Date.now()}`;
          }

          const [createdService] = await trx
            .insertInto('services')
            .values({
              code,
              name: serviceIdStr,
              service_type: 'PROJECT',
              description: `Dịch vụ ${serviceIdStr}`,
              is_active: true,
            })
            .returningAll()
            .execute();

          service = createdService;
        }

        if (service.is_active === false) {
          throw new BadRequestException(`Dịch vụ [${service.name}] đang tạm ngưng hoạt động`);
        }

        serviceId = service.id;

        let template = await trx
          .selectFrom('service_requirement_templates')
          .selectAll()
          .where('service_id', '=', service.id)
          .where('is_active', '=', true)
          .orderBy('version', 'desc')
          .executeTakeFirst();

        if (!template) {
          const [newTemplate] = await trx
            .insertInto('service_requirement_templates')
            .values({
              service_id: service.id,
              version: 1,
              template_name: `Template for ${service.name}`,
              is_active: true,
            })
            .returningAll()
            .execute();
          template = newTemplate;
        }

        requirementTemplateId = template.id;
        requirementTemplateVersion = template.version;

        // Reset requirements snapshot
        await trx
          .deleteFrom('order_item_requirements')
          .where('order_item_id', '=', item.id)
          .execute();

        const fields = await trx
          .selectFrom('service_requirement_fields')
          .selectAll()
          .where('template_id', '=', template.id)
          .execute();

        for (const field of fields) {
          await trx
            .insertInto('order_item_requirements')
            .values({
              order_item_id: item.id,
              field_id: field.id,
              field_key_snapshot: field.field_key,
              label_snapshot: field.field_label,
              field_type_snapshot: field.field_type,
              options_snapshot: field.options_json ? JSON.stringify(field.options_json) : null,
              value_text: null,
              value_json: null,
            })
            .execute();
        }
      }

      // Handle closing sale change
      let closingSaleId = item.closing_sale_id;
      if (dto.closingSaleId && String(dto.closingSaleId) !== String(item.closing_sale_id)) {
        const closingSaleIdStr = String(dto.closingSaleId);
        const employee = await trx
          .selectFrom('employees as e')
          .leftJoin('positions as p', 'p.id', 'e.position_id')
          .select([
            'e.id',
            'e.employee_code',
            'e.full_name',
            'e.status',
            'p.code as position_code',
          ])
          .where('e.id', '=', closingSaleIdStr as any)
          .executeTakeFirst();

        if (!employee) {
          throw new NotFoundException(`Nhân viên chốt sale [${dto.closingSaleId}] không tồn tại`);
        }
        if (employee.status !== 'ACTIVE' && employee.status !== 'PROBATION') {
          throw new BadRequestException(`Nhân viên [${employee.full_name}] không ở trạng thái hoạt động`);
        }
        closingSaleId = employee.id;
      }

      const originalPrice = dto.originalPrice !== undefined ? Number(dto.originalPrice) : Number(item.original_price);
      if (isNaN(originalPrice) || originalPrice <= 0) {
        throw new BadRequestException('Đơn giá gốc phải lớn hơn 0');
      }

      const discountAmount = dto.discountAmount !== undefined ? Number(dto.discountAmount) : Number(item.discount_amount || 0);
      if (isNaN(discountAmount) || discountAmount < 0) {
        throw new BadRequestException('Số tiền giảm giá không được âm');
      }
      if (discountAmount > originalPrice) {
        throw new BadRequestException('Số tiền giảm giá không được vượt quá đơn giá gốc');
      }

      const netServiceValue = originalPrice - discountAmount;
      const vatAmount = dto.vatAmount !== undefined ? Number(dto.vatAmount) : Number(item.vat_amount || 0);

      let startDate: string | null = dto.startDate !== undefined ? (dto.startDate || null) : (item.start_date || null);
      let endDate: string | null = dto.endDate !== undefined ? (dto.endDate || null) : (item.end_date || null);

      if (startDate && endDate) {
        if (new Date(endDate) < new Date(startDate)) {
          throw new BadRequestException('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu');
        }
      }

      const [updatedItem] = await trx
        .updateTable('order_items')
        .set({
          service_id: serviceId as any,
          closing_sale_id: closingSaleId as any,
          requirement_template_id: requirementTemplateId as any,
          requirement_template_version: requirementTemplateVersion,
          original_price: originalPrice,
          discount_amount: discountAmount,
          net_service_value: netServiceValue,
          vat_amount: vatAmount,
          start_date: startDate ? (startDate as any) : null,
          end_date: endDate ? (endDate as any) : null,
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .returningAll()
        .execute();

      await trx
        .updateTable('orders')
        .set({ updated_at: new Date() })
        .where('id', '=', order.id)
        .execute();

      await this.logAudit(trx, 'ORDER_ITEM_UPDATE', 'order_items', updatedItem.id, actorEmployeeId, item, updatedItem);

      return updatedItem;
    });
  }

  async submitOrderItem(itemId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      if (item.approval_status !== 'DRAFT') {
        throw new BadRequestException(`Only DRAFT order items can be submitted (current: ${item.approval_status})`);
      }

      const [updatedItem] = await trx
        .updateTable('order_items')
        .set({
          approval_status: 'PENDING_APPROVAL',
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_ITEM_SUBMIT', 'order_items', item.id, actorEmployeeId, item, updatedItem);
      return updatedItem;
    });
  }

  async approveOrderItem(itemId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      if (item.approval_status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL order items can be approved (current: ${item.approval_status})`);
      }

      const [updatedItem] = await trx
        .updateTable('order_items')
        .set({
          approval_status: 'APPROVED',
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_ITEM_APPROVE', 'order_items', item.id, actorEmployeeId, item, updatedItem);
      return updatedItem;
    });
  }

  async rejectOrderItem(itemId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      if (item.approval_status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL order items can be rejected (current: ${item.approval_status})`);
      }

      const [updatedItem] = await trx
        .updateTable('order_items')
        .set({
          approval_status: 'REJECTED',
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_ITEM_REJECT', 'order_items', item.id, actorEmployeeId, item, updatedItem);
      return updatedItem;
    });
  }

  async cancelOrderItem(itemId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      const [updatedItem] = await trx
        .updateTable('order_items')
        .set({
          approval_status: 'CANCELLED',
          delivery_status: 'CANCELLED',
          updated_at: new Date(),
        })
        .where('id', '=', item.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'ORDER_ITEM_CANCEL', 'order_items', item.id, actorEmployeeId, item, updatedItem);
      return updatedItem;
    });
  }

  // --------------------------------------------------
  // REQUIREMENT VALUES UPDATE
  // --------------------------------------------------

  async updateOrderItemRequirements(
    itemId: string,
    dto: UpdateOrderItemRequirementsDto,
    actorEmployeeId?: string,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      if (item.approval_status === 'APPROVED') {
        throw new BadRequestException('Approved OrderItem requirements cannot be overwritten directly. Must use Change Request.');
      }

      for (const req of dto.requirements) {
        await trx
          .updateTable('order_item_requirements')
          .set({
            value_text: req.valueText || null,
            value_json: req.valueJson ? JSON.stringify(req.valueJson) : null,
          })
          .where('order_item_id', '=', item.id)
          .where('field_key_snapshot', '=', req.fieldKey)
          .execute();
      }

      await this.logAudit(trx, 'ORDER_ITEM_REQUIREMENTS_UPDATE', 'order_items', item.id, actorEmployeeId);
      return { success: true, message: 'Requirements updated successfully' };
    });
  }

  // --------------------------------------------------
  // CHANGE REQUEST ACTIONS
  // --------------------------------------------------

  async createChangeRequest(
    itemId: string,
    dto: CreateChangeRequestDto,
    requestedByEmployeeId: string,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items')
        .selectAll()
        .where('id', '=', itemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem [${itemId}] not found`);
      }

      if (item.approval_status !== 'APPROVED') {
        throw new BadRequestException('Change requests can only be created for APPROVED OrderItems');
      }

      const [changeRequest] = await trx
        .insertInto('change_requests')
        .values({
          order_item_id: item.id,
          requested_by_employee_id: requestedByEmployeeId as any,
          change_type: dto.changeType,
          description: dto.description,
          amount_delta: dto.amountDelta || 0,
          days_delta: dto.daysDelta || 0,
          status: 'PENDING_APPROVAL',
        })
        .returningAll()
        .execute();

      await this.logAudit(trx, 'CHANGE_REQUEST_CREATE', 'change_requests', changeRequest.id, requestedByEmployeeId, null, changeRequest);
      return changeRequest;
    });
  }

  async approveChangeRequest(changeRequestId: string, approvedByEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const cr = await trx
        .selectFrom('change_requests')
        .selectAll()
        .where('id', '=', changeRequestId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!cr) {
        throw new NotFoundException(`ChangeRequest [${changeRequestId}] not found`);
      }

      if (cr.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL ChangeRequests can be approved (current: ${cr.status})`);
      }

      const [updatedCr] = await trx
        .updateTable('change_requests')
        .set({
          status: 'APPROVED',
          approved_by_employee_id: approvedByEmployeeId as any,
          approved_at: new Date(),
        })
        .where('id', '=', cr.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'CHANGE_REQUEST_APPROVE', 'change_requests', cr.id, approvedByEmployeeId, cr, updatedCr);
      return updatedCr;
    });
  }

  async rejectChangeRequest(changeRequestId: string, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const cr = await trx
        .selectFrom('change_requests')
        .selectAll()
        .where('id', '=', changeRequestId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!cr) {
        throw new NotFoundException(`ChangeRequest [${changeRequestId}] not found`);
      }

      if (cr.status !== 'PENDING_APPROVAL') {
        throw new BadRequestException(`Only PENDING_APPROVAL ChangeRequests can be rejected (current: ${cr.status})`);
      }

      const [updatedCr] = await trx
        .updateTable('change_requests')
        .set({
          status: 'REJECTED',
        })
        .where('id', '=', cr.id)
        .returningAll()
        .execute();

      await this.logAudit(trx, 'CHANGE_REQUEST_REJECT', 'change_requests', cr.id, actorEmployeeId, cr, updatedCr);
      return updatedCr;
    });
  }

  async implementChangeRequest(changeRequestId: string, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const cr = await trx
        .selectFrom('change_requests')
        .selectAll()
        .where('id', '=', changeRequestId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!cr) {
        throw new NotFoundException(`ChangeRequest [${changeRequestId}] not found`);
      }

      if (cr.status !== 'APPROVED') {
        throw new BadRequestException(`Only APPROVED ChangeRequests can be implemented (current: ${cr.status})`);
      }

      const [updatedCr] = await trx
        .updateTable('change_requests')
        .set({
          status: 'IMPLEMENTED',
          implemented_at: new Date(),
        })
        .where('id', '=', cr.id)
        .returningAll()
        .execute();

      // Apply amount_delta to order_items.net_service_value
      if (cr.amount_delta !== 0) {
        await trx
          .updateTable('order_items')
          .set((eb) => ({
            net_service_value: eb('net_service_value', '+', cr.amount_delta),
            updated_at: new Date(),
          }))
          .where('id', '=', cr.order_item_id)
          .execute();
      }

      await this.logAudit(trx, 'CHANGE_REQUEST_IMPLEMENT', 'change_requests', cr.id, actorEmployeeId, cr, updatedCr);
      return updatedCr;
    });
  }

  // --------------------------------------------------
  // LISTING & DETAIL QUERIES
  // --------------------------------------------------

  async findOrders(filter: FindOrdersFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 10));
    const offset = (page - 1) * limit;

    let query = this.kysely.db
      .selectFrom('orders as o')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .leftJoin('contacts as c', 'c.id', 'o.primary_contact_id');

    if (filter.workflowStatus) {
      query = query.where('o.workflow_status', '=', filter.workflowStatus);
    }

    if (filter.accountId) {
      query = query.where('o.account_id', '=', filter.accountId as any);
    }

    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('o.order_code', 'ilike', searchTerm),
          eb('o.order_name', 'ilike', searchTerm),
          eb('a.company_name', 'ilike', searchTerm),
        ]),
      );
    }

    // Team-scope auth filter: SALES_TEAM_LEADER
    if (filter.closingSaleIdIn && filter.closingSaleIdIn.length > 0) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('order_items as oi')
            .whereRef('oi.order_id', '=', 'o.id')
            .where('oi.closing_sale_id', 'in', filter.closingSaleIdIn as any),
        ),
      );
    } else if (filter.closingSaleIdIn && filter.closingSaleIdIn.length === 0) {
      query = query.where(sql`1 = 0` as any);
    }

    // Object level auth filter: SALE role
    if (filter.closingSaleIdOnly) {
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom('order_items as oi')
            .whereRef('oi.order_id', '=', 'o.id')
            .where('oi.closing_sale_id', '=', filter.closingSaleIdOnly as any),
        ),
      );
    }

    // Total Count
    const countResult = await query
      .select(sql<number>`count(distinct o.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total || 0);

    // Paginated Rows
    const data = await query
      .select([
        'o.id',
        'o.account_id',
        'a.company_name',
        'o.primary_contact_id',
        'c.full_name as primary_contact_name',
        'o.order_code',
        'o.order_name',
        'o.workflow_status',
        'o.created_at',
        'o.updated_at',
      ])
      .orderBy('o.created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    // Enrich with item counts and total values
    const enrichedData = await Promise.all(
      data.map(async (order) => {
        const itemsSummary = await this.kysely.db
          .selectFrom('order_items as oi')
          .leftJoin('services as s', 's.id', 'oi.service_id')
          .select([
            sql<number>`count(oi.id)`.as('item_count'),
            sql<number>`coalesce(sum(oi.net_service_value), 0)`.as('total_net_value'),
            sql<string>`string_agg(distinct s.name, ', ')`.as('service_names'),
          ])
          .where('oi.order_id', '=', order.id)
          .executeTakeFirst();

        const orderName =
          order.order_name ||
          itemsSummary?.service_names ||
          `Đơn hàng ${order.order_code}`;

        return {
          ...order,
          order_name: orderName,
          itemCount: Number(itemsSummary?.item_count || 0),
          totalNetValue: Number(itemsSummary?.total_net_value || 0),
        };
      }),
    );

    return {
      data: enrichedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOrderById(id: string) {
    const order = await this.kysely.db
      .selectFrom('orders as o')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .leftJoin('contacts as c', 'c.id', 'o.primary_contact_id')
      .select([
        'o.id',
        'o.account_id',
        'a.company_name',
        'a.tax_code',
        'a.phone as account_phone',
        'a.email as account_email',
        'o.primary_contact_id',
        'c.full_name as primary_contact_name',
        'c.phone as primary_contact_phone',
        'c.email as primary_contact_email',
        'o.order_code',
        'o.order_name',
        'o.workflow_status',
        'o.start_date',
        'o.end_date',
        'o.created_at',
        'o.updated_at',
      ])
      .where('o.id', '=', id as any)
      .executeTakeFirst();

    if (!order) {
      throw new NotFoundException(`Order [${id}] not found`);
    }

    // Fetch order items
    const items = await this.kysely.db
      .selectFrom('order_items as oi')
      .innerJoin('services as s', 's.id', 'oi.service_id')
      .innerJoin('employees as closer', 'closer.id', 'oi.closing_sale_id')
      .leftJoin('deals as d', 'd.id', 'oi.deal_id')
      .leftJoin('projects as p', 'p.order_item_id', 'oi.id')
      .select([
        'oi.id',
        'oi.order_id',
        'p.id as project_id',
        'oi.deal_id',
        'd.deal_name',
        'oi.closing_sale_id',
        'closer.full_name as closing_sale_name',
        'closer.employee_code as closing_sale_code',
        'oi.service_id',
        's.name as service_name',
        'oi.requirement_template_id',
        'oi.requirement_template_version',
        'oi.original_price',
        'oi.discount_amount',
        'oi.net_service_value',
        'oi.vat_amount',
        'oi.approval_status',
        'oi.delivery_status',
        'oi.payment_status',
        'oi.start_date',
        'oi.end_date',
        'oi.created_at',
        'oi.updated_at',
      ])
      .where('oi.order_id', '=', id as any)
      .orderBy('oi.created_at', 'asc')
      .execute();

    const activePaymentPlans =
      items.length > 0
        ? await this.kysely.db
            .selectFrom('order_item_payment_plans')
            .select(['id', 'order_item_id', 'status', 'version'])
            .where(
              'order_item_id',
              'in',
              items.map((item) => item.id),
            )
            .where('status', 'in', ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'])
            .execute()
        : [];
    const paymentPlanIds = activePaymentPlans.map((plan) => plan.id);
    const paymentPlanInstallments =
      paymentPlanIds.length > 0
        ? await this.kysely.db
            .selectFrom('payment_installments')
            .select([
              'id',
              'payment_plan_id',
              'installment_number',
              sql<string>`to_char(due_date, 'YYYY-MM-DD')`.as('due_date'),
              'gross_amount_due',
              'status',
            ])
            .where('payment_plan_id', 'in', paymentPlanIds)
            .orderBy('installment_number', 'asc')
            .execute()
        : [];

    // Enrich items with requirements and change requests
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const requirements = await this.kysely.db
          .selectFrom('order_item_requirements')
          .selectAll()
          .where('order_item_id', '=', item.id)
          .execute();

        const changeRequests = await this.kysely.db
          .selectFrom('change_requests as cr')
          .innerJoin('employees as req_emp', 'req_emp.id', 'cr.requested_by_employee_id')
          .leftJoin('employees as app_emp', 'app_emp.id', 'cr.approved_by_employee_id')
          .select([
            'cr.id',
            'cr.order_item_id',
            'cr.change_type',
            'cr.description',
            'cr.amount_delta',
            'cr.days_delta',
            'cr.status',
            'req_emp.full_name as requested_by_name',
            'app_emp.full_name as approved_by_name',
            'cr.approved_at',
            'cr.implemented_at',
            'cr.created_at',
          ])
          .where('cr.order_item_id', '=', item.id)
          .orderBy('cr.created_at', 'desc')
          .execute();

        return {
          ...item,
          payment_plan:
            activePaymentPlans
              .filter((plan) => String(plan.order_item_id) === String(item.id))
              .map((plan) => ({
                ...plan,
                installments: paymentPlanInstallments.filter(
                  (installment) => String(installment.payment_plan_id) === String(plan.id),
                ),
              }))[0] || null,
          requirements,
          changeRequests,
        };
      }),
    );

    // Audit logs for order
    const auditLogs = await this.kysely.db
      .selectFrom('audit_logs as al')
      .leftJoin('employees as emp', 'emp.id', 'al.actor_employee_id')
      .select([
        'al.id',
        'al.action',
        'al.entity_type',
        'al.entity_id',
        'al.payload_before_sanitized',
        'al.payload_after_sanitized',
        'al.created_at',
        'emp.full_name as actor_name',
      ])
      .where('al.entity_type', '=', 'orders')
      .where('al.entity_id', '=', id as any)
      .orderBy('al.created_at', 'desc')
      .execute();

    return {
      ...order,
      items: enrichedItems,
      auditLogs,
    };
  }

  async getActiveServices() {
    const services = await this.kysely.db
      .selectFrom('services')
      .selectAll()
      .where('is_active', '=', true)
      .orderBy('name', 'asc')
      .execute();

    const priceRows = await this.kysely.db
      .selectFrom('order_items')
      .select([
        'service_id',
        (eb) => eb.fn.max('original_price').as('max_price'),
      ])
      .groupBy('service_id')
      .execute();

    const priceMap = new Map<string, number>();
    for (const r of priceRows) {
      if (r.service_id && r.max_price) {
        priceMap.set(String(r.service_id), Number(r.max_price));
      }
    }

    return services.map((s) => ({
      id: Number(s.id),
      code: s.code,
      name: s.name,
      service_type: s.service_type,
      description: s.description,
      is_active: s.is_active,
      defaultPrice: priceMap.get(String(s.id)) || (s.service_type === 'PROJECT' ? 10000000 : 5000000),
    }));
  }

  async getActiveSalesReps() {
    return await this.kysely.db
      .selectFrom('employees as e')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .leftJoin('users as u', 'u.id', 'e.user_id')
      .select([
        'e.id',
        'e.employee_code',
        'e.full_name',
        'u.email',
        'p.code as position_code',
        'p.name as position_name',
      ])
      .where('e.status', 'in', ['ACTIVE', 'PROBATION'])
      .where((eb) =>
        eb.or([
          eb('p.code', 'in', ['SALE', 'SALES_TEAM_LEADER', 'BOSS', 'ADMIN']),
          eb('p.code', 'is', null),
        ]),
      )
      .orderBy('e.full_name', 'asc')
      .execute();
  }

  async createService(dto: CreateServiceDto, actorEmployeeId?: string) {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Tên dịch vụ không được để trống');
    }

    const existing = await this.kysely.db
      .selectFrom('services')
      .selectAll()
      .where((eb) => eb(eb.fn('lower', ['name']), '=', trimmedName.toLowerCase()))
      .executeTakeFirst();

    if (existing) {
      if (!existing.is_active) {
        await this.kysely.db
          .updateTable('services')
          .set({ is_active: true })
          .where('id', '=', existing.id)
          .execute();
      }
      return {
        id: Number(existing.id),
        code: existing.code,
        name: existing.name,
        service_type: existing.service_type,
        description: existing.description,
        is_active: true,
        defaultPrice: dto.defaultPrice || (existing.service_type === 'PROJECT' ? 10000000 : 5000000),
      };
    }

    let code = dto.code ? dto.code.trim().toUpperCase() : '';
    if (!code) {
      const slug = trimmedName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase()
        .slice(0, 20);
      code = `SVC_${slug || 'NEW'}_${Date.now().toString().slice(-4)}`;
    }

    const codeExists = await this.kysely.db
      .selectFrom('services')
      .select('id')
      .where('code', '=', code)
      .executeTakeFirst();

    if (codeExists) {
      code = `SVC_${Date.now()}`;
    }

    const serviceType = dto.serviceType || 'PROJECT';

    const [newService] = await this.kysely.db
      .insertInto('services')
      .values({
        code,
        name: trimmedName,
        service_type: serviceType,
        description: dto.description || `Dịch vụ ${trimmedName}`,
        is_active: true,
      })
      .returningAll()
      .execute();

    await this.kysely.db
      .insertInto('service_requirement_templates')
      .values({
        service_id: newService.id,
        version: 1,
        template_name: `Template for ${newService.name}`,
        is_active: true,
      })
      .execute();

    const price = dto.defaultPrice !== undefined && dto.defaultPrice > 0
      ? dto.defaultPrice
      : (serviceType === 'PROJECT' ? 10000000 : 5000000);

    return {
      id: Number(newService.id),
      code: newService.code,
      name: newService.name,
      service_type: newService.service_type,
      description: newService.description,
      is_active: true,
      defaultPrice: price,
    };
  }
}

