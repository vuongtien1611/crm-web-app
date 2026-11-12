import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { KyselyService, CrmDynamicRow } from '../../database/kysely.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { AssignDealDto } from './dto/assign-deal.dto';
import { SetClosingSaleDto } from './dto/set-closing-sale.dto';
import { MarkLostDto } from './dto/mark-lost.dto';
import { sql } from 'kysely';

export interface FindDealsFilter {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  assignedSaleId?: string;
  accountId?: string;
  assignedSaleIdOnly?: string;   // SALE role: restricted to own deals
  assignedSaleIdIn?: string[];   // SALES_TEAM_LEADER: restricted to team member deals
}

@Injectable()
export class DealsService {
  constructor(private readonly kysely: KyselyService) {}

  async createDeal(dto: CreateDealDto) {
    const [deal] = await this.kysely.db
      .insertInto('deals')
      .values({
        account_id: dto.accountId as any,
        primary_contact_id: dto.primaryContactId ? (dto.primaryContactId as any) : null,
        lead_id: dto.leadId ? (dto.leadId as any) : null,
        assigned_sale_id: dto.assignedSaleId as any,
        deal_name: dto.dealName,
        expected_value: dto.expectedValue || 0,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    return deal;
  }

  async findDeals(filter: FindDealsFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 10));
    const offset = (page - 1) * limit;

    let query = this.kysely.db
      .selectFrom('deals as d')
      .innerJoin('accounts as a', 'a.id', 'd.account_id')
      .leftJoin('contacts as c', 'c.id', 'd.primary_contact_id')
      .innerJoin('employees as sale', 'sale.id', 'd.assigned_sale_id')
      .leftJoin('employees as closer', 'closer.id', 'd.closing_sale_id');

    // Object-level auth: restrict SALE role to own deals
    if (filter.assignedSaleIdOnly) {
      query = query.where('d.assigned_sale_id', '=', filter.assignedSaleIdOnly as any);
    }

    // Team-scope auth: restrict SALES_TEAM_LEADER to current team members' deals
    if (filter.assignedSaleIdIn && filter.assignedSaleIdIn.length > 0) {
      query = query.where('d.assigned_sale_id', 'in', filter.assignedSaleIdIn as any);
    } else if (filter.assignedSaleIdIn && filter.assignedSaleIdIn.length === 0) {
      query = query.where(sql`1 = 0` as any);
    }

    if (filter.assignedSaleId) {
      query = query.where('d.assigned_sale_id', '=', filter.assignedSaleId as any);
    }

    if (filter.accountId) {
      query = query.where('d.account_id', '=', filter.accountId as any);
    }

    if (filter.status) {
      query = query.where('d.status', '=', filter.status);
    }

    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('d.deal_name', 'ilike', searchTerm),
          eb('a.company_name', 'ilike', searchTerm),
        ]),
      );
    }

    // Total Count
    const countResult = await query
      .select(sql<number>`count(d.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total || 0);

    // Paginated Rows
    const data = await query
      .select([
        'd.id',
        'd.account_id',
        'a.company_name',
        'd.primary_contact_id',
        'c.full_name as primary_contact_name',
        'd.lead_id',
        'd.assigned_sale_id',
        'sale.full_name as assigned_sale_name',
        'sale.employee_code as assigned_sale_code',
        'd.closing_sale_id',
        'closer.full_name as closing_sale_name',
        'd.deal_name',
        'd.expected_value',
        'd.status',
        'd.won_at',
        'd.lost_at',
        'd.lost_reason',
        'd.created_at',
        'd.updated_at',
      ])
      .orderBy('d.created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findDealById(id: string) {
    const deal = await this.kysely.db
      .selectFrom('deals as d')
      .innerJoin('accounts as a', 'a.id', 'd.account_id')
      .leftJoin('contacts as c', 'c.id', 'd.primary_contact_id')
      .innerJoin('employees as sale', 'sale.id', 'd.assigned_sale_id')
      .leftJoin('employees as closer', 'closer.id', 'd.closing_sale_id')
      .leftJoin('leads as l', 'l.id', 'd.lead_id')
      .select([
        'd.id',
        'd.account_id',
        'a.company_name',
        'a.tax_code',
        'a.phone as account_phone',
        'a.email as account_email',
        'd.primary_contact_id',
        'c.full_name as primary_contact_name',
        'c.phone as primary_contact_phone',
        'c.email as primary_contact_email',
        'd.lead_id',
        'l.full_name as lead_name',
        'd.assigned_sale_id',
        'sale.full_name as assigned_sale_name',
        'sale.employee_code as assigned_sale_code',
        'd.closing_sale_id',
        'closer.full_name as closing_sale_name',
        'closer.employee_code as closing_sale_code',
        'd.deal_name',
        'd.expected_value',
        'd.status',
        'd.won_at',
        'd.lost_at',
        'd.lost_reason',
        'd.created_at',
        'd.updated_at',
      ])
      .where('d.id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    // Fetch activities linked to deal
    const activities = await this.kysely.db
      .selectFrom('sales_activities as sa')
      .innerJoin('employees as e', 'e.id', 'sa.employee_id')
      .select([
        'sa.id',
        'sa.activity_type',
        'sa.occurred_at',
        'sa.next_follow_up_at',
        'sa.result_note',
        'sa.created_at',
        'e.full_name as employee_name',
      ])
      .where('sa.deal_id', '=', id as any)
      .orderBy('sa.occurred_at', 'desc')
      .execute();

    // Fetch order items created for this deal
    const orderItems = await this.kysely.db
      .selectFrom('order_items as oi')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('services as s', 's.id', 'oi.service_id')
      .innerJoin('employees as closer', 'closer.id', 'oi.closing_sale_id')
      .select([
        'oi.id',
        'oi.order_id',
        'o.order_code',
        'o.workflow_status as order_status',
        'oi.deal_id',
        'oi.closing_sale_id',
        'closer.full_name as closing_sale_name',
        's.name as service_name',
        'oi.net_service_value',
        'oi.approval_status',
        'oi.created_at',
      ])
      .where('oi.deal_id', '=', id as any)
      .execute();

    return {
      ...deal,
      activities,
      orderItems,
    };
  }

  async updateDeal(id: string, dto: UpdateDealDto) {
    const deal = await this.kysely.db
      .selectFrom('deals')
      .select('id')
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    const [updatedDeal] = await this.kysely.db
      .updateTable('deals')
      .set({
        deal_name: dto.dealName || undefined,
        expected_value: dto.expectedValue !== undefined ? dto.expectedValue : undefined,
        primary_contact_id: dto.primaryContactId ? (dto.primaryContactId as any) : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedDeal;
  }

  async startNegotiation(id: string) {
    const deal = await this.kysely.db
      .selectFrom('deals')
      .select(['id', 'status'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    if (deal.status === 'WON' || deal.status === 'LOST') {
      throw new BadRequestException(`Cannot start negotiation on a ${deal.status} deal`);
    }

    const [updatedDeal] = await this.kysely.db
      .updateTable('deals')
      .set({
        status: 'NEGOTIATING',
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedDeal;
  }

  async assignDeal(id: string, dto: AssignDealDto) {
    const deal = await this.kysely.db
      .selectFrom('deals')
      .select(['id', 'assigned_sale_id'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    const [updatedDeal] = await this.kysely.db
      .updateTable('deals')
      .set({
        assigned_sale_id: dto.toSaleId as any,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedDeal;
  }

  async setClosingSale(id: string, dto: SetClosingSaleDto) {
    const deal = await this.kysely.db
      .selectFrom('deals')
      .select('id')
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    const [updatedDeal] = await this.kysely.db
      .updateTable('deals')
      .set({
        closing_sale_id: dto.closingSaleId as any,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedDeal;
  }

  async markLost(id: string, dto: MarkLostDto) {
    if (!dto.lostReason || dto.lostReason.trim() === '') {
      throw new BadRequestException('lost_reason is required when marking Deal as LOST');
    }

    const deal = await this.kysely.db
      .selectFrom('deals')
      .select(['id', 'status'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!deal) {
      throw new NotFoundException(`Deal [${id}] not found`);
    }

    const [updatedDeal] = await this.kysely.db
      .updateTable('deals')
      .set({
        status: 'LOST',
        lost_at: new Date(),
        lost_reason: dto.lostReason,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedDeal;
  }

  async markWon(id: string, actor?: { employeeId?: string | number; id?: string | number }) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      // 1. Lock Deal FOR UPDATE
      const deal = await trx
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();

      if (!deal) {
        throw new NotFoundException(`Deal [${id}] not found`);
      }

      if (deal.status === 'WON') {
        throw new BadRequestException(`Deal [${id}] is already WON`);
      }

      if (deal.status === 'LOST') {
        throw new BadRequestException(`Deal [${id}] cannot be marked as WON because it is LOST`);
      }

      // 2. Validate closing_sale_id
      const closingSaleId = deal.closing_sale_id;

      if (!closingSaleId) {
        throw new BadRequestException('closing_sale_id must be set before marking Deal as WON');
      }

      // 3. Mark Deal WON
      const [updatedDeal] = await trx
        .updateTable('deals')
        .set({
          status: 'WON',
          closing_sale_id: closingSaleId,
          won_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', deal.id)
        .returningAll()
        .execute();

      // Lock account row FOR UPDATE to serialize concurrent active order creation
      await trx
        .selectFrom('accounts')
        .select('id')
        .where('id', '=', deal.account_id)
        .forUpdate()
        .executeTakeFirst();

      // 4. Look up Active Order FOR UPDATE (Statuses: DRAFT, PENDING_APPROVAL, NEED_MORE_INFO, APPROVED, IN_PROGRESS)
      let activeOrder: CrmDynamicRow | undefined = await trx
        .selectFrom('orders')
        .selectAll()
        .where('account_id', '=', deal.account_id)
        .where('workflow_status', 'in', [
          'DRAFT',
          'PENDING_APPROVAL',
          'NEED_MORE_INFO',
          'APPROVED',
          'IN_PROGRESS',
        ])
        .forUpdate()
        .executeTakeFirst();

      // 5. CASE A: If NO active order exists, create DRAFT Order with concurrency conflict handling
      if (!activeOrder) {
        try {
          const orderCode = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const [newOrder] = await trx
            .insertInto('orders')
            .values({
              account_id: deal.account_id,
              primary_contact_id: deal.primary_contact_id || null,
              order_code: orderCode,
              order_name: deal.deal_name || `Đơn hàng - ${orderCode}`,
              workflow_status: 'DRAFT',
            })
            .returningAll()
            .execute();
          activeOrder = newOrder;
        } catch (err: unknown) {
          const pgErr = err as { code?: string; message?: string };
          // Concurrency protection for unique constraint idx_one_active_order_per_account
          if (pgErr.code === '23505' || pgErr.message?.includes('idx_one_active_order_per_account')) {
            activeOrder = await trx
              .selectFrom('orders')
              .selectAll()
              .where('account_id', '=', deal.account_id)
              .where('workflow_status', 'in', [
                'DRAFT',
                'PENDING_APPROVAL',
                'NEED_MORE_INFO',
                'APPROVED',
                'IN_PROGRESS',
              ])
              .forUpdate()
              .executeTakeFirst();
          } else {
            throw err;
          }
        }
      }

      if (!activeOrder) {
        throw new BadRequestException('Failed to acquire or create active order for account');
      }

      // 6. Find or create default active Service
      let service: CrmDynamicRow | undefined = await trx
        .selectFrom('services')
        .selectAll()
        .where('is_active', '=', true)
        .executeTakeFirst();

      if (!service) {
        const [newService] = await trx
          .insertInto('services')
          .values({
            code: `SVC-${Date.now()}`,
            name: 'Default Service Catalog',
            service_type: 'PROJECT',
            is_active: true,
          })
          .returningAll()
          .execute();
        service = newService;
      }

      // 7. Find or create default requirement template
      let template: CrmDynamicRow | undefined = await trx
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
            template_name: 'Default Requirement Template',
            is_active: true,
          })
          .returningAll()
          .execute();
        template = newTemplate;
      }

      // 8. Create Order Item boundary preserving deal_id and closing_sale_id
      const [orderItem] = await trx
        .insertInto('order_items')
        .values({
          order_id: activeOrder.id,
          deal_id: deal.id,
          closing_sale_id: closingSaleId as any,
          service_id: service.id,
          requirement_template_id: template.id,
          requirement_template_version: template.version,
          original_price: deal.expected_value || 0,
          discount_amount: 0,
          net_service_value: deal.expected_value || 0,
          vat_amount: 0,
          approval_status: 'DRAFT',
          delivery_status: 'PENDING',
          payment_status: 'UNPAID',
        })
        .returningAll()
        .execute();

      return {
        deal: updatedDeal,
        order: activeOrder,
        orderItem,
      };
    });
  }
}
