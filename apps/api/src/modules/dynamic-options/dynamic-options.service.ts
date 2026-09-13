import { Injectable, BadRequestException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';

export interface DynamicOptionFilter {
  fieldKey: string;
  q?: string;
  limit?: number;
}

@Injectable()
export class DynamicOptionsService {
  constructor(private readonly kysely: KyselyService) {}

  normalize(val: string): string {
    return val.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async getOptions(filter: DynamicOptionFilter) {
    if (!filter.fieldKey) {
      throw new BadRequestException('fieldKey query parameter is required');
    }

    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));

    let query = this.kysely.db
      .selectFrom('dynamic_options')
      .selectAll()
      .where('field_key', '=', filter.fieldKey);

    if (filter.q && filter.q.trim()) {
      const term = `%${filter.q.trim()}%`;
      query = query.where('value', 'ilike', term);
    }

    return await query
      .orderBy('last_used_at', 'desc')
      .orderBy('usage_count', 'desc')
      .orderBy('value', 'asc')
      .limit(limit)
      .execute();
  }

  async recordOptionUse(fieldKey: string, rawValue: string, employeeId?: string | number | null) {
    if (!fieldKey || !fieldKey.trim()) {
      throw new BadRequestException('fieldKey is required');
    }
    if (!rawValue || !rawValue.trim()) {
      throw new BadRequestException('value is required');
    }

    const value = rawValue.trim().replace(/\s+/g, ' ');
    const normalizedValue = this.normalize(value);

    return await this.kysely.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('dynamic_options')
        .selectAll()
        .where('field_key', '=', fieldKey.trim())
        .where('normalized_value', '=', normalizedValue)
        .forUpdate()
        .executeTakeFirst();

      if (existing) {
        const [updated] = await trx
          .updateTable('dynamic_options')
          .set({
            usage_count: Number(existing.usage_count) + 1,
            last_used_at: new Date(),
            updated_at: new Date(),
          })
          .where('id', '=', existing.id)
          .returningAll()
          .execute();
        return updated;
      }

      const [created] = await trx
        .insertInto('dynamic_options')
        .values({
          field_key: fieldKey.trim(),
          value,
          normalized_value: normalizedValue,
          usage_count: 1,
          last_used_at: new Date(),
          created_by_employee_id: employeeId ? (employeeId as any) : null,
        })
        .returningAll()
        .execute();

      return created;
    });
  }
}
