import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { AdjustCommissionDto } from './dto/adjust-commission.dto';
import { sql } from 'kysely';


@Injectable()
export class CommissionsService {
  constructor(private readonly kysely: KyselyService) {}

  async findCommissions(query: {
    page?: number;
    limit?: number;
    employeeId?: string;
    beneficiaryEmployeeIdIn?: string[];  // Team-scope: leader sees only team members
    commissionType?: string;
    status?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let baseQuery = this.kysely.db
      .selectFrom('commissions')
      .innerJoin('employees', 'employees.id', 'commissions.beneficiary_employee_id')
      .leftJoin('commission_policies', 'commission_policies.id', 'commissions.policy_id');

    if (query.employeeId) {
      baseQuery = baseQuery.where('commissions.beneficiary_employee_id', '=', query.employeeId as any);
    }
    // Team-scope: SALES_TEAM_LEADER sees only commissions of their team members
    if (query.beneficiaryEmployeeIdIn && query.beneficiaryEmployeeIdIn.length > 0) {
      baseQuery = baseQuery.where('commissions.beneficiary_employee_id', 'in', query.beneficiaryEmployeeIdIn as any);
    } else if (query.beneficiaryEmployeeIdIn && query.beneficiaryEmployeeIdIn.length === 0) {
      baseQuery = baseQuery.where(sql`1 = 0` as any);
    }
    if (query.commissionType) {
      baseQuery = baseQuery.where('commissions.commission_type', '=', query.commissionType as any);
    }
    if (query.status) {
      baseQuery = baseQuery.where('commissions.status', '=', query.status as any);
    }

    const items = await baseQuery
      .select([
        'commissions.id',
        'commissions.policy_id',
        'commissions.order_item_id',
        'commissions.service_period_id',
        'commissions.beneficiary_employee_id',
        'employees.full_name as beneficiary_name',
        'commissions.commission_type',
        'commissions.rate_snapshot',
        'commissions.commission_base',
        'commissions.calculated_amount',
        'commissions.approved_amount',
        'commissions.decision_reason',
        'commissions.status',
        'commissions.created_at',
        'commission_policies.policy_name',
      ])
      .orderBy('commissions.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const countRes = await baseQuery
      .select(sql<number>`count(commissions.id)`.as('total'))
      .executeTakeFirst();

    return {
      data: items,
      meta: {
        page,
        limit,
        total: Number(countRes?.total || 0),
      },
    };
  }

  async findCommissionById(id: string) {
    const comm = await this.kysely.db
      .selectFrom('commissions')
      .innerJoin('employees', 'employees.id', 'commissions.beneficiary_employee_id')
      .leftJoin('commission_policies', 'commission_policies.id', 'commissions.policy_id')
      .where('commissions.id', '=', id as any)
      .select([
        'commissions.id',
        'commissions.policy_id',
        'commissions.order_item_id',
        'commissions.service_period_id',
        'commissions.beneficiary_employee_id',
        'employees.full_name as beneficiary_name',
        'commissions.commission_type',
        'commissions.rate_snapshot',
        'commissions.commission_base',
        'commissions.calculated_amount',
        'commissions.approved_amount',
        'commissions.approved_by_employee_id',
        'commissions.decision_reason',
        'commissions.status',
        'commissions.created_at',
        'commissions.updated_at',
        'commission_policies.policy_name',
      ])
      .executeTakeFirst();

    if (!comm) {
      throw new NotFoundException(`Commission #${id} not found`);
    }

    const sources = await this.kysely.db
      .selectFrom('commission_sources')
      .selectAll()
      .where('commission_id', '=', id as any)
      .execute();

    return {
      ...comm,
      sources,
    };
  }

  async approveCommission(id: string, actorEmployeeId: string) {
    const comm = await this.kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!comm) throw new NotFoundException(`Commission #${id} not found`);

    if (comm.commission_type === 'SALE') {
      throw new BadRequestException('Sale commissions are automatically released and do not require Boss approval');
    }

    if (comm.status !== 'CALCULATED') {
      throw new BadRequestException(`Cannot approve commission #${id} with status ${comm.status}`);
    }

    const [updated] = await this.kysely.db
      .updateTable('commissions')
      .set({
        status: 'APPROVED',
        approved_amount: comm.calculated_amount,
        approved_by_employee_id: actorEmployeeId as any,
        approved_at: new Date() as any,
        updated_at: new Date(),
      })
      .where('id', '=', comm.id)
      .returningAll()
      .execute();

    return updated;
  }

  async adjustCommission(id: string, dto: AdjustCommissionDto, actorEmployeeId: string) {
    const comm = await this.kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!comm) throw new NotFoundException(`Commission #${id} not found`);

    if (comm.commission_type === 'SALE') {
      throw new BadRequestException('Sale commissions cannot be adjusted manually by Boss');
    }

    if (comm.status !== 'CALCULATED') {
      throw new BadRequestException(`Cannot adjust commission #${id} with status ${comm.status}`);
    }

    if (dto.approvedAmount === undefined || dto.approvedAmount < 0) {
      throw new BadRequestException('Adjusted approved amount must be greater than or equal to 0');
    }

    const [updated] = await this.kysely.db
      .updateTable('commissions')
      .set({
        status: 'ADJUSTED',
        approved_amount: dto.approvedAmount as any,
        decision_reason: dto.reason || null,
        approved_by_employee_id: actorEmployeeId as any,
        approved_at: new Date() as any,
        updated_at: new Date(),
      })
      .where('id', '=', comm.id)
      .returningAll()
      .execute();

    return updated;
  }

  async rejectCommission(id: string, reason: string | undefined, actorEmployeeId: string) {
    const comm = await this.kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!comm) throw new NotFoundException(`Commission #${id} not found`);

    if (comm.commission_type === 'SALE') {
      throw new BadRequestException('Sale commissions cannot be rejected manually');
    }

    if (comm.status !== 'CALCULATED') {
      throw new BadRequestException(`Cannot reject commission #${id} with status ${comm.status}`);
    }

    const [updated] = await this.kysely.db
      .updateTable('commissions')
      .set({
        status: 'REJECTED',
        approved_amount: 0 as any,
        decision_reason: reason || null,
        approved_by_employee_id: actorEmployeeId as any,
        updated_at: new Date(),
      })
      .where('id', '=', comm.id)
      .returningAll()
      .execute();

    return updated;
  }
}
