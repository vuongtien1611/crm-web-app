import { Injectable, BadRequestException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { CreateSalesActivityDto } from './dto/create-sales-activity.dto';

@Injectable()
export class SalesActivitiesService {
  constructor(private readonly kysely: KyselyService) {}

  async createActivity(employeeId: string, dto: CreateSalesActivityDto) {
    if (!dto.leadId && !dto.dealId && !dto.accountId) {
      throw new BadRequestException('Activity must be linked to a lead, deal, or account');
    }

    const [activity] = await this.kysely.db
      .insertInto('sales_activities')
      .values({
        lead_id: dto.leadId ? (dto.leadId as any) : null,
        deal_id: dto.dealId ? (dto.dealId as any) : null,
        account_id: dto.accountId ? (dto.accountId as any) : null,
        employee_id: employeeId as any,
        activity_type: dto.activityType,
        occurred_at: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        next_follow_up_at: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
        result_note: dto.resultNote || null,
      })
      .returningAll()
      .execute();

    return activity;
  }

  async findByLead(leadId: string) {
    return this.kysely.db
      .selectFrom('sales_activities as sa')
      .innerJoin('employees as e', 'e.id', 'sa.employee_id')
      .select([
        'sa.id',
        'sa.lead_id',
        'sa.activity_type',
        'sa.occurred_at',
        'sa.next_follow_up_at',
        'sa.result_note',
        'sa.created_at',
        'sa.employee_id',
        'e.full_name as employee_name',
        'e.employee_code',
      ])
      .where('sa.lead_id', '=', leadId as any)
      .orderBy('sa.occurred_at', 'desc')
      .execute();
  }

  async findByDeal(dealId: string) {
    return this.kysely.db
      .selectFrom('sales_activities as sa')
      .innerJoin('employees as e', 'e.id', 'sa.employee_id')
      .select([
        'sa.id',
        'sa.deal_id',
        'sa.activity_type',
        'sa.occurred_at',
        'sa.next_follow_up_at',
        'sa.result_note',
        'sa.created_at',
        'sa.employee_id',
        'e.full_name as employee_name',
        'e.employee_code',
      ])
      .where('sa.deal_id', '=', dealId as any)
      .orderBy('sa.occurred_at', 'desc')
      .execute();
  }
}
