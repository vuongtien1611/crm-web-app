import { Injectable, NotFoundException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

@Injectable()
export class KpiService {
  constructor(private readonly kysely: KyselyService) {}

  async findKpiEvents(query: {
    page?: number;
    limit?: number;
    employeeId?: string;
    employeeIdIn?: string[];  // Team-scope: SALES_TEAM_LEADER sees only team members
    targetPeriod?: string;
    sourceType?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let baseQuery = this.kysely.db
      .selectFrom('kpi_events')
      .innerJoin('employees', 'employees.id', 'kpi_events.employee_id')
      .innerJoin('kpi_policies', 'kpi_policies.id', 'kpi_events.policy_id');

    if (query.employeeId) {
      baseQuery = baseQuery.where('kpi_events.employee_id', '=', query.employeeId as any);
    }
    // Team-scope: SALES_TEAM_LEADER sees only events for current team members
    if (query.employeeIdIn && query.employeeIdIn.length > 0) {
      baseQuery = baseQuery.where('kpi_events.employee_id', 'in', query.employeeIdIn as any);
    } else if (query.employeeIdIn && query.employeeIdIn.length === 0) {
      baseQuery = baseQuery.where(sql`1 = 0` as any);
    }
    if (query.targetPeriod) {
      baseQuery = baseQuery.where('kpi_events.target_kpi_period', '=', query.targetPeriod);
    }
    if (query.sourceType) {
      baseQuery = baseQuery.where('kpi_events.source_type', '=', query.sourceType as any);
    }

    const items = await baseQuery
      .select([
        'kpi_events.id',
        'kpi_events.employee_id',
        'employees.full_name as employee_name',
        'kpi_events.policy_id',
        'kpi_policies.policy_name',
        'kpi_events.source_type',
        'kpi_events.source_id',
        'kpi_events.metric_type',
        'kpi_events.metric_value',
        'kpi_events.kpi_points',
        'kpi_events.eligible_revenue',
        'kpi_events.target_kpi_period',
        'kpi_events.qualified_at',
        'kpi_events.created_at',
      ])
      .orderBy('kpi_events.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const countRes = await baseQuery
      .select(sql<number>`count(kpi_events.id)`.as('total'))
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

  async getEmployeeKpiSummary(employeeId: string, period?: string) {
    const targetPeriod = period || new Date().toISOString().substring(0, 7);

    const emp = await this.kysely.db
      .selectFrom('employees')
      .selectAll()
      .where('id', '=', employeeId as any)
      .executeTakeFirst();

    if (!emp) throw new NotFoundException(`Employee #${employeeId} not found`);

    const events = await this.kysely.db
      .selectFrom('kpi_events')
      .selectAll()
      .where('employee_id', '=', employeeId as any)
      .where('target_kpi_period', '=', targetPeriod)
      .execute();

    // Summarize revenue, points, and article counts
    let totalEligibleRevenue = 0;
    let totalKpiPoints = 0;
    let totalSeoArticles = 0;

    for (const ev of events) {
      if (ev.source_type === 'PAYMENT_ALLOCATION') {
        totalEligibleRevenue += Number(ev.eligible_revenue || ev.metric_value || 0);
      } else if (ev.source_type === 'PROJECT_ACCEPTANCE') {
        totalKpiPoints += Number(ev.kpi_points || 0);
      } else if (ev.source_type === 'SEO_ARTICLE') {
        totalSeoArticles += Number(ev.metric_value || 1);
      }
    }

    // Match policy tiers for employee's position
    const policy = await this.kysely.db
      .selectFrom('kpi_policies')
      .selectAll()
      .where('position_id', '=', emp.position_id)
      .executeTakeFirst();

    let matchedTier = null;
    let rewardBonus = 0;

    if (policy) {
      const tiers = await this.kysely.db
        .selectFrom('kpi_policy_tiers')
        .selectAll()
        .where('kpi_policy_id', '=', policy.id)
        .orderBy('min_threshold', 'asc')
        .execute();

      const metricVal =
        policy.metric_type === 'CASH_REVENUE'
          ? totalEligibleRevenue
          : policy.metric_type === 'SEO_ARTICLE_COUNT'
          ? totalSeoArticles
          : totalKpiPoints;

      for (const t of tiers) {
        const min = Number(t.min_threshold);
        const max = t.max_threshold ? Number(t.max_threshold) : Infinity;

        if (metricVal >= min && metricVal < max) {
          matchedTier = t;
          rewardBonus = Number(t.reward_amount);
          break;
        } else if (metricVal >= min && !t.max_threshold) {
          matchedTier = t;
          rewardBonus = Number(t.reward_amount);
        }
      }
    }

    return {
      employeeId,
      employeeName: emp.full_name,
      period: targetPeriod,
      totalEligibleRevenue,
      totalKpiPoints,
      totalSeoArticles,
      matchedTier,
      rewardBonus,
      eventCount: events.length,
    };
  }
}
