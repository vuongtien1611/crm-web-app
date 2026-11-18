import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../../database/kysely.service';
import { CommissionPolicyMatcherService } from './commission-policy-matcher.service';

@Injectable()
export class CommissionEligibilityService {
  private readonly logger = new Logger(CommissionEligibilityService.name);

  constructor(
    private readonly kysely: KyselyService,
    private readonly policyMatcher: CommissionPolicyMatcherService,
  ) {}

  /**
   * Re-evaluates commission eligibility for an OrderItem inside database transaction `trx`.
   * Downstream caller is responsible for transaction scope.
   */
  async evaluateOrderItemCommissions(trx: CrmTransaction, orderItemId: string, actorEmployeeId?: string) {
    const item = await trx
      .selectFrom('order_items')
      .selectAll()
      .where('id', '=', orderItemId)
      .executeTakeFirst();

    if (!item) return;

    // Fetch linked Project & Customer Acceptance
    const project = await trx
      .selectFrom('projects')
      .selectAll()
      .where('order_item_id', '=', item.id)
      .executeTakeFirst();

    const acceptance = project
      ? await trx
          .selectFrom('project_acceptances')
          .selectAll()
          .where('project_id', '=', project.id)
          .executeTakeFirst()
      : null;

    const isDeliveryCompleted = !!acceptance || item.delivery_status === 'COMPLETED';
    const isFullyPaid = item.payment_status === 'FULLY_PAID';

    // --------------------------------------------------
    // 1. SALE COMMISSION
    // --------------------------------------------------
    if (item.closing_sale_id) {
      const saleEmployee = await trx
        .selectFrom('employees')
        .selectAll()
        .where('id', '=', item.closing_sale_id)
        .executeTakeFirst();

      if (saleEmployee) {
        let policy: any = null;
        try {
          policy = await this.policyMatcher.matchPolicy(
            {
              policyType: 'SALE',
              positionId: saleEmployee.position_id,
              serviceId: item.service_id,
            },
            trx,
          );
        } catch (err: any) {
          if (err instanceof NotFoundException) {
            this.logger.debug(`No matching SALE commission policy for employee ${item.closing_sale_id}, position ${saleEmployee.position_id}`);
            policy = null;
          } else {
            throw err;
          }
        }

        if (policy) {
          const rate = Number(policy.rate);
          const base = Number(item.net_service_value);
          const calculatedAmount = Number((base * rate).toFixed(2));

          const targetStatus = isDeliveryCompleted && isFullyPaid ? 'RELEASED' : 'UNEARNED';

          const existingComm = await trx
            .selectFrom('commissions')
            .selectAll()
            .where('order_item_id', '=', item.id)
            .where('beneficiary_employee_id', '=', item.closing_sale_id)
            .where('commission_type', '=', 'SALE')
            .executeTakeFirst();

          if (existingComm) {
            if (existingComm.status === 'UNEARNED' && targetStatus === 'RELEASED') {
              await trx
                .updateTable('commissions')
                .set({
                  status: 'RELEASED',
                  updated_at: new Date(),
                })
                .where('id', '=', existingComm.id)
                .execute();
            }
          } else {
            await trx
              .insertInto('commissions')
              .values({
                policy_id: policy.id,
                order_item_id: item.id,
                beneficiary_employee_id: item.closing_sale_id,
                commission_type: 'SALE',
                rate_snapshot: rate as any,
                commission_base: base as any,
                calculated_amount: calculatedAmount as any,
                status: targetStatus,
              })
              .execute();
          }
        }
      }
    }

    // --------------------------------------------------
    // 2. TECHNICAL / PROJECT DELIVERY COMMISSION
    // --------------------------------------------------
    if (project && isDeliveryCompleted && acceptance) {
      const acceptedAt = new Date(acceptance.accepted_at || (acceptance as any).created_at);

      // Reconstruct PRIMARY assignments AT ACCEPTANCE TIME using temporal range check (assigned_at / unassigned_at)
      const candidateAssignments = await trx
        .selectFrom('project_assignments')
        .selectAll()
        .where('project_id', '=', project.id)
        .where('assignment_type', '=', 'PRIMARY')
        .where('assigned_at', '<=', acceptedAt)
        .execute();

      const activePrimaryAtAcceptance = candidateAssignments.filter((a: any) => {
        if (!a.unassigned_at) return true;
        return new Date(a.unassigned_at) > acceptedAt;
      });

      const primaryCount = activePrimaryAtAcceptance.length;

      if (primaryCount > 0) {
        const targetTechStatus = isFullyPaid ? 'CALCULATED' : 'UNEARNED';

        for (const assignment of activePrimaryAtAcceptance) {
          const devEmployee = await trx
            .selectFrom('employees')
            .selectAll()
            .where('id', '=', assignment.employee_id)
            .executeTakeFirst();

          if (!devEmployee) continue;

          let policy: any = null;
          try {
            policy = await this.policyMatcher.matchPolicy(
              {
                policyType: 'PROJECT_DELIVERY',
                positionId: devEmployee.position_id,
                serviceId: item.service_id,
                assigneeCount: primaryCount,
              },
              trx,
            );
          } catch (err: any) {
            if (err instanceof NotFoundException) {
              this.logger.debug(`No matching PROJECT_DELIVERY commission policy for employee ${assignment.employee_id}, position ${devEmployee.position_id}`);
              policy = null;
            } else {
              throw err;
            }
          }

          if (policy) {
            const rate = Number(policy.rate);
            const base = Number(item.net_service_value);
            const calculatedAmount = Number((base * rate).toFixed(2));

            const existingTechComm = await trx
              .selectFrom('commissions')
              .selectAll()
              .where('order_item_id', '=', item.id)
              .where('beneficiary_employee_id', '=', assignment.employee_id)
              .where('commission_type', '=', 'PROJECT_DELIVERY')
              .executeTakeFirst();

            if (existingTechComm) {
              if (existingTechComm.status === 'UNEARNED' && targetTechStatus === 'CALCULATED') {
                await trx
                  .updateTable('commissions')
                  .set({
                    status: 'CALCULATED',
                    updated_at: new Date(),
                  })
                  .where('id', '=', existingTechComm.id)
                  .execute();
              }
            } else {
              await trx
                .insertInto('commissions')
                .values({
                  policy_id: policy.id,
                  order_item_id: item.id,
                  beneficiary_employee_id: assignment.employee_id,
                  commission_type: 'PROJECT_DELIVERY',
                  rate_snapshot: rate as any,
                  commission_base: base as any,
                  calculated_amount: calculatedAmount as any,
                  status: targetTechStatus,
                })
                .execute();
            }
          }
        }
      }
    }
  }

  /**
   * Calculates Team Leader Override aggregated cash basis for a given leader.
   * Uses temporal team leadership & membership at payment_allocations.confirmed_at time.
   */
  async calculateTeamLeaderOverride(leaderEmployeeId: string, startDate?: Date, endDate?: Date) {
    const db = this.kysely.db;

    // Canonical Rule: Only SALES_TEAM_LEADER receives 2% team override. Dev and SEO leaders receive 0%.
    const leaderPos = await db
      .selectFrom('employees')
      .innerJoin('positions', 'positions.id', 'employees.position_id')
      .select('positions.code as position_code')
      .where('employees.id', '=', leaderEmployeeId as any)
      .executeTakeFirst();

    if (leaderPos?.position_code !== 'SALES_TEAM_LEADER') {
      return { totalOverride: 0, allocations: [] };
    }

    const leaderMembership = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('employee_id', '=', leaderEmployeeId as any)
      .where('is_leader', '=', true)
      .executeTakeFirst();

    if (!leaderMembership) return { totalOverride: 0, allocations: [] };

    const members = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('team_id', '=', leaderMembership.team_id)
      .where('employee_id', '!=', leaderEmployeeId as any)
      .execute();

    const memberIds = members.map((m) => m.employee_id);
    if (memberIds.length === 0) return { totalOverride: 0, allocations: [] };

    let allocQuery = db
      .selectFrom('payment_allocations')
      .innerJoin('payments', 'payments.id', 'payment_allocations.payment_id')
      .where('payment_allocations.closing_sale_id', 'in', memberIds as any[])
      .where('payments.status', '=', 'CONFIRMED');

    if (startDate) {
      allocQuery = allocQuery.where('payment_allocations.confirmed_at', '>=', startDate);
    }
    if (endDate) {
      allocQuery = allocQuery.where('payment_allocations.confirmed_at', '<=', endDate);
    }

    const allocations = await allocQuery
      .select([
        'payment_allocations.id',
        'payment_allocations.closing_sale_id',
        'payment_allocations.net_eligible_amount',
        'payment_allocations.confirmed_at',
      ])
      .execute();

    const rate = 0.02; // 2% frozen rate
    let totalOverride = 0;

    const items = allocations.map((a) => {
      const netEligible = Number(a.net_eligible_amount);
      const overrideAmt = Number((netEligible * rate).toFixed(2));
      totalOverride += overrideAmt;

      return {
        allocationId: String(a.id),
        closingSaleId: String(a.closing_sale_id),
        netEligibleAmount: netEligible,
        overrideAmount: overrideAmt,
        confirmedAt: a.confirmed_at,
      };
    });

    return {
      totalOverride,
      allocations: items,
    };
  }
}
