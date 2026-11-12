import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../database/kysely.service';
import { CommissionPolicyMatcherService } from '../commissions/services/commission-policy-matcher.service';
import { sql, RawBuilder } from 'kysely';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';

export interface CreateSubscriptionDto {
  orderItemId: string;
  billingInterval?: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  intervalCount?: number;
  startDate?: Date;
  endDate?: Date;
  autoRenew?: boolean;
}

export interface RecordPeriodAcceptanceDto {
  customerContactId: string;
  acceptedByName: string;
  evidenceDocument: string;
}

export interface ReplaceAssigneeDto {
  oldEmployeeId: string;
  newEmployeeId: string;
  reason?: string;
}

import { NotificationsService } from '../notifications/notifications.service';

interface SubscriptionInstallmentRow {
  id: string | number;
  installment_number: number;
  service_period_id: string | number | null;
  due_date: string;
  gross_amount_due: number | string;
  status: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly kysely: KyselyService,
    private readonly policyMatcher: CommissionPolicyMatcherService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * RECURRING-01 & RECURRING-02:
   * Creates a Subscription from an eligible (APPROVED) OrderItem.
   * Rejects non-approved / draft / cancelled order items.
   */
  async createSubscription(dto: CreateSubscriptionDto, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom('order_items as oi')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .select([
          'oi.id',
          'oi.order_id',
          'oi.service_id',
          'oi.approval_status as item_approval_status',
          'oi.net_service_value',
          'oi.vat_amount',
          'o.workflow_status as order_workflow_status',
        ])
        .where('oi.id', '=', dto.orderItemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem #${dto.orderItemId} not found`);
      }

      // Check eligibility: Order & OrderItem must be APPROVED (or Active)
      const isEligible =
        item.item_approval_status === 'APPROVED' ||
        ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(item.order_workflow_status);

      if (!isEligible) {
        throw new BadRequestException(
          `Cannot create Subscription for non-approved OrderItem #${dto.orderItemId} (Item: ${item.item_approval_status}, Order: ${item.order_workflow_status})`,
        );
      }

      // Check if Subscription already exists for this OrderItem
      const existingSub = await trx
        .selectFrom('subscriptions')
        .selectAll()
        .where('order_item_id', '=', item.id)
        .executeTakeFirst();

      if (existingSub) {
        return existingSub;
      }

      const billingInterval = dto.billingInterval || 'MONTH';
      const intervalCount = dto.intervalCount || 1;
      const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
      const autoRenew = dto.autoRenew ?? true;

      const [sub] = await trx
        .insertInto('subscriptions')
        .values({
          order_item_id: item.id,
          service_id: item.service_id,
          billing_interval: billingInterval,
          interval_count: intervalCount,
          start_date: startDate as any,
          end_date: dto.endDate ? (new Date(dto.endDate) as any) : null,
          auto_renew: autoRenew,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      return sub;
    });
  }

  /**
   * RECURRING-03, 04, 05, 06, 20:
   * Generates deterministic ServicePeriods for a Subscription.
   * Handles MONTH, QUARTER, YEAR, CUSTOM intervals.
   * Idempotent & blocks CANCELLED subscriptions.
   */
  async generateServicePeriods(subscriptionId: string, count: number = 1) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const sub = await trx
        .selectFrom('subscriptions as s')
        .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
        .select([
          's.id',
          's.billing_interval',
          's.interval_count',
          's.start_date',
          's.status',
          'oi.net_service_value',
          'oi.vat_amount',
        ])
        .where('s.id', '=', subscriptionId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!sub) {
        throw new NotFoundException(`Subscription #${subscriptionId} not found`);
      }

      if (sub.status === 'CANCELLED') {
        throw new BadRequestException(`Cannot generate service periods for CANCELLED subscription #${subscriptionId}`);
      }

      const generatedPeriods = [];

      for (let i = 1; i <= count; i++) {
        const periodIndex = i;

        // Calculate period start and end dates based on interval
        const pStartDate = new Date(sub.start_date);
        let monthsToAdd = 0;
        switch (sub.billing_interval) {
          case 'MONTH':
            monthsToAdd = (periodIndex - 1) * sub.interval_count;
            break;
          case 'QUARTER':
            monthsToAdd = (periodIndex - 1) * 3 * sub.interval_count;
            break;
          case 'YEAR':
            monthsToAdd = (periodIndex - 1) * 12 * sub.interval_count;
            break;
          case 'CUSTOM':
            monthsToAdd = (periodIndex - 1) * sub.interval_count;
            break;
        }

        pStartDate.setMonth(pStartDate.getMonth() + monthsToAdd);

        const pEndDate = new Date(pStartDate);
        let durationMonths = 1;
        switch (sub.billing_interval) {
          case 'MONTH':
            durationMonths = sub.interval_count;
            break;
          case 'QUARTER':
            durationMonths = 3 * sub.interval_count;
            break;
          case 'YEAR':
            durationMonths = 12 * sub.interval_count;
            break;
          case 'CUSTOM':
            durationMonths = sub.interval_count;
            break;
        }

        pEndDate.setMonth(pEndDate.getMonth() + durationMonths);
        pEndDate.setDate(pEndDate.getDate() - 1);

        const netVal = Number(sub.net_service_value || 0);
        const vatAmt = Number(sub.vat_amount || 0);
        const grossPay = netVal + vatAmt;

        // Insert period handling UNIQUE(subscription_id, period_index) idempotently
        const inserted = await trx
          .insertInto('service_periods')
          .values({
            subscription_id: sub.id,
            period_index: periodIndex,
            period_net_value: netVal as any,
            vat_rate: 0 as any,
            vat_amount: vatAmt as any,
            gross_payable: grossPay as any,
            start_date: pStartDate as any,
            end_date: pEndDate as any,
            execution_status: 'PENDING',
            payment_status: 'PENDING',
          })
          .onConflict((oc) =>
            oc.columns(['subscription_id', 'period_index']).doNothing(),
          )
          .returningAll()
          .executeTakeFirst();

        if (inserted) {
          generatedPeriods.push(inserted);
        } else {
          // Fetch existing if skipped by onConflict
          const existing = await trx
            .selectFrom('service_periods')
            .selectAll()
            .where('subscription_id', '=', sub.id)
            .where('period_index', '=', periodIndex)
            .executeTakeFirst();
          if (existing) generatedPeriods.push(existing);
        }
      }

      return generatedPeriods;
    });
  }

  /**
   * RECURRING-07:
   * Assigns an employee to a ServicePeriod.
   * Normal ASSIGN 3rd PRIMARY => BLOCKED.
   * Explicit REPLACE action => closes old PRIMARY, creates new PRIMARY.
   */
  async assignServicePeriod(
    periodId: string,
    employeeId: string,
    assignmentType: 'PRIMARY' | 'SUPPORT' = 'PRIMARY',
    reason?: string,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('service_periods')
        .selectAll()
        .where('id', '=', periodId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new NotFoundException(`ServicePeriod #${periodId} not found`);
      }

      if (assignmentType === 'PRIMARY') {
        const activePrimaries = await trx
          .selectFrom('service_period_assignments')
          .selectAll()
          .where('service_period_id', '=', period.id)
          .where('assignment_type', '=', 'PRIMARY')
          .where('is_active', '=', true)
          .execute();

        if (activePrimaries.length >= 2) {
          throw new BadRequestException(
            `Max 2 active primary assignees allowed per service period. Use replaceServicePeriodAssignee to replace an existing primary assignee.`,
          );
        }
      }

      const [assignment] = await trx
        .insertInto('service_period_assignments')
        .values({
          service_period_id: period.id,
          employee_id: employeeId as any,
          assignment_type: assignmentType,
          is_active: true,
          assigned_at: new Date(),
          replacement_reason: reason || null,
        })
        .returningAll()
        .execute();

      if (this.notificationsService) {
        await this.notificationsService.createNotification(
          {
            employeeId,
            eventType: 'SUBSCRIPTION_PERIOD_ASSIGNED',
            title: 'Phân công kỳ dịch vụ (Subscription)',
            content: `Bạn được phân công (${assignmentType}) cho kỳ dịch vụ #${period.period_number} của hợp đồng.`,
            deepLinkUrl: `/subscriptions/${period.subscription_id}`,
            entityType: 'SUBSCRIPTION_PERIOD',
            entityId: String(period.id),
          },
          trx,
        );
      }

      return assignment;
    });
  }

  /**
   * RECURRING-07 (REPLACE ACTION):
   * Replaces an existing PRIMARY assignee on a ServicePeriod.
   * Closes historical assignment and creates new active assignment.
   */
  async replaceServicePeriodAssignee(periodId: string, dto: ReplaceAssigneeDto) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const oldAssignment = await trx
        .selectFrom('service_period_assignments')
        .selectAll()
        .where('service_period_id', '=', periodId as any)
        .where('employee_id', '=', dto.oldEmployeeId as any)
        .where('is_active', '=', true)
        .executeTakeFirst();

      if (!oldAssignment) {
        throw new NotFoundException(`Active primary assignment for employee #${dto.oldEmployeeId} not found on service period #${periodId}`);
      }

      // Close old assignment
      await trx
        .updateTable('service_period_assignments')
        .set({
          is_active: false,
          unassigned_at: new Date(),
          replacement_reason: dto.reason || 'Replaced via explicit replacement action',
        })
        .where('id', '=', oldAssignment.id)
        .execute();

      // Insert new assignment
      const [newAssignment] = await trx
        .insertInto('service_period_assignments')
        .values({
          service_period_id: periodId as any,
          employee_id: dto.newEmployeeId as any,
          assignment_type: oldAssignment.assignment_type,
          is_active: true,
          assigned_at: new Date(),
          replacement_reason: dto.reason || null,
        })
        .returningAll()
        .execute();

      if (this.notificationsService) {
        await this.notificationsService.createNotification(
          {
            employeeId: dto.newEmployeeId,
            eventType: 'SUBSCRIPTION_PERIOD_ASSIGNED',
            title: 'Phân công kỳ dịch vụ thay thế (Subscription)',
            content: `Bạn được chỉ định thay thế phụ trách kỳ dịch vụ #${periodId}.`,
            deepLinkUrl: `/subscriptions`,
            entityType: 'SUBSCRIPTION_PERIOD',
            entityId: String(periodId),
          },
          trx,
        );
      }

      return newAssignment;
    });
  }

  /**
   * RECURRING-08:
   * Records Customer Period Acceptance into `service_period_acceptances`.
   * Updates `service_periods.execution_status` = 'ACCEPTED'.
   * Triggers recurring commission evaluation.
   */
  async recordServicePeriodAcceptance(
    periodId: string,
    dto: RecordPeriodAcceptanceDto,
    recordedByEmployeeId: string,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('service_periods')
        .selectAll()
        .where('id', '=', periodId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new NotFoundException(`ServicePeriod #${periodId} not found`);
      }

      // Check if acceptance already recorded
      let acceptance = await trx
        .selectFrom('service_period_acceptances')
        .selectAll()
        .where('service_period_id', '=', period.id)
        .executeTakeFirst();

      if (!acceptance) {
        const [newAcc] = await trx
          .insertInto('service_period_acceptances')
          .values({
            service_period_id: period.id,
            customer_contact_id: dto.customerContactId as any,
            accepted_by_name: dto.acceptedByName,
            evidence_document: dto.evidenceDocument,
            recorded_by_employee_id: recordedByEmployeeId as any,
            accepted_at: new Date(),
          })
          .returningAll()
          .execute();
        acceptance = newAcc;
      }

      await trx
        .updateTable('service_periods')
        .set({ execution_status: 'ACCEPTED' })
        .where('id', '=', period.id)
        .execute();

      // Trigger recurring commission evaluation
      await this.evaluateRecurringCommissions(trx, period.id);

      return acceptance;
    });
  }

  /**
   * RECURRING-09, 10, 11, 12, 13, 14, 15:
   * Helper to set ServicePeriod payment status from confirmed payment allocation context and evaluate commissions.
   */
  async recordServicePeriodPayment(
    periodId: string,
    paymentAllocationId?: string,
    isFullyPaid: boolean = true,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('service_periods')
        .selectAll()
        .where('id', '=', periodId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new NotFoundException(`ServicePeriod #${periodId} not found`);
      }

      if (paymentAllocationId) {
        const alloc = await trx
          .selectFrom('payment_allocations as pa')
          .innerJoin('payments as p', 'p.id', 'pa.payment_id')
          .select(['pa.id', 'p.status as payment_status'])
          .where('pa.id', '=', paymentAllocationId as any)
          .executeTakeFirst();

        if (!alloc || alloc.payment_status !== 'CONFIRMED') {
          throw new BadRequestException(
            `PaymentAllocation #${paymentAllocationId} is invalid or not linked to a CONFIRMED payment`,
          );
        }
      }

      const paymentStatus = isFullyPaid ? 'FULLY_PAID' : 'PARTIALLY_PAID';

      await trx
        .updateTable('service_periods')
        .set({ payment_status: paymentStatus })
        .where('id', '=', period.id)
        .execute();

      await this.evaluateRecurringCommissions(trx, period.id, paymentAllocationId);

      return { success: true, paymentStatus };
    });
  }

  /**
   * RECURRING-11, 12, 13, 14, 15:
   * Evaluates recurring commissions for a ServicePeriod.
   * Condition: MUST be BOTH execution_status = 'ACCEPTED' AND payment_status = 'FULLY_PAID'.
   */
  async evaluateRecurringCommissions(trx: CrmTransaction, periodId: string | number, paymentAllocationId?: string) {
    const period = await trx
      .selectFrom('service_periods as sp')
      .innerJoin('subscriptions as s', 's.id', 'sp.subscription_id')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
      .select([
        'sp.id',
        'sp.subscription_id',
        'sp.period_net_value',
        'sp.execution_status',
        'sp.payment_status',
        's.service_id',
        'oi.id as order_item_id',
        'oi.closing_sale_id',
      ])
      .where('sp.id', '=', periodId as any)
      .executeTakeFirst();

    if (!period) return;

    // Both ACCEPTED & FULLY_PAID required to release/calculate recurring commission
    if (period.execution_status !== 'ACCEPTED' || period.payment_status !== 'FULLY_PAID') {
      return;
    }

    // 1. SALE RECURRING COMMISSION
    if (period.closing_sale_id) {
      const saleEmployee = await trx
        .selectFrom('employees')
        .selectAll()
        .where('id', '=', period.closing_sale_id)
        .executeTakeFirst();

      if (saleEmployee) {
        const policy = await this.policyMatcher.matchPolicy(
          {
            policyType: 'SALE',
            positionId: saleEmployee.position_id,
            serviceId: period.service_id,
          },
          trx,
        );

        const rate = Number(policy.rate);
        const base = Number(period.period_net_value);
        const calculatedAmount = Number((base * rate).toFixed(2));

        const existingComm = await trx
          .selectFrom('commissions')
          .selectAll()
          .where('service_period_id', '=', period.id)
          .where('beneficiary_employee_id', '=', period.closing_sale_id)
          .where('commission_type', '=', 'SALE')
          .executeTakeFirst();

        let commId = existingComm?.id;

        if (!existingComm) {
          const [inserted] = await trx
            .insertInto('commissions')
            .values({
              policy_id: policy.id,
              service_period_id: period.id,
              beneficiary_employee_id: period.closing_sale_id,
              commission_type: 'SALE',
              rate_snapshot: rate as any,
              commission_base: base as any,
              calculated_amount: calculatedAmount as any,
              approved_amount: calculatedAmount as any,
              status: 'RELEASED', // Sale recurring commission is automatically RELEASED
            })
            .returningAll()
            .execute();
          commId = inserted.id;
        } else if (existingComm.status === 'UNEARNED') {
          await trx
            .updateTable('commissions')
            .set({ status: 'RELEASED', updated_at: new Date() })
            .where('id', '=', existingComm.id)
            .execute();
        }

        // Trace to commission_sources if paymentAllocationId is provided
        if (commId && paymentAllocationId) {
          const existingSource = await trx
            .selectFrom('commission_sources')
            .select('id')
            .where('commission_id', '=', commId)
            .where('payment_allocation_id', '=', paymentAllocationId as any)
            .executeTakeFirst();

          if (!existingSource) {
            try {
              await trx
                .insertInto('commission_sources')
                .values({
                  commission_id: commId,
                  payment_allocation_id: paymentAllocationId as any,
                  attributed_amount: calculatedAmount as any,
                })
                .execute();
            } catch (err: any) {
              if (err.code === '23505') {
                // Safely handle duplicate race condition
              } else {
                throw err;
              }
            }
          }
        }
      }
    }

    // 2. TECHNICAL RECURRING COMMISSION (PROJECT_DELIVERY)
    const acceptance = await trx
      .selectFrom('service_period_acceptances')
      .selectAll()
      .where('service_period_id', '=', period.id)
      .executeTakeFirst();

    if (acceptance) {
      const acceptedAt = new Date(acceptance.accepted_at);

      const candidateAssignments = await trx
        .selectFrom('service_period_assignments')
        .selectAll()
        .where('service_period_id', '=', period.id)
        .where('assignment_type', '=', 'PRIMARY')
        .where('assigned_at', '<=', acceptedAt)
        .execute();

      const activePrimaryAtAcceptance = candidateAssignments.filter((a: any) => {
        if (!a.unassigned_at) return true;
        return new Date(a.unassigned_at) > acceptedAt;
      });

      const primaryCount = activePrimaryAtAcceptance.length;

      if (primaryCount > 0) {
        for (const assignment of activePrimaryAtAcceptance) {
          const devEmployee = await trx
            .selectFrom('employees')
            .selectAll()
            .where('id', '=', assignment.employee_id)
            .executeTakeFirst();

          if (!devEmployee) continue;

          const policy = await this.policyMatcher.matchPolicy(
            {
              policyType: 'PROJECT_DELIVERY',
              positionId: devEmployee.position_id,
              serviceId: period.service_id,
              assigneeCount: primaryCount,
            },
            trx,
          );

          const rate = Number(policy.rate);
          const base = Number(period.period_net_value);
          const calculatedAmount = Number((base * rate).toFixed(2));

          const existingTechComm = await trx
            .selectFrom('commissions')
            .selectAll()
            .where('service_period_id', '=', period.id)
            .where('beneficiary_employee_id', '=', assignment.employee_id)
            .where('commission_type', '=', 'PROJECT_DELIVERY')
            .executeTakeFirst();

          let techCommId = existingTechComm?.id;

          if (!existingTechComm) {
            const [insertedTech] = await trx
              .insertInto('commissions')
              .values({
                policy_id: policy.id,
                service_period_id: period.id,
                beneficiary_employee_id: assignment.employee_id,
                commission_type: 'PROJECT_DELIVERY',
                rate_snapshot: rate as any,
                commission_base: base as any,
                calculated_amount: calculatedAmount as any,
                status: 'CALCULATED', // Technical commission becomes CALCULATED
              })
              .returningAll()
              .execute();
            techCommId = insertedTech.id;
          } else if (existingTechComm.status === 'UNEARNED') {
            await trx
              .updateTable('commissions')
              .set({ status: 'CALCULATED', updated_at: new Date() })
              .where('id', '=', existingTechComm.id)
              .execute();
          }

          if (techCommId && paymentAllocationId) {
            const existingTechSource = await trx
              .selectFrom('commission_sources')
              .select('id')
              .where('commission_id', '=', techCommId)
              .where('payment_allocation_id', '=', paymentAllocationId as any)
              .executeTakeFirst();

            if (!existingTechSource) {
              try {
                await trx
                  .insertInto('commission_sources')
                  .values({
                    commission_id: techCommId,
                    payment_allocation_id: paymentAllocationId as any,
                    attributed_amount: calculatedAmount as any,
                  })
                  .execute();
              } catch (err: any) {
                if (err.code !== '23505') throw err;
              }
            }
          }
        }
      }
    }
  }

  /**
   * RECURRING-16, 17, 18, 19:
   * Process Renewal Foundation.
   * If Account has Active Order -> appends new OrderItem to Active Order.
   * If Account has NO Active Order -> creates new DRAFT Order.
   * Mandatory invariant: Renewal NEVER bypasses Boss approval (new item / order created in DRAFT status).
   */
  async processSubscriptionRenewal(subscriptionId: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const sub = await trx
        .selectFrom('subscriptions as s')
        .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .select([
          's.id as subscription_id',
          's.service_id',
          's.billing_interval',
          's.interval_count',
          'oi.id as order_item_id',
          'oi.requirement_template_id',
          'oi.requirement_template_version',
          'oi.original_price',
          'oi.discount_amount',
          'oi.net_service_value',
          'oi.vat_amount',
          'oi.closing_sale_id',
          'o.account_id',
          'o.primary_contact_id',
        ])
        .where('s.id', '=', subscriptionId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!sub) {
        throw new NotFoundException(`Subscription #${subscriptionId} not found`);
      }

      // Check for active order under account
      const activeOrder = await trx
        .selectFrom('orders')
        .selectAll()
        .where('account_id', '=', sub.account_id)
        .where('workflow_status', 'in', ['APPROVED', 'IN_PROGRESS'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      let targetOrderId: bigint | string;
      let isNewOrder = false;

      if (activeOrder) {
        targetOrderId = activeOrder.id;
      } else {
        // Create new DRAFT order
        const orderCode = `ORD-RENEW-${Date.now()}`;
        const [newOrder] = await trx
          .insertInto('orders')
          .values({
            account_id: sub.account_id,
            primary_contact_id: sub.primary_contact_id,
            order_code: orderCode,
            workflow_status: 'DRAFT', // Never bypasses Boss approval
          })
          .returningAll()
          .execute();
        targetOrderId = newOrder.id;
        isNewOrder = true;
      }

      // Create new DRAFT order item for renewal
      const [newItem] = await trx
        .insertInto('order_items')
        .values({
          order_id: targetOrderId as any,
          service_id: sub.service_id,
          closing_sale_id: sub.closing_sale_id,
          requirement_template_id: sub.requirement_template_id,
          requirement_template_version: sub.requirement_template_version,
          original_price: sub.original_price,
          discount_amount: sub.discount_amount,
          net_service_value: sub.net_service_value,
          vat_amount: sub.vat_amount,
          approval_status: 'DRAFT', // Never bypasses Boss approval
          delivery_status: 'PENDING',
          payment_status: 'UNPAID',
        })
        .returningAll()
        .execute();

      return {
        subscriptionId: sub.subscription_id,
        orderId: targetOrderId,
        orderItemId: newItem.id,
        isNewOrder,
        workflowStatus: 'DRAFT',
      };
    });
  }

  /**
   * RECURRING-20:
   * Cancel a subscription.
   */
  async cancelSubscription(subscriptionId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const [sub] = await trx
        .updateTable('subscriptions')
        .set({ status: 'CANCELLED', updated_at: new Date() })
        .where('id', '=', subscriptionId as any)
        .returningAll()
        .execute();

      if (!sub) throw new NotFoundException(`Subscription #${subscriptionId} not found`);

      return sub;
    });
  }

  // ── Team and Scope Resolution for Phase J ──────────────────────────────
  async getCurrentLedTeams(employeeId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
      .selectAll('teams')
      .where('team_memberships.employee_id', '=', employeeId as any)
      .where('team_memberships.is_leader', '=', true)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();
  }

  async getCurrentTeamMembers(teamId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .selectAll('employees')
      .where('team_memberships.team_id', '=', teamId as any)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();
  }

  async resolveSubscriptionScope(user: any): Promise<{
    isGlobal: boolean;
    saleIds: string[];
    techMemberIds: string[];
    isAccountant: boolean;
    denyAll: boolean;
  }> {
    if (!user) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }
    const roles: string[] = user.roles || [];
    const permissions: string[] = user.permissions || [];
    const employeeId = user.employeeId ? String(user.employeeId) : undefined;

    // 1. ADMIN & BOSS (Global executive access)
    if (roles.includes('ADMIN') || roles.includes('BOSS')) {
      return { isGlobal: true, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: false };
    }

    if (!employeeId) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }

    const saleIds = new Set<string>();
    const techMemberIds = new Set<string>();
    let isAccountant = false;

    // 2. SALE: Own closed order items
    if (roles.includes('SALE')) {
      saleIds.add(employeeId);
    }

    // 3. TEAM LEADERS: Sales, Dev, SEO (Temporal membership @> NOW())
    const ledTeams = await this.getCurrentLedTeams(employeeId);
    for (const team of ledTeams) {
      const members = await this.getCurrentTeamMembers(team.id);
      const memberIds = members.map((m) => String(m.id));
      memberIds.push(employeeId);

      if (team.department === 'SALES' && roles.includes('SALES_TEAM_LEADER')) {
        for (const mid of memberIds) saleIds.add(mid);
      } else if (team.department === 'DEV' && roles.includes('DEV_TEAM_LEADER')) {
        for (const mid of memberIds) techMemberIds.add(mid);
      } else if (team.department === 'SEO' && roles.includes('SEO_TEAM_LEADER')) {
        for (const mid of memberIds) techMemberIds.add(mid);
      }
    }

    // 4. ACCOUNTANT: Bound to subscriptions with approved payment plans / installments
    if (roles.includes('ACCOUNTANT')) {
      isAccountant = true;
    }

    const hasAnyAccess =
      saleIds.size > 0 || techMemberIds.size > 0 || isAccountant;

    if (!hasAnyAccess) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }

    return {
      isGlobal: false,
      saleIds: Array.from(saleIds),
      techMemberIds: Array.from(techMemberIds),
      isAccountant,
      denyAll: false,
    };
  }

  private applyScopeFilter(baseQuery: any, scope: any) {
    if (scope.isGlobal) return baseQuery;
    if (scope.denyAll) return baseQuery.where(sql`1 = 0`);

    const conditions: RawBuilder<any>[] = [];

    // Sales filter: oi.closing_sale_id IN (...)
    if (scope.saleIds && scope.saleIds.length > 0) {
      conditions.push(sql`oi.closing_sale_id IN (${sql.join(scope.saleIds.map((id: string) => sql`${id}::bigint`))})`);
    }

    // Tech filter: Dev/SEO team members assigned to service periods or linked project
    if (scope.techMemberIds && scope.techMemberIds.length > 0) {
      const techIdsSql = sql.join(scope.techMemberIds.map((id: string) => sql`${id}::bigint`));
      conditions.push(
        sql`(
          EXISTS (
            SELECT 1 FROM service_periods sp
            JOIN service_period_assignments spa ON spa.service_period_id = sp.id
            WHERE sp.subscription_id = s.id
              AND spa.employee_id IN (${techIdsSql})
              AND spa.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM projects p
            JOIN project_assignments pa ON pa.project_id = p.id
            WHERE p.order_item_id = s.order_item_id
              AND pa.employee_id IN (${techIdsSql})
              AND pa.is_active = true
          )
        )`,
      );
    }

    // Accountant filter: Subscriptions having approved payment plan or payment allocations
    if (scope.isAccountant) {
      conditions.push(
        sql`(
          EXISTS (
            SELECT 1 FROM order_item_payment_plans oipp
            WHERE oipp.order_item_id = s.order_item_id
              AND oipp.status = 'APPROVED'
          )
          OR EXISTS (
            SELECT 1 FROM payment_installments pi
            JOIN payment_allocations pa ON pa.installment_id = pi.id
            WHERE pi.service_period_id IN (SELECT id FROM service_periods WHERE subscription_id = s.id)
          )
        )`,
      );
    }

    if (conditions.length === 0) {
      return baseQuery.where(sql`1 = 0`);
    }

    if (conditions.length === 1) {
      return baseQuery.where(conditions[0]);
    } else {
      const combined = conditions.reduce((prev, curr) => sql`${prev} OR ${curr}`);
      return baseQuery.where(sql`(${combined})`);
    }
  }

  /**
   * PHASE J: QUERY SUBSCRIPTIONS LIST (With search, filters, pagination, summary, and object authorization)
   */
  async findSubscriptions(query: QuerySubscriptionDto, user?: any) {
    const db = this.kysely.db;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const scope = await this.resolveSubscriptionScope(user);

    let baseQuery = db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as acc', 'acc.id', 'o.account_id')
      .innerJoin('services as srv', 'srv.id', 's.service_id')
      .leftJoin('contacts as ct', 'ct.id', 'o.primary_contact_id');

    // Apply Object Authorization Scope
    baseQuery = this.applyScopeFilter(baseQuery, scope);

    if (query.status) {
      baseQuery = baseQuery.where('s.status', '=', query.status as any);
    }
    if (query.billing_interval) {
      baseQuery = baseQuery.where('s.billing_interval', '=', query.billing_interval as any);
    }
    if (query.search) {
      const searchPattern = `%${query.search.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(sql`lower(acc.company_name)`, 'like', searchPattern),
          eb(sql`lower(srv.name)`, 'like', searchPattern),
          eb(sql`lower(o.order_code)`, 'like', searchPattern),
        ]),
      );
    }

    // Total count
    const countRes = await baseQuery
      .select((eb) => eb.fn.count('s.id').as('count'))
      .executeTakeFirst();
    const total = Number(countRes?.count || 0);

    // Rows
    const rows = await baseQuery
      .select([
        's.id',
        's.order_item_id',
        's.billing_interval',
        's.interval_count',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
        sql<string | null>`to_char(s.renewal_date, 'YYYY-MM-DD')`.as('renewal_date'),
        's.auto_renew',
        's.status',
        's.created_at',
        'oi.id as order_item_id',
        'oi.net_service_value',
        'o.id as order_id',
        'o.order_code',
        'acc.id as account_id',
        'acc.company_name',
        'acc.phone as account_phone',
        'acc.email as account_email',
        'srv.id as service_id',
        'srv.name as service_name',
        'srv.code as service_code',
        'ct.full_name as contact_name',
      ])
      .orderBy('s.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Summary aggregates (Scoped strictly to actor's authorized subscriptions)
    let summaryBase = db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id');

    summaryBase = this.applyScopeFilter(summaryBase, scope);

    const summaryRows = await summaryBase
      .select([
        's.status',
        (eb) => eb.fn.count('s.id').as('cnt'),
      ])
      .groupBy('s.status')
      .execute();

    const summary = {
      totalActive: 0,
      totalPaused: 0,
      totalExpired: 0,
      totalCancelled: 0,
      totalCount: 0,
    };
    for (const r of summaryRows) {
      const c = Number(r.cnt || 0);
      summary.totalCount += c;
      if (r.status === 'ACTIVE') summary.totalActive = c;
      else if (r.status === 'PAUSED') summary.totalPaused = c;
      else if (r.status === 'EXPIRED') summary.totalExpired = c;
      else if (r.status === 'CANCELLED') summary.totalCancelled = c;
    }

    // Enhance with periods for returned rows
    const subIds = rows.map((r) => r.id);
    const periodsMap = new Map<string, any[]>();
    if (subIds.length > 0) {
      const periods = await db
        .selectFrom('service_periods as sp')
        .select([
          'sp.id',
          'sp.subscription_id',
          'sp.period_index',
          sql<string>`to_char(sp.start_date, 'YYYY-MM-DD')`.as('start_date'),
          sql<string>`to_char(sp.end_date, 'YYYY-MM-DD')`.as('end_date'),
          'sp.execution_status',
          'sp.payment_status',
          'sp.gross_payable',
        ])
        .where('sp.subscription_id', 'in', subIds as any)
        .orderBy('sp.period_index', 'asc')
        .execute();

      for (const p of periods) {
        const sid = String(p.subscription_id);
        if (!periodsMap.has(sid)) periodsMap.set(sid, []);
        periodsMap.get(sid)!.push(p);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const data = rows.map((r) => {
      const pList = periodsMap.get(String(r.id)) || [];
      const totalPeriods = pList.length;

      // Find current period: period covering today, or latest period
      let currentPeriod = pList.find((p) => p.start_date <= todayStr && p.end_date >= todayStr);
      if (!currentPeriod && pList.length > 0) {
        currentPeriod = pList[pList.length - 1];
      }

      // Next period
      let nextPeriod = null;
      if (currentPeriod) {
        nextPeriod = pList.find((p) => p.period_index === currentPeriod.period_index + 1) || null;
      }

      return {
        id: String(r.id),
        orderItemId: String(r.order_item_id),
        orderId: String(r.order_id),
        orderCode: r.order_code,
        customer: {
          id: String(r.account_id),
          name: r.company_name,
          phone: r.account_phone,
          email: r.account_email,
          contactName: r.contact_name,
        },
        service: {
          id: String(r.service_id),
          name: r.service_name,
          code: r.service_code,
        },
        netServiceValue: Number(r.net_service_value || 0),
        billingInterval: r.billing_interval,
        intervalCount: Number(r.interval_count || 1),
        startDate: r.start_date,
        endDate: r.end_date,
        renewalDate: r.renewal_date,
        autoRenew: Boolean(r.auto_renew),
        status: r.status,
        totalPeriods,
        currentPeriod: currentPeriod
          ? {
              id: String(currentPeriod.id),
              periodIndex: Number(currentPeriod.period_index),
              startDate: currentPeriod.start_date,
              endDate: currentPeriod.end_date,
              executionStatus: currentPeriod.execution_status,
              paymentStatus: currentPeriod.payment_status,
              grossPayable: Number(currentPeriod.gross_payable || 0),
            }
          : null,
        nextPeriod: nextPeriod
          ? {
              id: String(nextPeriod.id),
              periodIndex: Number(nextPeriod.period_index),
              startDate: nextPeriod.start_date,
              endDate: nextPeriod.end_date,
            }
          : null,
        paymentStatus: currentPeriod ? currentPeriod.payment_status : 'PENDING',
        acceptanceStatus: currentPeriod ? currentPeriod.execution_status : 'PENDING',
        createdAt: r.created_at,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      summary,
    };
  }

  /**
   * PHASE J: GET SUBSCRIPTION BY ID (With all relations & backend object authorization)
   */
  async getSubscriptionById(id: string, user?: any) {
    const db = this.kysely.db;
    const scope = await this.resolveSubscriptionScope(user);

    const sub = await db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as acc', 'acc.id', 'o.account_id')
      .innerJoin('services as srv', 'srv.id', 's.service_id')
      .leftJoin('contacts as ct', 'ct.id', 'o.primary_contact_id')
      .leftJoin('employees as emp_sale', 'emp_sale.id', 'oi.closing_sale_id')
      .select([
        's.id',
        's.order_item_id',
        's.billing_interval',
        's.interval_count',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
        sql<string | null>`to_char(s.renewal_date, 'YYYY-MM-DD')`.as('renewal_date'),
        's.auto_renew',
        's.status',
        's.previous_subscription_id',
        's.created_at',
        's.updated_at',
        'oi.id as order_item_id',
        'oi.net_service_value',
        'oi.vat_amount',
        'oi.approval_status as item_approval_status',
        'oi.delivery_status as item_delivery_status',
        'oi.payment_status as item_payment_status',
        'o.id as order_id',
        'o.order_code',
        'o.workflow_status as order_workflow_status',
        'acc.id as account_id',
        'acc.company_name',
        'acc.tax_code',
        'acc.address as account_address',
        'acc.phone as account_phone',
        'acc.email as account_email',
        'acc.website as account_website',
        'srv.id as service_id',
        'srv.name as service_name',
        'srv.code as service_code',
        'ct.id as contact_id',
        'ct.full_name as contact_name',
        'ct.position as contact_position',
        'ct.phone as contact_phone',
        'ct.email as contact_email',
        'emp_sale.id as sale_id',
        'emp_sale.full_name as sale_name',
        'emp_sale.employee_code as sale_code',
      ])
      .where('s.id', '=', id as any)
      .executeTakeFirst();

    if (!sub) {
      throw new NotFoundException(`Subscription #${id} not found`);
    }

    // Check authorization if not global
    if (scope.denyAll) {
      throw new ForbiddenException('Bạn không có quyền truy cập hợp đồng định kỳ này');
    }

    let isTechOnlyViewer = false;

    if (!scope.isGlobal) {
      let authorizedViaSale = false;
      let authorizedViaTech = false;
      let authorizedViaAccountant = false;

      // Check sale scope
      if (scope.saleIds.length > 0 && sub.sale_id && scope.saleIds.includes(String(sub.sale_id))) {
        authorizedViaSale = true;
      }

      // Check tech scope (DEV / SEO)
      if (scope.techMemberIds.length > 0) {
        const hasPeriodAssignment = await db
          .selectFrom('service_periods as sp')
          .innerJoin('service_period_assignments as spa', 'spa.service_period_id', 'sp.id')
          .select('spa.id')
          .where('sp.subscription_id', '=', id as any)
          .where('spa.employee_id', 'in', scope.techMemberIds as any)
          .where('spa.is_active', '=', true)
          .executeTakeFirst();

        if (hasPeriodAssignment) {
          authorizedViaTech = true;
        } else {
          const hasPrjAssignment = await db
            .selectFrom('projects as p')
            .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
            .select('pa.id')
            .where('p.order_item_id', '=', sub.order_item_id as any)
            .where('pa.employee_id', 'in', scope.techMemberIds as any)
            .where('pa.is_active', '=', true)
            .executeTakeFirst();

          if (hasPrjAssignment) {
            authorizedViaTech = true;
          }
        }
      }

      // Check accountant scope
      if (scope.isAccountant) {
        const hasApprovedPlan = await db
          .selectFrom('order_item_payment_plans as oipp')
          .select('oipp.id')
          .where('oipp.order_item_id', '=', sub.order_item_id as any)
          .where('oipp.status', '=', 'APPROVED')
          .executeTakeFirst();

        if (hasApprovedPlan) {
          authorizedViaAccountant = true;
        } else {
          const hasAllocations = await db
            .selectFrom('payment_installments as pi')
            .innerJoin('payment_allocations as pa', 'pa.installment_id', 'pi.id')
            .innerJoin('service_periods as sp', 'sp.id', 'pi.service_period_id')
            .select('pa.id')
            .where('sp.subscription_id', '=', id as any)
            .executeTakeFirst();

          if (hasAllocations) {
            authorizedViaAccountant = true;
          }
        }
      }

      const authorized = authorizedViaSale || authorizedViaTech || authorizedViaAccountant;
      if (!authorized) {
        throw new ForbiddenException('Bạn không có quyền xem chi tiết hợp đồng định kỳ này');
      }

      if (authorizedViaTech && !authorizedViaSale && !authorizedViaAccountant) {
        isTechOnlyViewer = true;
      }
    }

    // Periods
    const periods = await db
      .selectFrom('service_periods as sp')
      .select([
        'sp.id',
        'sp.period_index',
        'sp.period_net_value',
        'sp.vat_rate',
        'sp.vat_amount',
        'sp.gross_payable',
        sql<string>`to_char(sp.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string>`to_char(sp.end_date, 'YYYY-MM-DD')`.as('end_date'),
        'sp.execution_status',
        'sp.payment_status',
        'sp.created_at',
      ])
      .where('sp.subscription_id', '=', id as any)
      .orderBy('sp.period_index', 'asc')
      .execute();

    const periodIds = periods.map((p) => p.id);

    // Assignments
    const assignmentsMap = new Map<string, any[]>();
    if (periodIds.length > 0) {
      const assignments = await db
        .selectFrom('service_period_assignments as spa')
        .innerJoin('employees as e', 'e.id', 'spa.employee_id')
        .select([
          'spa.id',
          'spa.service_period_id',
          'spa.employee_id',
          'spa.assignment_type',
          'spa.is_active',
          'spa.assigned_at',
          'spa.unassigned_at',
          'spa.replacement_reason',
          'e.employee_code',
          'e.full_name',
        ])
        .where('spa.service_period_id', 'in', periodIds as any)
        .orderBy('spa.assigned_at', 'desc')
        .execute();

      for (const a of assignments) {
        const pid = String(a.service_period_id);
        if (!assignmentsMap.has(pid)) assignmentsMap.set(pid, []);
        assignmentsMap.get(pid)!.push({
          id: String(a.id),
          employeeId: String(a.employee_id),
          employeeCode: a.employee_code,
          fullName: a.full_name,
          assignmentType: a.assignment_type,
          isActive: Boolean(a.is_active),
          assignedAt: a.assigned_at,
          unassignedAt: a.unassigned_at,
          replacementReason: a.replacement_reason,
        });
      }
    }

    // Acceptances
    const acceptancesMap = new Map<string, any>();
    if (periodIds.length > 0) {
      const acceptances = await db
        .selectFrom('service_period_acceptances as spa')
        .leftJoin('employees as rec_emp', 'rec_emp.id', 'spa.recorded_by_employee_id')
        .select([
          'spa.id',
          'spa.service_period_id',
          'spa.accepted_by_name',
          'spa.accepted_at',
          'spa.evidence_document',
          'rec_emp.full_name as recorded_by_employee_name',
        ])
        .where('spa.service_period_id', 'in', periodIds as any)
        .execute();

      for (const acc of acceptances) {
        acceptancesMap.set(String(acc.service_period_id), {
          id: String(acc.id),
          acceptedByName: acc.accepted_by_name,
          acceptedAt: acc.accepted_at,
          evidenceDocument: acc.evidence_document,
          recordedByEmployeeName: acc.recorded_by_employee_name,
        });
      }
    }

    // Linked Payment Plan & Installments (Redacted for Tech Leader Data Minimization)
    let paymentPlan: any = null;
    let installments: SubscriptionInstallmentRow[] = [];

    if (!isTechOnlyViewer) {
      paymentPlan = await db
        .selectFrom('order_item_payment_plans as oipp')
        .select([
          'oipp.id',
          'oipp.version',
          'oipp.status',
          'oipp.approved_at',
        ])
        .where('oipp.order_item_id', '=', sub.order_item_id as any)
        .where('oipp.status', '=', 'APPROVED')
        .executeTakeFirst();

      if (paymentPlan) {
        installments = await db
          .selectFrom('payment_installments as pi')
          .select([
            'pi.id',
            'pi.installment_number',
            'pi.service_period_id',
            sql<string>`to_char(pi.due_date, 'YYYY-MM-DD')`.as('due_date'),
            'pi.gross_amount_due',
            'pi.status',
          ])
          .where('pi.payment_plan_id', '=', paymentPlan.id as any)
          .orderBy('pi.installment_number', 'asc')
          .execute();
      }
    }

    // Linked Project
    const project = await db
      .selectFrom('projects as p')
      .select([
        'p.id',
        'p.project_name',
        'p.status',
        'p.materialized_progress_percent',
        'p.started_at',
        'p.completed_at',
      ])
      .where('p.order_item_id', '=', sub.order_item_id as any)
      .executeTakeFirst();

    // Renewal history
    const renewalHistory = await db
      .selectFrom('subscriptions as s')
      .select([
        's.id',
        's.status',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
      ])
      .where('s.previous_subscription_id', '=', id as any)
      .execute();

    return {
      id: String(sub.id),
      orderItemId: String(sub.order_item_id),
      orderId: String(sub.order_id),
      orderCode: sub.order_code,
      orderWorkflowStatus: sub.order_workflow_status,
      customer: {
        id: String(sub.account_id),
        name: sub.company_name,
        taxCode: sub.tax_code,
        address: sub.account_address,
        phone: sub.account_phone,
        email: sub.account_email,
        website: sub.account_website,
        contactName: sub.contact_name,
        contactPosition: sub.contact_position,
        contactPhone: sub.contact_phone,
        contactEmail: sub.contact_email,
      },
      service: {
        id: String(sub.service_id),
        name: sub.service_name,
        code: sub.service_code,
      },
      closingSale: sub.sale_id
        ? {
            id: String(sub.sale_id),
            fullName: sub.sale_name,
            employeeCode: sub.sale_code,
          }
        : null,
      netServiceValue: Number(sub.net_service_value || 0),
      vatAmount: Number(sub.vat_amount || 0),
      itemApprovalStatus: sub.item_approval_status,
      itemDeliveryStatus: sub.item_delivery_status,
      itemPaymentStatus: sub.item_payment_status,
      billingInterval: sub.billing_interval,
      intervalCount: Number(sub.interval_count || 1),
      startDate: sub.start_date,
      endDate: sub.end_date,
      renewalDate: sub.renewal_date,
      autoRenew: Boolean(sub.auto_renew),
      status: sub.status,
      previousSubscriptionId: sub.previous_subscription_id
        ? String(sub.previous_subscription_id)
        : null,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
      periods: periods.map((p) => ({
        id: String(p.id),
        periodIndex: Number(p.period_index),
        periodNetValue: Number(p.period_net_value),
        vatRate: Number(p.vat_rate),
        vatAmount: Number(p.vat_amount),
        grossPayable: Number(p.gross_payable),
        startDate: p.start_date,
        endDate: p.end_date,
        executionStatus: p.execution_status,
        paymentStatus: p.payment_status,
        createdAt: p.created_at,
        assignments: assignmentsMap.get(String(p.id)) || [],
        acceptance: acceptancesMap.get(String(p.id)) || null,
      })),
      paymentPlan: paymentPlan
        ? {
            id: String(paymentPlan.id),
            version: Number(paymentPlan.version),
            status: paymentPlan.status,
            approvedAt: paymentPlan.approved_at,
            installments: installments.map((ins) => ({
              id: String(ins.id),
              installmentNumber: Number(ins.installment_number),
              servicePeriodId: ins.service_period_id ? String(ins.service_period_id) : null,
              dueDate: ins.due_date,
              grossAmountDue: Number(ins.gross_amount_due),
              status: ins.status,
            })),
          }
        : null,
      linkedProject: project
        ? {
            id: String(project.id),
            projectName: project.project_name,
            status: project.status,
            progressPercent: Number(project.materialized_progress_percent),
            startedAt: project.started_at,
            completedAt: project.completed_at,
          }
        : null,
      renewalHistory: renewalHistory.map((rh) => ({
        id: String(rh.id),
        status: rh.status,
        startDate: rh.start_date,
        endDate: rh.end_date,
      })),
    };
  }
}
