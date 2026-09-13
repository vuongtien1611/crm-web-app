import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { CreatePaymentDto, AllocationItemDto } from './dto/create-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
import { ProjectsService } from '../projects/projects.service';
import { CommissionEligibilityService } from '../commissions/services/commission-eligibility.service';
import { KpiEvaluationService } from '../kpi/services/kpi-evaluation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sql } from 'kysely';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly projectsService: ProjectsService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly commissionEligibilityService?: CommissionEligibilityService,
    @Optional() private readonly kpiEvaluationService?: KpiEvaluationService,
  ) {}

  // --------------------------------------------------
  // CREATE PAYMENT (ACCOUNTANT / BOSS)
  // Status starts at PENDING_CONFIRMATION
  // Does NOT alter installment paid amounts, items, or dependency unlocks
  // --------------------------------------------------
  async createPayment(dto: CreatePaymentDto, actorEmployeeId: string) {
    if (!dto.grossCashAmount || dto.grossCashAmount <= 0) {
      throw new BadRequestException('Gross cash amount must be greater than 0');
    }

    const code = dto.paymentCode || `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return await this.kysely.db.transaction().execute(async (trx) => {
      const [payment] = await trx
        .insertInto('payments')
        .values({
          payment_code: code,
          gross_cash_amount: dto.grossCashAmount as any,
          payment_method: dto.paymentMethod,
          evidence_url: dto.evidenceUrl || null,
          created_by_employee_id: actorEmployeeId as any,
          status: 'PENDING_CONFIRMATION',
        })
        .returningAll()
        .execute();

      await this.notificationsService.notifyRoles(
        ['BOSS', 'ADMIN'],
        {
          eventType: 'PAYMENT_PENDING_CONFIRMATION',
          title: `Thanh toán mới chờ xác nhận: ${payment.payment_code}`,
          content: `Thanh toán mã ${payment.payment_code} số tiền ${payment.gross_cash_amount} đang chờ Boss xác nhận`,
          deepLinkUrl: `/payments/${payment.id}`,
          entityType: 'payments',
          entityId: payment.id,
        },
        trx,
      );

      return payment;
    });
  }

  // --------------------------------------------------
  // CONFIRM PAYMENT (BOSS ONLY)
  // Atomic transaction with double-confirm prevention & lock ordering
  // --------------------------------------------------
  async confirmPayment(paymentId: string, dto: ConfirmPaymentDto, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      // 1. Lock Payment row FOR UPDATE
      const payment = await trx
        .selectFrom('payments')
        .selectAll()
        .where('id', '=', paymentId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!payment) {
        throw new NotFoundException(`Payment #${paymentId} not found`);
      }

      // Idempotency & Double confirmation protection
      if (payment.status !== 'PENDING_CONFIRMATION') {
        throw new BadRequestException(`Cannot confirm payment #${paymentId} with status ${payment.status}`);
      }

      // 2. Validate allocations
      const allocationsToApply: AllocationItemDto[] = dto.allocations || [];

      if (allocationsToApply.length > 0) {
        let totalAllocatedGross = 0;
        for (const alloc of allocationsToApply) {
          if (alloc.grossAllocatedAmount <= 0) {
            throw new BadRequestException('Allocation amount must be greater than 0');
          }
          totalAllocatedGross += Number(alloc.grossAllocatedAmount);
        }

        if (totalAllocatedGross > Number(payment.gross_cash_amount)) {
          throw new BadRequestException(
            `Sum of allocated amounts (${totalAllocatedGross}) exceeds payment gross cash amount (${payment.gross_cash_amount})`,
          );
        }
      }

      // 3. Lock affected installments in deterministic order (by id ASC) to prevent deadlocks
      const installmentIds = Array.from(new Set(allocationsToApply.map((a) => a.installmentId))).sort(
        (a, b) => Number(a) - Number(b),
      );

      let lockedInstallmentsMap: Record<string, any> = {};

      if (installmentIds.length > 0) {
        const lockedInstallments = await trx
          .selectFrom('payment_installments')
          .selectAll()
          .where('id', 'in', installmentIds as any[])
          .forUpdate()
          .execute();

        if (lockedInstallments.length !== installmentIds.length) {
          throw new BadRequestException('One or more target installments do not exist');
        }

        for (const inst of lockedInstallments) {
          lockedInstallmentsMap[String(inst.id)] = inst;
        }
      }

      const confirmedAt = new Date();

      // 4. Insert payment_allocations
      const affectedOrderItemIds = new Set<string>();
      const affectedServicePeriodIds = new Set<string>();
      const createdAllocations: any[] = [];

      for (const alloc of allocationsToApply) {
        const inst = lockedInstallmentsMap[String(alloc.installmentId)];
        if (!inst) continue;

        // Fetch OrderItem & closing_sale_id associated with payment_plan
        const plan = await trx
          .selectFrom('order_item_payment_plans')
          .selectAll()
          .where('id', '=', inst.payment_plan_id)
          .executeTakeFirstOrThrow();

        const orderItem = await trx
          .selectFrom('order_items')
          .selectAll()
          .where('id', '=', plan.order_item_id)
          .executeTakeFirstOrThrow();

        const closingSaleId = alloc.closingSaleId || orderItem.closing_sale_id || actorEmployeeId;

        const grossAlloc = Number(alloc.grossAllocatedAmount);
        const vatAlloc = alloc.vatAllocatedAmount !== undefined ? Number(alloc.vatAllocatedAmount) : 0;
        const serviceAmount = alloc.serviceAmount !== undefined ? Number(alloc.serviceAmount) : grossAlloc - vatAlloc;
        const netEligibleAmount = alloc.netEligibleAmount !== undefined ? Number(alloc.netEligibleAmount) : serviceAmount;

        const [createdAlloc] = await trx
          .insertInto('payment_allocations')
          .values({
            payment_id: payment.id,
            installment_id: inst.id,
            closing_sale_id: closingSaleId as any,
            gross_allocated_amount: grossAlloc as any,
            vat_allocated_amount: vatAlloc as any,
            service_amount: serviceAmount as any,
            net_eligible_amount: netEligibleAmount as any,
            confirmed_at: confirmedAt,
          })
          .returningAll()
          .execute();

        createdAllocations.push(createdAlloc);

        affectedOrderItemIds.add(String(plan.order_item_id));
        if (inst.service_period_id) {
          affectedServicePeriodIds.add(String(inst.service_period_id));
        }
      }

      // 5. Set Payment CONFIRMED
      const [updatedPayment] = await trx
        .updateTable('payments')
        .set({
          status: 'CONFIRMED',
          confirmed_by_employee_id: actorEmployeeId as any,
          confirmed_at: confirmedAt,
        })
        .where('id', '=', payment.id)
        .returningAll()
        .execute();

      // 5.1 Trigger KPI evaluation for allocations now that payment is CONFIRMED
      if (this.kpiEvaluationService) {
        for (const createdAlloc of createdAllocations) {
          await this.kpiEvaluationService.evaluatePaymentAllocationKpi(trx, String(createdAlloc.id), actorEmployeeId);
        }
      }

      // 6. Recompute status of affected payment_installments
      for (const instId of installmentIds) {
        const totalConfirmedAllocations = await trx
          .selectFrom('payment_allocations')
          .innerJoin('payments', 'payments.id', 'payment_allocations.payment_id')
          .where('payment_allocations.installment_id', '=', instId as any)
          .where('payments.status', '=', 'CONFIRMED')
          .select((eb) => eb.fn.sum<number>('payment_allocations.gross_allocated_amount').as('sumPaid'))
          .executeTakeFirst();

        const totalPaid = Number(totalConfirmedAllocations?.sumPaid || 0);
        const targetInst = lockedInstallmentsMap[instId];
        const grossDue = Number(targetInst.gross_amount_due);

        let newStatus = 'PENDING';
        if (totalPaid >= grossDue) {
          newStatus = 'PAID';
        } else if (totalPaid > 0) {
          newStatus = 'PARTIALLY_PAID';
        }

        await trx
          .updateTable('payment_installments')
          .set({ status: newStatus as any })
          .where('id', '=', instId as any)
          .execute();
      }

      // 7. Recompute status of affected service_periods
      for (const spId of Array.from(affectedServicePeriodIds)) {
        const periodInstallments = await trx
          .selectFrom('payment_installments')
          .selectAll()
          .where('service_period_id', '=', spId as any)
          .execute();

        if (periodInstallments.length > 0) {
          const allPaid = periodInstallments.every((i) => i.status === 'PAID');
          const anyPaidOrPartial = periodInstallments.some((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID');

          let spPaymentStatus = 'PENDING';
          if (allPaid) {
            spPaymentStatus = 'FULLY_PAID';
          } else if (anyPaidOrPartial) {
            spPaymentStatus = 'PARTIALLY_PAID';
          }

          await trx
            .updateTable('service_periods')
            .set({ payment_status: spPaymentStatus as any })
            .where('id', '=', spId as any)
            .execute();
        }
      }

      // 8. Recompute payment_status of affected order_items
      for (const orderItemId of Array.from(affectedOrderItemIds)) {
        const approvedPlan = await trx
          .selectFrom('order_item_payment_plans')
          .selectAll()
          .where('order_item_id', '=', orderItemId as any)
          .where('status', '=', 'APPROVED')
          .executeTakeFirst();

        if (approvedPlan) {
          const planInstallments = await trx
            .selectFrom('payment_installments')
            .selectAll()
            .where('payment_plan_id', '=', approvedPlan.id)
            .execute();

          if (planInstallments.length > 0) {
            const allPaid = planInstallments.every((i) => i.status === 'PAID');
            const anyPaidOrPartial = planInstallments.some((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID');

            let itemPaymentStatus = 'UNPAID';
            if (allPaid) {
              itemPaymentStatus = 'FULLY_PAID';
            } else if (anyPaidOrPartial) {
              itemPaymentStatus = 'PARTIALLY_PAID';
            }

            await trx
              .updateTable('order_items')
              .set({ payment_status: itemPaymentStatus as any })
              .where('id', '=', orderItemId as any)
              .execute();

            // Transactional Commission Eligibility Re-evaluation
            if (this.commissionEligibilityService) {
              await this.commissionEligibilityService.evaluateOrderItemCommissions(trx, String(orderItemId), actorEmployeeId);
            }

            // 9. Downstream Dependency Hook Integration
            // If item became FULLY_PAID, check dependent order items / projects
            if (itemPaymentStatus === 'FULLY_PAID') {
              await this.evaluateDependentProjects(trx, orderItemId, actorEmployeeId);
            }
          }
        }
      }

      // 10. Audit Logging
      await trx
        .insertInto('audit_logs')
        .values({
          actor_employee_id: actorEmployeeId as any,
          action: 'PAYMENT_CONFIRM',
          entity_type: 'PAYMENT',
          entity_id: payment.id,
          payload_before_sanitized: JSON.stringify({ status: payment.status }),
          payload_after_sanitized: JSON.stringify({ status: 'CONFIRMED', allocationsCount: allocationsToApply.length }),
        })
        .execute();

      if (payment.created_by_employee_id) {
        await this.notificationsService.createNotification(
          {
            employeeId: payment.created_by_employee_id,
            eventType: 'PAYMENT_CONFIRMED',
            title: `Thanh toán ${payment.payment_code} đã được xác nhận`,
            content: `Thanh toán số tiền ${payment.gross_cash_amount} đã được Boss phê duyệt`,
            deepLinkUrl: `/payments/${payment.id}`,
            entityType: 'payments',
            entityId: payment.id,
          },
          trx,
        );
      }

      return updatedPayment;
    });
  }

  // --------------------------------------------------
  // REJECT PAYMENT (BOSS ONLY)
  // Sets status to REJECTED. Keeps record history intact.
  // --------------------------------------------------
  async rejectPayment(paymentId: string, dto: RejectPaymentDto, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const payment = await trx
        .selectFrom('payments')
        .selectAll()
        .where('id', '=', paymentId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!payment) {
        throw new NotFoundException(`Payment #${paymentId} not found`);
      }

      if (payment.status !== 'PENDING_CONFIRMATION') {
        throw new BadRequestException(`Cannot reject payment #${paymentId} with status ${payment.status}`);
      }

      const [rejectedPayment] = await trx
        .updateTable('payments')
        .set({ status: 'REJECTED' })
        .where('id', '=', payment.id)
        .returningAll()
        .execute();

      await trx
        .insertInto('audit_logs')
        .values({
          actor_employee_id: actorEmployeeId as any,
          action: 'PAYMENT_REJECT',
          entity_type: 'PAYMENT',
          entity_id: payment.id,
          payload_before_sanitized: JSON.stringify({ status: payment.status }),
          payload_after_sanitized: JSON.stringify({ status: 'REJECTED', reason: dto.reason || null }),
        })
        .execute();

      if (payment.created_by_employee_id) {
        await this.notificationsService.createNotification(
          {
            employeeId: payment.created_by_employee_id,
            eventType: 'PAYMENT_REJECTED',
            title: `Thanh toán ${payment.payment_code} đã bị từ chối`,
            content: `Lý do từ chối: ${dto.reason || 'Không đạt yêu cầu'}`,
            deepLinkUrl: `/payments/${payment.id}`,
            entityType: 'payments',
            entityId: payment.id,
          },
          trx,
        );
      }

      return rejectedPayment;
    });
  }

  // --------------------------------------------------
  // DEPENDENCY RE-EVALUATION HOOK
  // --------------------------------------------------
  private async evaluateDependentProjects(trx: any, prerequisiteItemId: string, actorEmployeeId: string) {
    const dependencies = await trx
      .selectFrom('order_item_dependencies')
      .selectAll()
      .where('prerequisite_item_id', '=', prerequisiteItemId as any)
      .execute();

    for (const dep of dependencies) {
      const dependentProject = await trx
        .selectFrom('projects')
        .selectAll()
        .where('order_item_id', '=', dep.dependent_item_id)
        .executeTakeFirst();

      if (dependentProject && dependentProject.status === 'ASSIGNED') {
        // Evaluate generic dependencies for dependent project
        const isSatisfied = await this.projectsService.evaluateReadyToStart(String(dependentProject.id));
        if (isSatisfied) {
          await trx
            .updateTable('projects')
            .set({ status: 'READY_TO_START' })
            .where('id', '=', dependentProject.id)
            .execute();
        }
      }
    }
  }

  // --------------------------------------------------
  // READ METHODS
  // --------------------------------------------------
  async findPayments(query: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    let baseQuery = this.kysely.db
      .selectFrom('payments')
      .leftJoin('payment_allocations as pa', 'pa.payment_id', 'payments.id')
      .leftJoin('payment_installments as pi', 'pi.id', 'pa.installment_id')
      .leftJoin('order_item_payment_plans as oipp', 'oipp.id', 'pi.payment_plan_id')
      .leftJoin('projects as proj', 'proj.order_item_id', 'oipp.order_item_id');

    if (query.status) {
      baseQuery = baseQuery.where('payments.status', '=', query.status as any);
    }

    const items = await baseQuery
      .select([
        'payments.id',
        'payments.payment_code',
        'payments.gross_cash_amount',
        'payments.payment_method',
        'payments.evidence_url',
        'payments.created_by_employee_id',
        'payments.confirmed_by_employee_id',
        'payments.confirmed_at',
        'payments.status',
        'payments.created_at',
        sql<Array<{ id: string | number; name: string }>>`COALESCE(
          JSON_AGG(
            DISTINCT JSONB_BUILD_OBJECT('id', proj.id, 'name', proj.project_name)
          ) FILTER (WHERE proj.id IS NOT NULL),
          '[]'::json
        )`.as('projects'),
      ])
      .groupBy('payments.id')
      .orderBy('payments.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    let countQuery = this.kysely.db.selectFrom('payments');
    if (query.status) {
      countQuery = countQuery.where('status', '=', query.status as any);
    }

    const countRes = await countQuery
      .select((eb) => eb.fn.count<number>('id').as('total'))
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

  async findPaymentById(paymentId: string) {
    const payment = await this.kysely.db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', paymentId as any)
      .executeTakeFirst();

    if (!payment) {
      throw new NotFoundException(`Payment #${paymentId} not found`);
    }

    const allocations = await this.kysely.db
      .selectFrom('payment_allocations')
      .selectAll()
      .where('payment_id', '=', payment.id)
      .execute();

    return {
      ...payment,
      allocations,
    };
  }

  // --------------------------------------------------
  // GROSS CASH CALCULATOR
  // SUM of confirmed Payments ONLY (never double count allocations)
  // --------------------------------------------------
  async calculateGrossCash(): Promise<number> {
    const result = await this.kysely.db
      .selectFrom('payments')
      .where('status', '=', 'CONFIRMED')
      .select((eb) => eb.fn.sum<number>('gross_cash_amount').as('grossCash'))
      .executeTakeFirst();

    return Number(result?.grossCash || 0);
  }

  // --------------------------------------------------
  // RECEIVABLE CALCULATOR FOR ORDER ITEM
  // Sum of due of CURRENT APPROVED plan minus confirmed allocations on CURRENT plan
  // --------------------------------------------------
  async calculateReceivable(orderItemId: string): Promise<number> {
    const approvedPlan = await this.kysely.db
      .selectFrom('order_item_payment_plans')
      .selectAll()
      .where('order_item_id', '=', orderItemId as any)
      .where('status', '=', 'APPROVED')
      .executeTakeFirst();

    if (!approvedPlan) return 0;

    const installments = await this.kysely.db
      .selectFrom('payment_installments')
      .selectAll()
      .where('payment_plan_id', '=', approvedPlan.id)
      .execute();

    const totalDue = installments.reduce((acc, i) => acc + Number(i.gross_amount_due), 0);

    const instIds = installments.map((i) => i.id);
    if (instIds.length === 0) return totalDue;

    const confirmedAllocations = await this.kysely.db
      .selectFrom('payment_allocations')
      .innerJoin('payments', 'payments.id', 'payment_allocations.payment_id')
      .where('payment_allocations.installment_id', 'in', instIds as any[])
      .where('payments.status', '=', 'CONFIRMED')
      .select((eb) => eb.fn.sum<number>('payment_allocations.gross_allocated_amount').as('sumPaid'))
      .executeTakeFirst();

    const totalAllocated = Number(confirmedAllocations?.sumPaid || 0);
    return Math.max(0, totalDue - totalAllocated);
  }
}
