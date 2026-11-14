import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../database/kysely.service';
import { CommissionPolicyMatcherService } from '../commissions/services/commission-policy-matcher.service';
import { sql, RawBuilder } from 'kysely';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';
import { SubscriptionQueryReader } from './subscription-query.reader';

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
    private readonly subscriptionReader: SubscriptionQueryReader,
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
        .innerJoin('services as srv', 'srv.id', 'oi.service_id')
        .select([
          'oi.id',
          'oi.order_id',
          'oi.service_id',
          'oi.approval_status as item_approval_status',
          'oi.net_service_value',
          'oi.vat_amount',
          'o.workflow_status as order_workflow_status',
          'srv.service_type',
        ])
        .where('oi.id', '=', dto.orderItemId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!item) {
        throw new NotFoundException(`OrderItem #${dto.orderItemId} not found`);
      }

      if (item.service_type !== 'RECURRING') {
        throw new BadRequestException(
          `Cannot create Subscription for non-recurring OrderItem #${dto.orderItemId}`,
        );
      }

      // Check eligibility: Order & OrderItem must be APPROVED (or Active)
      const isEligible =
        item.item_approval_status === 'APPROVED' &&
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
            content: `Bạn được phân công (${assignmentType}) cho kỳ dịch vụ #${period.period_index} của hợp đồng.`,
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
  async getCurrentLedTeams(employeeId: string | number) { return this.subscriptionReader.getCurrentLedTeams(employeeId); }

  async getCurrentTeamMembers(teamId: string | number) { return this.subscriptionReader.getCurrentTeamMembers(teamId); }

  async resolveSubscriptionScope(user: any) { return this.subscriptionReader.resolveSubscriptionScope(user); }

  async findEligibleOrderItems() { return this.subscriptionReader.findEligibleOrderItems(); }

  async findSubscriptions(query: QuerySubscriptionDto, user?: any) { return this.subscriptionReader.findSubscriptions(query, user); }

  async getSubscriptionById(id: string, user?: any) { return this.subscriptionReader.getSubscriptionById(id, user); }

}
