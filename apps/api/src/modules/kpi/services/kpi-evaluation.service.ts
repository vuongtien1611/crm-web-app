import { Injectable, Logger } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../../database/kysely.service';

@Injectable()
export class KpiEvaluationService {
  private readonly logger = new Logger(KpiEvaluationService.name);

  constructor(private readonly kysely: KyselyService) {}

  /**
   * Helper to compute target KPI period YYYY-MM
   */
  private computeKpiPeriod(date: Date, offsetMonths = 0): string {
    const d = new Date(date);
    d.setMonth(d.getMonth() + offsetMonths);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Sale KPI evaluation on confirmed Payment Allocation
   */
  async evaluatePaymentAllocationKpi(trx: CrmTransaction, allocationId: string, actorEmployeeId: string) {
    const alloc = await trx
      .selectFrom('payment_allocations')
      .innerJoin('payments', 'payments.id', 'payment_allocations.payment_id')
      .where('payment_allocations.id', '=', allocationId)
      .select([
        'payment_allocations.id',
        'payment_allocations.closing_sale_id',
        'payment_allocations.net_eligible_amount',
        'payment_allocations.confirmed_at',
        'payments.status as payment_status',
      ])
      .executeTakeFirst();

    if (!alloc || alloc.payment_status !== 'CONFIRMED') return;

    // Find Sale KPI policy
    const saleEmployee = await trx
      .selectFrom('employees')
      .selectAll()
      .where('id', '=', alloc.closing_sale_id)
      .executeTakeFirst();

    if (!saleEmployee) return;

    const policy = await trx
      .selectFrom('kpi_policies')
      .selectAll()
      .where('position_id', '=', saleEmployee.position_id)
      .where('metric_type', '=', 'CASH_REVENUE')
      .executeTakeFirst();

    if (!policy) return;

    const netEligible = Number(alloc.net_eligible_amount);
    const period = this.computeKpiPeriod(alloc.confirmed_at || new Date());

    // Idempotent insert into kpi_events
    try {
      await trx
        .insertInto('kpi_events')
        .values({
          employee_id: alloc.closing_sale_id,
          policy_id: policy.id,
          source_type: 'PAYMENT_ALLOCATION',
          source_id: alloc.id,
          metric_type: 'CASH_REVENUE',
          metric_value: netEligible as any,
          eligible_revenue: netEligible as any,
          target_kpi_period: period,
          qualified_at: alloc.confirmed_at || new Date(),
        })
        .onConflict((oc: any) =>
          oc.columns(['employee_id', 'policy_id', 'source_type', 'source_id', 'metric_type']).doNothing(),
        )
        .execute();
    } catch (err: any) {
      // Unique constraint unique_kpi_event_idempotency handles duplicate event protection
      this.logger.debug(`KPI Event already exists for allocation #${allocationId}: ${err.message}`);
    }
  }

  /**
   * Dev KPI evaluation on Project Acceptance
   */
  async evaluateProjectAcceptanceKpi(trx: CrmTransaction, projectId: string, actorEmployeeId: string) {
    const project = await trx
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', projectId)
      .executeTakeFirst();

    if (!project) return;

    const acceptance = await trx
      .selectFrom('project_acceptances')
      .selectAll()
      .where('project_id', '=', project.id)
      .executeTakeFirst();

    if (!acceptance) return;

    const orderItem = await trx
      .selectFrom('order_items')
      .selectAll()
      .where('id', '=', project.order_item_id)
      .executeTakeFirst();

    if (!orderItem) return;

    const netValue = Number(orderItem.net_service_value);
    const acceptedAt = new Date(acceptance.accepted_at || (acceptance as any).created_at);
    const dayOfMonth = acceptedAt.getDate();

    // Map contract price to points (Frozen known weights)
    let points = 0;
    let isPriceGap = false;

    if (netValue >= 5000000 && netValue <= 7000000) {
      points = 1;
    } else if (netValue >= 10000000 && netValue <= 15000000) {
      points = 2;
    } else if (netValue >= 19500000 && netValue <= 20500000) {
      points = 3;
    } else {
      isPriceGap = true;
      points = 0; // OPEN RULE: Price gap not covered by frozen rule is NOT silently assigned points
    }

    // Determine target_kpi_period (Day 28 targeting rule)
    let targetPeriod = this.computeKpiPeriod(acceptedAt, 0);
    if (dayOfMonth >= 28) {
      if (netValue >= 10000000) {
        targetPeriod = this.computeKpiPeriod(acceptedAt, 1);
      }
    }

    // Reconstruct PRIMARY assignments AT ACCEPTANCE TIME using temporal range check (assigned_at / unassigned_at)
    const candidateAssignments = await trx
      .selectFrom('project_assignments')
      .selectAll()
      .where('project_id', '=', project.id as any)
      .where('assignment_type', '=', 'PRIMARY')
      .where('assigned_at', '<=', acceptedAt)
      .execute();

    const activePrimaryAtAcceptance = candidateAssignments.filter((a: any) => {
      if (!a.unassigned_at) return true;
      return new Date(a.unassigned_at) > acceptedAt;
    });

    for (const assignment of activePrimaryAtAcceptance) {
      const devEmployee = await trx
        .selectFrom('employees')
        .selectAll()
        .where('id', '=', assignment.employee_id)
        .executeTakeFirst();

      if (!devEmployee) continue;

      const policy = await trx
        .selectFrom('kpi_policies')
        .selectAll()
        .where('position_id', '=', devEmployee.position_id)
        .where('metric_type', '=', 'PROJECT_DELIVERY')
        .executeTakeFirst();

      if (!policy) continue;

      try {
        await trx
          .insertInto('kpi_events')
          .values({
            employee_id: assignment.employee_id,
            policy_id: policy.id,
            source_type: 'PROJECT_ACCEPTANCE',
            source_id: project.id,
            metric_type: isPriceGap ? 'OPEN_RULE_PRICE_GAP' : 'KPI_POINTS',
            metric_value: isPriceGap ? 0 : points,
            kpi_points: isPriceGap ? 0 : points,
            target_kpi_period: targetPeriod,
            qualified_at: acceptedAt,
          })
          .onConflict((oc: any) =>
            oc.columns(['employee_id', 'policy_id', 'source_type', 'source_id', 'metric_type']).doNothing(),
          )
          .execute();
      } catch (err: any) {
        this.logger.debug(`KPI Event already exists for project #${projectId}: ${err.message}`);
      }
    }
  }

  /**
   * SEO KPI evaluation on SEO Article
   */
  async evaluateSeoArticleKpi(trx: CrmTransaction, articleId: string, actorEmployeeId: string) {
    const article = await trx
      .selectFrom('seo_articles')
      .selectAll()
      .where('id', '=', articleId)
      .executeTakeFirst();

    if (!article) return;

    const isValidUnit =
      (article.status === 'APPROVED' || article.status === 'PUBLISHED') &&
      !!article.keyword &&
      !!article.url &&
      !article.deleted_at;

    if (!isValidUnit) return;

    const seoEmployee = await trx
      .selectFrom('employees')
      .selectAll()
      .where('id', '=', article.author_employee_id)
      .executeTakeFirst();

    if (!seoEmployee) return;

    const policy = await trx
      .selectFrom('kpi_policies')
      .selectAll()
      .where('position_id', '=', seoEmployee.position_id)
      .where('metric_type', '=', 'SEO_ARTICLE_COUNT')
      .executeTakeFirst();

    if (!policy) return;

    const period = this.computeKpiPeriod(article.reviewed_at || article.updated_at || new Date());

    try {
      await trx
        .insertInto('kpi_events')
        .values({
          employee_id: article.author_employee_id,
          policy_id: policy.id,
          source_type: 'SEO_ARTICLE',
          source_id: article.id,
          metric_type: 'SEO_ARTICLE_COUNT',
          metric_value: 1,
          kpi_points: 1,
          target_kpi_period: period,
          qualified_at: article.reviewed_at || new Date(),
        })
        .onConflict((oc: any) =>
          oc.columns(['employee_id', 'policy_id', 'source_type', 'source_id', 'metric_type']).doNothing(),
        )
        .execute();
    } catch (err: any) {
      this.logger.debug(`KPI Event already exists for SEO article #${articleId}: ${err.message}`);
    }
  }
}
