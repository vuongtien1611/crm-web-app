import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { sql } from 'kysely';
import { KyselyService } from '../../database/kysely.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a new Payroll Period in OPEN status
   */
  async createPeriod(dto: CreatePayrollPeriodDto) {
    const existing = await this.kysely.db
      .selectFrom('payroll_periods')
      .selectAll()
      .where('period_key', '=', dto.periodKey)
      .executeTakeFirst();

    if (existing) {
      throw new ConflictException(`Payroll period with key '${dto.periodKey}' already exists`);
    }

    const overlaps = await this.kysely.db
      .selectFrom('payroll_periods')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([
            eb('start_date', '<=', new Date(dto.endDate) as any),
            eb('end_date', '>=', new Date(dto.startDate) as any),
          ]),
        ]),
      )
      .executeTakeFirst();

    if (overlaps) {
      throw new BadRequestException(
        `Payroll period dates [${dto.startDate} - ${dto.endDate}] overlap with existing period '${overlaps.period_key}'`,
      );
    }

    const [period] = await this.kysely.db
      .insertInto('payroll_periods')
      .values({
        period_key: dto.periodKey,
        start_date: new Date(dto.startDate) as any,
        end_date: new Date(dto.endDate) as any,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    return period;
  }

  /**
   * List Payroll Periods with summary totals
   */
  async findPeriods(params: { page?: number; limit?: number; status?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    let query = this.kysely.db.selectFrom('payroll_periods');
    if (params.status) {
      query = query.where('status', '=', params.status as any);
    }

    const totalRes = await query
      .select((eb) => eb.fn.count<string>('id').as('count'))
      .executeTakeFirst();
    const total = parseInt(totalRes?.count || '0', 10);

    const periods = await query
      .selectAll()
      .orderBy('start_date', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const data = await Promise.all(
      periods.map(async (p) => {
        const stats = await this.kysely.db
          .selectFrom('payrolls')
          .select([
            (eb) => eb.fn.count<string>('id').as('employee_count'),
            (eb) => eb.fn.sum<string>('net_salary_amount').as('total_gross_payroll'),
          ])
          .where('payroll_period_id', '=', p.id)
          .executeTakeFirst();

        return {
          ...p,
          employee_count: parseInt(stats?.employee_count || '0', 10),
          total_gross_payroll: parseFloat(stats?.total_gross_payroll || '0'),
        };
      }),
    );

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single Payroll Period details
   */
  async findPeriodById(id: string) {
    const period = await this.kysely.db
      .selectFrom('payroll_periods')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!period) {
      throw new NotFoundException(`Payroll period #${id} not found`);
    }

    const stats = await this.kysely.db
      .selectFrom('payrolls')
      .select([
        (eb) => eb.fn.count<string>('id').as('employee_count'),
        (eb) => eb.fn.sum<string>('base_salary').as('total_base_salary'),
        (eb) => eb.fn.sum<string>('released_commission_amount').as('total_commissions'),
        (eb) => eb.fn.sum<string>('kpi_bonus_amount').as('total_kpi_bonuses'),
        (eb) => eb.fn.sum<string>('team_override_amount').as('total_team_overrides'),
        (eb) => eb.fn.sum<string>('adjustment_amount').as('total_adjustments'),
        (eb) => eb.fn.sum<string>('net_salary_amount').as('total_net_salary'),
      ])
      .where('payroll_period_id', '=', period.id)
      .executeTakeFirst();

    return {
      ...period,
      stats: {
        employee_count: parseInt(stats?.employee_count || '0', 10),
        total_base_salary: parseFloat(stats?.total_base_salary || '0'),
        total_commissions: parseFloat(stats?.total_commissions || '0'),
        total_kpi_bonuses: parseFloat(stats?.total_kpi_bonuses || '0'),
        total_team_overrides: parseFloat(stats?.total_team_overrides || '0'),
        total_adjustments: parseFloat(stats?.total_adjustments || '0'),
        total_net_salary: parseFloat(stats?.total_net_salary || '0'),
      },
    };
  }

  /**
   * Deterministic Payroll Calculation Engine (MODEL A)
   * Sale Qualified Timestamp = MAX(accepted_at, fully_paid_at)
   * fully_paid_at = derived strictly from CURRENT APPROVED PAYMENT PLAN installments allocations
   * Tech Qualified Timestamp = exact Boss approved_at timestamp (status IN ('APPROVED', 'ADJUSTED'))
   * TL Override = payment_allocations.closing_sale_id (EXACT OrderItem closing_sale)
   */
  async calculatePayrollPeriod(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) {
        throw new NotFoundException(`Payroll period #${id} not found`);
      }

      if (period.status === 'LOCKED') {
        throw new BadRequestException('Payroll period is LOCKED and immutable');
      }

      if (period.status === 'APPROVED') {
        throw new BadRequestException('Cannot recalculate an APPROVED payroll period without reverting status first');
      }

      // Transition to CALCULATING
      await trx
        .updateTable('payroll_periods')
        .set({ status: 'CALCULATING', updated_at: new Date() as any })
        .where('id', '=', period.id)
        .execute();

      // Clear existing payroll items and payroll statements for this period safely
      const existingPayrolls = await trx
        .selectFrom('payrolls')
        .select('id')
        .where('payroll_period_id', '=', period.id)
        .execute();

      if (existingPayrolls.length > 0) {
        const payrollIds = existingPayrolls.map((p) => p.id);
        await trx
          .deleteFrom('payroll_items')
          .where('payroll_id', 'in', payrollIds)
          .execute();

        await trx
          .deleteFrom('payroll_adjustments')
          .where('target_payroll_id', 'in', payrollIds)
          .execute();

        await trx
          .deleteFrom('payrolls')
          .where('payroll_period_id', '=', period.id)
          .execute();
      }

      // Find all active employees
      const employees = await trx
        .selectFrom('employees')
        .selectAll()
        .where('status', '!=', 'TERMINATED')
        .execute();

      const periodStart = new Date(period.start_date);
      const periodEnd = new Date(period.end_date);
      periodEnd.setHours(23, 59, 59, 999);

      for (const emp of employees) {
        // 1. BASE SALARY from salary_history active at period start_date
        const salaryHistory = await trx
          .selectFrom('salary_history')
          .selectAll()
          .where('employee_id', '=', emp.id)
          .where((eb) => sql<boolean>`salary_history.effective_range && tstzrange(${period.start_date}::timestamptz, ${period.end_date}::timestamptz, '[]')`)
          .orderBy('created_at', 'desc')
          .executeTakeFirst();

        const baseSalary = salaryHistory ? Number(salaryHistory.base_salary) : 0;

        // 2. SALE COMMISSIONS QUALIFICATION: MAX(accepted_at, fully_paid_at)
        const candidateSaleComms = await trx
          .selectFrom('commissions')
          .selectAll()
          .where('beneficiary_employee_id', '=', emp.id)
          .where('commission_type', '=', 'SALE')
          .where('status', '=', 'RELEASED')
          .execute();

        const validSaleComms = [];
        for (const comm of candidateSaleComms) {
          let fullyPaidAt: Date | null = null;
          let acceptedAt: Date | null = null;

          if (comm.order_item_id) {
            // Reusing Payment Foundation semantics: Current Approved Payment Plan
            const approvedPlan = await trx
              .selectFrom('order_item_payment_plans')
              .selectAll()
              .where('order_item_id', '=', comm.order_item_id)
              .where('status', '=', 'APPROVED')
              .executeTakeFirst();

            if (approvedPlan) {
              const installments = await trx
                .selectFrom('payment_installments')
                .selectAll()
                .where('payment_plan_id', '=', approvedPlan.id)
                .execute();

              const totalPlanObligation = installments.reduce((sum, inst) => sum + Number(inst.gross_amount_due), 0);
              const instIds = installments.map((i) => i.id);

              if (instIds.length > 0 && totalPlanObligation > 0) {
                // Fetch confirmed allocations linked strictly to current plan installments
                const currentPlanAllocations = await trx
                  .selectFrom('payment_allocations')
                  .innerJoin('payments', 'payments.id', 'payment_allocations.payment_id')
                  .select(['payment_allocations.confirmed_at', 'payment_allocations.gross_allocated_amount'])
                  .where('payment_allocations.installment_id', 'in', instIds)
                  .where('payments.status', '=', 'CONFIRMED')
                  .orderBy('payment_allocations.confirmed_at', 'asc')
                  .execute();

                let runningConfirmedAllocSum = 0;
                for (const alloc of currentPlanAllocations) {
                  runningConfirmedAllocSum += Number(alloc.gross_allocated_amount);
                  if (runningConfirmedAllocSum >= totalPlanObligation) {
                    fullyPaidAt = new Date(alloc.confirmed_at);
                    break;
                  }
                }
              }
            }

            // Fetch customer acceptance timestamp
            const project = await trx
              .selectFrom('projects')
              .select('id')
              .where('order_item_id', '=', comm.order_item_id)
              .executeTakeFirst();

            if (project) {
              const acc = await trx
                .selectFrom('project_acceptances')
                .select('accepted_at')
                .where('project_id', '=', project.id)
                .executeTakeFirst();

              if (acc) {
                acceptedAt = new Date(acc.accepted_at);
              }
            }
          }

          let saleQualifiedAt: Date | null = null;
          if (fullyPaidAt && acceptedAt) {
            saleQualifiedAt = fullyPaidAt > acceptedAt ? fullyPaidAt : acceptedAt;
          } else if (fullyPaidAt) {
            saleQualifiedAt = fullyPaidAt;
          } else if (acceptedAt) {
            saleQualifiedAt = acceptedAt;
          }

          if (saleQualifiedAt && saleQualifiedAt >= periodStart && saleQualifiedAt <= periodEnd) {
            validSaleComms.push(comm);
          }
        }

        // 3. TECHNICAL COMMISSIONS QUALIFICATION: Exact Boss approved_at timestamp
        const candidateTechComms = await trx
          .selectFrom('commissions')
          .selectAll()
          .where('beneficiary_employee_id', '=', emp.id)
          .where('commission_type', '=', 'PROJECT_DELIVERY')
          .where('status', 'in', ['APPROVED', 'ADJUSTED'])
          .execute();

        const validTechComms = candidateTechComms.filter((c) => {
          if (!c.approved_at) return false;
          const approvalTime = new Date(c.approved_at);
          return approvalTime >= periodStart && approvalTime <= periodEnd;
        });

        const releasedCommissionAmount =
          validSaleComms.reduce((sum, c) => sum + Number(c.calculated_amount), 0) +
          validTechComms.reduce((sum, c) => sum + Number(c.approved_amount || c.calculated_amount), 0);

        // 4. TEAM LEADER OVERRIDE (DIRECT CALCULATION FROM payment_allocations.closing_sale_id)
        // STRICT RULE: ONLY SALES_TEAM_LEADER receives 2% team override. Dev & SEO Leaders get 0%.
        let teamOverrideAmount = 0;
        const tlTraceAllocations: Array<{ id: number; amount: number }> = [];

        const empPosition = await trx
          .selectFrom('positions')
          .select('code')
          .where('id', '=', emp.position_id)
          .executeTakeFirst();

        if (empPosition?.code === 'SALES_TEAM_LEADER') {
          const periodAllocations = await trx
            .selectFrom('payment_allocations')
            .select([
              'payment_allocations.id as allocation_id',
              'payment_allocations.net_eligible_amount',
              'payment_allocations.confirmed_at',
              'payment_allocations.closing_sale_id',
            ])
            .where('payment_allocations.confirmed_at', '>=', periodStart)
            .where('payment_allocations.confirmed_at', '<=', periodEnd)
            .execute();

          for (const alloc of periodAllocations) {
            const closingSaleId = alloc.closing_sale_id; // Exact OrderItem closing sale!
            if (String(closingSaleId) === String(emp.id)) continue; // Exclude leader's own sale

            const membership = await trx
              .selectFrom('team_memberships')
              .selectAll()
              .where('employee_id', '=', closingSaleId)
              .where((eb) => sql<boolean>`team_memberships.effective_range @> ${alloc.confirmed_at}::timestamptz`)
              .executeTakeFirst();

            if (membership) {
              const leaderCheck = await trx
                .selectFrom('team_memberships')
                .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
                .selectAll('team_memberships')
                .where('team_memberships.team_id', '=', membership.team_id)
                .where('team_memberships.employee_id', '=', emp.id)
                .where('team_memberships.is_leader', '=', true)
                .where('teams.department', '=', 'SALES')
                .where((eb) => sql<boolean>`team_memberships.effective_range @> ${alloc.confirmed_at}::timestamptz`)
                .executeTakeFirst();

              if (leaderCheck) {
                const overridePart = Number(alloc.net_eligible_amount) * 0.02;
                teamOverrideAmount += overridePart;
                tlTraceAllocations.push({ id: alloc.allocation_id, amount: overridePart });
              }
            }
          }
        }

        // 5. KPI BONUSES (from kpi_events)
        const kpiEvents = await trx
          .selectFrom('kpi_events')
          .selectAll()
          .where('employee_id', '=', emp.id)
          .where('target_kpi_period', '=', period.period_key)
          .execute();

        let kpiBonusAmount = 0;
        const kpiTraceEvents: Array<{ id: number; bonus: number; type: string }> = [];

        // Sale Cash Revenue Tier
        const saleCashEvents = kpiEvents.filter((e) => e.source_type === 'PAYMENT_ALLOCATION');
        const totalSaleRevenue = saleCashEvents.reduce((sum, e) => sum + Number(e.eligible_revenue || 0), 0);
        let saleKpiBonus = 0;
        if (totalSaleRevenue >= 200000000) {
          saleKpiBonus = 3000000;
        } else if (totalSaleRevenue >= 150000000) {
          saleKpiBonus = 2000000;
        } else if (totalSaleRevenue >= 120000000) {
          saleKpiBonus = 1000000;
        }
        if (saleKpiBonus > 0) {
          kpiBonusAmount += saleKpiBonus;
          kpiTraceEvents.push({ id: saleCashEvents[0]?.id || 0, bonus: saleKpiBonus, type: 'SALE_CASH_REVENUE' });
        }

        // SEO Articles Tier
        const seoEvents = kpiEvents.filter((e) => e.source_type === 'SEO_ARTICLE');
        const totalSeoUnits = seoEvents.reduce((sum, e) => sum + Number(e.metric_value || 0), 0);
        let seoKpiBonus = 0;
        if (totalSeoUnits >= 150) {
          seoKpiBonus = 2000000;
        } else if (totalSeoUnits >= 100) {
          seoKpiBonus = 1000000;
        }
        if (seoKpiBonus > 0) {
          kpiBonusAmount += seoKpiBonus;
          kpiTraceEvents.push({ id: seoEvents[0]?.id || 0, bonus: seoKpiBonus, type: 'SEO_ARTICLE_COUNT' });
        }

        const adjustmentAmount = 0;
        const netSalaryAmount = Math.max(
          0,
          baseSalary + releasedCommissionAmount + kpiBonusAmount + teamOverrideAmount + adjustmentAmount,
        );

        // Create payroll statement
        const [payroll] = await trx
          .insertInto('payrolls')
          .values({
            payroll_period_id: period.id,
            employee_id: emp.id,
            base_salary: baseSalary,
            released_commission_amount: releasedCommissionAmount,
            kpi_bonus_amount: kpiBonusAmount,
            team_override_amount: teamOverrideAmount,
            adjustment_amount: adjustmentAmount,
            net_salary_amount: netSalaryAmount,
          })
          .returningAll()
          .execute();

        // Create detailed payroll line items with exact source trace
        if (baseSalary > 0) {
          await trx.insertInto('payroll_items').values({
            payroll_id: payroll.id,
            item_type: 'BASE_SALARY',
            amount: baseSalary,
            description: `Base Salary derived from salary_history_id: ${salaryHistory?.id || 'default'}`,
          }).execute();
        }

        if (validSaleComms.length > 0) {
          for (const c of validSaleComms) {
            await trx.insertInto('payroll_items').values({
              payroll_id: payroll.id,
              item_type: 'RELEASED_COMMISSION_SALE',
              amount: Number(c.calculated_amount),
              description: `Sale Commission commission_id: ${c.id}`,
            }).execute();
          }
        }

        if (validTechComms.length > 0) {
          for (const c of validTechComms) {
            await trx.insertInto('payroll_items').values({
              payroll_id: payroll.id,
              item_type: 'RELEASED_COMMISSION_TECH',
              amount: Number(c.approved_amount || c.calculated_amount),
              description: `Tech Commission commission_id: ${c.id}`,
            }).execute();
          }
        }

        if (tlTraceAllocations.length > 0) {
          for (const t of tlTraceAllocations) {
            await trx.insertInto('payroll_items').values({
              payroll_id: payroll.id,
              item_type: 'TEAM_OVERRIDE',
              amount: t.amount,
              description: `Team Leader Override 2% payment_allocation_id: ${t.id}`,
            }).execute();
          }
        }

        if (kpiTraceEvents.length > 0) {
          for (const k of kpiTraceEvents) {
            await trx.insertInto('payroll_items').values({
              payroll_id: payroll.id,
              item_type: 'KPI_BONUS',
              amount: k.bonus,
              description: `KPI Bonus (${k.type}) target_kpi_period: ${period.period_key}`,
            }).execute();
          }
        }
      }

      // Transition to REVIEW (MODEL A synchronous completion)
      const [updatedPeriod] = await trx
        .updateTable('payroll_periods')
        .set({ status: 'REVIEW', updated_at: new Date() as any })
        .where('id', '=', period.id)
        .returningAll()
        .execute();

      return updatedPeriod;
    });
  }

  /**
   * Transition status from CALCULATING -> REVIEW (Explicit manual/recovery action)
   */
  async submitReview(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) throw new NotFoundException(`Payroll period #${id} not found`);
      if (period.status === 'LOCKED') throw new BadRequestException('Payroll period is LOCKED');

      const [updated] = await trx
        .updateTable('payroll_periods')
        .set({ status: 'REVIEW', updated_at: new Date() as any })
        .where('id', '=', period.id)
        .returningAll()
        .execute();

      return updated;
    });
  }

  /**
   * Transition status from REVIEW -> APPROVED by Boss/Admin
   */
  async approvePeriod(id: string, actorEmployeeId?: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) throw new NotFoundException(`Payroll period #${id} not found`);
      if (period.status === 'OPEN') {
        throw new BadRequestException('Cannot approve period in OPEN status before calculating and review');
      }
      if (period.status === 'LOCKED') {
        throw new BadRequestException('Payroll period is already LOCKED');
      }

      const [updated] = await trx
        .updateTable('payroll_periods')
        .set({ status: 'APPROVED', updated_at: new Date() as any })
        .where('id', '=', period.id)
        .returningAll()
        .execute();

      if (this.notificationsService) {
        await this.notificationsService.notifyRoles(
          ['BOSS', 'ADMIN', 'ACCOUNTANT'],
          {
            eventType: 'PAYROLL_APPROVED',
            title: 'Bảng lương đã được duyệt',
            content: `Bảng lương kỳ ${period.period_key} đã được duyệt (APPROVED).`,
            deepLinkUrl: `/payroll/${period.id}`,
            entityType: 'PAYROLL_PERIOD',
            entityId: String(period.id),
          },
          trx,
        );
      }

      return updated;
    });
  }

  /**
   * Lock Payroll Period -> Immutable State
   * Transitions included commissions to IN_PAYROLL (NOT PAID!)
   * Materializes deduplicated Expense record (source_type = 'PAYROLL')
   */
  async lockPeriod(id: string, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!period) throw new NotFoundException(`Payroll period #${id} not found`);
      if (period.status !== 'APPROVED') {
        throw new BadRequestException(`Cannot lock payroll period in '${period.status}' status. Must be APPROVED first.`);
      }

      // Mark period as LOCKED
      const [lockedPeriod] = await trx
        .updateTable('payroll_periods')
        .set({
          status: 'LOCKED',
          locked_at: new Date() as any,
          locked_by_employee_id: actorEmployeeId as any,
          updated_at: new Date() as any,
        })
        .where('id', '=', period.id)
        .returningAll()
        .execute();

      // Find all included commission line items from payroll_items
      const lineItems = await trx
        .selectFrom('payroll_items')
        .innerJoin('payrolls', 'payrolls.id', 'payroll_items.payroll_id')
        .select('payroll_items.description')
        .where('payrolls.payroll_period_id', '=', period.id)
        .where((eb) =>
          eb.or([
            eb('payroll_items.item_type', '=', 'RELEASED_COMMISSION_SALE'),
            eb('payroll_items.item_type', '=', 'RELEASED_COMMISSION_TECH'),
          ]),
        )
        .execute();

      const commIds: number[] = [];
      for (const item of lineItems) {
        const match = item.description?.match(/commission_id:\s*(\d+)/);
        if (match) commIds.push(parseInt(match[1], 10));
      }

      // Mark included commissions' status as IN_PAYROLL (NOT PAID!)
      if (commIds.length > 0) {
        await trx
          .updateTable('commissions')
          .set({ status: 'IN_PAYROLL', updated_at: new Date() as any })
          .where('id', 'in', commIds)
          .execute();
      }

      // Materialize Expense deduplication row
      const stats = await trx
        .selectFrom('payrolls')
        .select((eb) => eb.fn.sum<string>('net_salary_amount').as('total'))
        .where('payroll_period_id', '=', period.id)
        .executeTakeFirst();

      const totalGrossPayroll = parseFloat(stats?.total || '0');

      if (totalGrossPayroll > 0) {
        let category = await trx
          .selectFrom('expense_categories')
          .selectAll()
          .where('code', '=', 'PAYROLL')
          .executeTakeFirst();

        if (!category) {
          [category] = await trx
            .insertInto('expense_categories')
            .values({
              code: 'PAYROLL',
              name: 'Payroll Salary Expense',
              description: 'Aggregated monthly employee payroll expense',
            })
            .returningAll()
            .execute();
        }

        // Deduplicated insert via partial unique index idx_payroll_expense_dedup
        const existingExpense = await trx
          .selectFrom('expenses')
          .selectAll()
          .where('source_payroll_period_id', '=', period.id)
          .where('source_type', '=', 'PAYROLL')
          .executeTakeFirst();

        if (!existingExpense) {
          await trx
            .insertInto('expenses')
            .values({
              category_id: category.id,
              amount: totalGrossPayroll as any,
              expense_date: period.end_date,
              created_by_employee_id: actorEmployeeId as any,
              source_type: 'PAYROLL',
              source_payroll_period_id: period.id,
              note: `Payroll expense for period ${period.period_key}`,
            })
            .execute();
        }
      }

      if (this.notificationsService) {
        await this.notificationsService.notifyRoles(['BOSS', 'ADMIN', 'ACCOUNTANT'], {
          eventType: 'PAYROLL_LOCKED',
          title: 'Bảng lương đã khóa sổ',
          content: `Bảng lương kỳ ${period.period_key} đã được khóa sổ (LOCKED).`,
          deepLinkUrl: `/payroll/${period.id}`,
          entityType: 'PAYROLL_PERIOD',
          entityId: String(period.id),
        }, trx);
      }

      return lockedPeriod;
    });
  }

  /**
   * Manual Payroll Adjustment for Employee Statement in an Unlocked Period
   */
  async createAdjustment(periodId: string, dto: CreatePayrollAdjustmentDto, actorEmployeeId: string) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      const period = await trx
        .selectFrom('payroll_periods')
        .selectAll()
        .where('id', '=', periodId as any)
        .executeTakeFirst();

      if (!period) throw new NotFoundException(`Payroll period #${periodId} not found`);
      if (period.status === 'LOCKED') {
        throw new BadRequestException('Cannot add adjustment directly to LOCKED payroll period');
      }

      let payroll = await trx
        .selectFrom('payrolls')
        .selectAll()
        .where('payroll_period_id', '=', period.id)
        .where('employee_id', '=', dto.employeeId as any)
        .executeTakeFirst();

      if (!payroll) {
        [payroll] = await trx
          .insertInto('payrolls')
          .values({
            payroll_period_id: period.id,
            employee_id: dto.employeeId as any,
            base_salary: 0,
            released_commission_amount: 0,
            kpi_bonus_amount: 0,
            team_override_amount: 0,
            adjustment_amount: 0,
            net_salary_amount: 0,
          })
          .returningAll()
          .execute();
      }

      const [adj] = await trx
        .insertInto('payroll_adjustments')
        .values({
          target_payroll_id: payroll.id,
          origin_payroll_period_id: period.id,
          amount: dto.amount as any,
          reason: dto.reason,
          created_by_employee_id: actorEmployeeId as any,
        })
        .returningAll()
        .execute();

      const newAdjustmentTotal = Number(payroll.adjustment_amount) + Number(dto.amount);
      const newNetSalary = Math.max(
        0,
        Number(payroll.base_salary) +
          Number(payroll.released_commission_amount) +
          Number(payroll.kpi_bonus_amount) +
          Number(payroll.team_override_amount) +
          newAdjustmentTotal,
      );

      await trx
        .updateTable('payrolls')
        .set({
          adjustment_amount: newAdjustmentTotal as any,
          net_salary_amount: newNetSalary as any,
          updated_at: new Date() as any,
        })
        .where('id', '=', payroll.id)
        .execute();

      await trx
        .insertInto('payroll_items')
        .values({
          payroll_id: payroll.id,
          item_type: 'MANUAL_ADJUSTMENT',
          amount: dto.amount as any,
          description: `Manual adjustment payroll_adjustment_id: ${adj.id} - ${dto.reason}`,
        })
        .execute();

      return adj;
    });
  }

  /**
   * Get Employee Payroll Statements for a Period with Object Authorization
   */
  async findPeriodEmployees(periodId: string, user: any) {
    const period = await this.kysely.db
      .selectFrom('payroll_periods')
      .selectAll()
      .where('id', '=', periodId as any)
      .executeTakeFirst();

    if (!period) throw new NotFoundException(`Payroll period #${periodId} not found`);

    let query = this.kysely.db
      .selectFrom('payrolls')
      .innerJoin('employees', 'employees.id', 'payrolls.employee_id')
      .select([
        'payrolls.id',
        'payrolls.payroll_period_id',
        'payrolls.employee_id',
        'employees.full_name as employee_name',
        'employees.employee_code',
        'payrolls.base_salary',
        'payrolls.released_commission_amount',
        'payrolls.kpi_bonus_amount',
        'payrolls.team_override_amount',
        'payrolls.adjustment_amount',
        'payrolls.net_salary_amount',
        'payrolls.created_at',
      ])
      .where('payrolls.payroll_period_id', '=', period.id);

    const isManagement = user?.roles?.some((r: string) => ['ADMIN', 'BOSS', 'ACCOUNTANT'].includes(r));
    const hasReadAll = user?.permissions?.includes('PAYROLL_READ_ALL');

    if (!isManagement && !hasReadAll && user?.employee_id) {
      query = query.where('payrolls.employee_id', '=', user.employee_id);
    }

    return await query.execute();
  }

  /**
   * Get Single Employee Payroll Detail
   */
  async findEmployeePayrollDetail(periodId: string, employeeId: string, user: any) {
    const isManagement = user?.roles?.some((r: string) => ['ADMIN', 'BOSS', 'ACCOUNTANT'].includes(r));
    const hasReadAll = user?.permissions?.includes('PAYROLL_READ_ALL');

    if (!isManagement && !hasReadAll && String(user?.employee_id) !== String(employeeId)) {
      throw new ForbiddenException('Cannot read another employee\'s payroll');
    }

    const payroll = await this.kysely.db
      .selectFrom('payrolls')
      .innerJoin('employees', 'employees.id', 'payrolls.employee_id')
      .select([
        'payrolls.id',
        'payrolls.payroll_period_id',
        'payrolls.employee_id',
        'employees.full_name as employee_name',
        'employees.employee_code',
        'payrolls.base_salary',
        'payrolls.released_commission_amount',
        'payrolls.kpi_bonus_amount',
        'payrolls.team_override_amount',
        'payrolls.adjustment_amount',
        'payrolls.net_salary_amount',
        'payrolls.created_at',
      ])
      .where('payrolls.payroll_period_id', '=', periodId as any)
      .where('payrolls.employee_id', '=', employeeId as any)
      .executeTakeFirst();

    if (!payroll) throw new NotFoundException(`Payroll statement not found for employee #${employeeId}`);

    const items = await this.kysely.db
      .selectFrom('payroll_items')
      .selectAll()
      .where('payroll_id', '=', payroll.id)
      .execute();

    const adjustments = await this.kysely.db
      .selectFrom('payroll_adjustments')
      .selectAll()
      .where('target_payroll_id', '=', payroll.id)
      .execute();

    return {
      ...payroll,
      items,
      adjustments,
    };
  }
}
