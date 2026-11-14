import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { FinanceService, FinanceOverviewData } from './finance.service';
import { sql } from 'kysely';

export interface ExecutiveDashboardData {
  period: string;
  cashReceivable: {
    grossCashConfirmedPeriod: number;
    grossCashConfirmedTotal: number;
    accountsReceivable: number;
    paymentPendingConfirmationCount: number;
    paymentPendingConfirmationAmount: number;
    installmentsOverdueCount: number;
    installmentsOverdueAmount: number;
  };
  financialOverview?: FinanceOverviewData;
  sales: {
    totalLeads: number;
    potentialLeads: number;
    openDeals: number;
    wonDeals: number;
    ordersPendingApproval: number;
  };
  delivery: {
    activeProjects: number;
    readyToStartProjects: number;
    blockedWaitingProjects: number;
    inAcceptanceProjects: number;
    completedProjects: number;
  };
  people: {
    totalActiveEmployees: number;
    departments: {
      sales: number;
      dev: number;
      seo: number;
      operation: number;
    };
    totalTeams: number;
    teamsBreakdown: Record<string, number>;
    totalKpiPoints: number;
    commissions: {
      unearnedAmount: number;
      releasedAmount: number;
      calculatedAmount: number;
      approvedAmount: number;
      adjustedAmount: number;
      rejectedAmount: number;
      inPayrollAmount: number;
      paidAmount: number;
      totalAmount: number;
    };
  };
  payrollExpense: {
    payrollPeriod: {
      periodKey: string;
      status: string;
      totalNetSalary: number;
    } | null;
    expensesInPeriod: number;
  };
  alerts: {
    pendingOrders: Array<{
      id: string;
      orderCode: string;
      companyName: string;
      totalAmount: number;
      createdAt: string;
    }>;
    pendingPayments: Array<{
      id: string;
      paymentCode: string;
      grossCashAmount: number;
      paymentMethod: string;
      evidenceUrl: string | null;
      createdAt: string;
    }>;
    blockedProjects: Array<{
      id: string;
      projectName: string;
      companyName: string;
      progressPercent: number;
      blockedReason?: string;
    }>;
    overdueInstallments: Array<{
      id: string;
      installmentNumber: number;
      dueDate: string;
      grossAmountDue: number;
      status: string;
    }>;
  };
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly financeService: FinanceService,
  ) {}

  async getExecutiveDashboard(periodParam?: string): Promise<ExecutiveDashboardData> {
    const db = this.kysely.db;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentPeriod;

    // 1. CASH / RECEIVABLE
    // Gross Cash Confirmed in target period
    const cashPeriodRes = await db
      .selectFrom('payments')
      .select(sql<number>`coalesce(sum(gross_cash_amount), 0)`.as('total'))
      .where('status', '=', 'CONFIRMED')
      .where(sql`to_char(coalesce(confirmed_at, created_at), 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();
    const grossCashConfirmedPeriod = Number(cashPeriodRes?.total || 0);

    // Cumulative Gross Cash Confirmed
    const cashTotalRes = await db
      .selectFrom('payments')
      .select(sql<number>`coalesce(sum(gross_cash_amount), 0)`.as('total'))
      .where('status', '=', 'CONFIRMED')
      .executeTakeFirst();
    const grossCashConfirmedTotal = Number(cashTotalRes?.total || 0);

    // Accounts Receivable (AR) from approved payment plans
    // Canonical rule: current APPROVED payment plan obligations - CONFIRMED allocations on CURRENT plan installments only
    // Historical allocations on superseded plans are not double-subtracted or carried forward
    const arRes = await sql<{ ar: string }>`
      WITH approved_plans AS (
        SELECT id, order_item_id FROM order_item_payment_plans WHERE status = 'APPROVED'
      ),
      plan_installments AS (
        SELECT 
          pi.id AS installment_id,
          pi.payment_plan_id,
          pi.gross_amount_due
        FROM payment_installments pi
        INNER JOIN approved_plans ap ON ap.id = pi.payment_plan_id
      ),
      plan_allocations AS (
        SELECT 
          pinst.payment_plan_id,
          coalesce(sum(pa.gross_allocated_amount), 0) AS plan_paid
        FROM payment_allocations pa
        INNER JOIN payments p ON p.id = pa.payment_id
        INNER JOIN plan_installments pinst ON pinst.installment_id = pa.installment_id
        WHERE p.status = 'CONFIRMED'
        GROUP BY pinst.payment_plan_id
      ),
      plan_totals AS (
        SELECT 
          pinst.payment_plan_id,
          coalesce(sum(pinst.gross_amount_due), 0) AS plan_due,
          coalesce(pa.plan_paid, 0) AS plan_paid,
          greatest(0, coalesce(sum(pinst.gross_amount_due), 0) - coalesce(pa.plan_paid, 0)) AS plan_ar
        FROM plan_installments pinst
        LEFT JOIN plan_allocations pa ON pa.payment_plan_id = pinst.payment_plan_id
        GROUP BY pinst.payment_plan_id, pa.plan_paid
      )
      SELECT coalesce(sum(plan_ar), 0) AS ar FROM plan_totals
    `.execute(db);
    const accountsReceivable = Number(arRes.rows[0]?.ar || 0);

    // Payments pending confirmation
    const pendingPaymentsRes = await db
      .selectFrom('payments')
      .select([
        sql<number>`count(id)`.as('count'),
        sql<number>`coalesce(sum(gross_cash_amount), 0)`.as('amount'),
      ])
      .where('status', '=', 'PENDING_CONFIRMATION')
      .executeTakeFirst();
    const paymentPendingConfirmationCount = Number(pendingPaymentsRes?.count || 0);
    const paymentPendingConfirmationAmount = Number(pendingPaymentsRes?.amount || 0);

    // Overdue installments
    const overdueRes = await db
      .selectFrom('payment_installments')
      .select([
        sql<number>`count(id)`.as('count'),
        sql<number>`coalesce(sum(gross_amount_due), 0)`.as('amount'),
      ])
      .where(
        sql<boolean>`status = 'OVERDUE' OR (status IN ('PENDING', 'PARTIALLY_PAID') AND due_date < CURRENT_DATE)`,
      )
      .executeTakeFirst();
    const installmentsOverdueCount = Number(overdueRes?.count || 0);
    const installmentsOverdueAmount = Number(overdueRes?.amount || 0);

    // 2. SALES
    const leadsCountRes = await db
      .selectFrom('leads')
      .select([
        sql<number>`count(id)`.as('total'),
        sql<number>`count(case when quality = 'POTENTIAL' then 1 end)`.as('potential'),
      ])
      .executeTakeFirst();
    const totalLeads = Number(leadsCountRes?.total || 0);
    const potentialLeads = Number(leadsCountRes?.potential || 0);

    // Canonical deal statuses: 'OPEN', 'NEGOTIATING', 'WON', 'LOST'
    const dealsCountRes = await db
      .selectFrom('deals')
      .select([
        sql<number>`count(case when status in ('OPEN', 'NEGOTIATING') then 1 end)`.as('open_deals'),
        sql<number>`count(case when status = 'WON' then 1 end)`.as('won_deals'),
      ])
      .executeTakeFirst();
    const openDeals = Number(dealsCountRes?.open_deals || 0);
    const wonDeals = Number(dealsCountRes?.won_deals || 0);

    const ordersPendingRes = await db
      .selectFrom('orders')
      .select(sql<number>`count(id)`.as('count'))
      .where('workflow_status', '=', 'PENDING_APPROVAL')
      .executeTakeFirst();
    const ordersPendingApproval = Number(ordersPendingRes?.count || 0);

    // 3. DELIVERY
    const projectsCountRes = await db
      .selectFrom('projects')
      .select([
        sql<number>`count(case when status in ('ASSIGNED', 'READY_TO_START', 'IN_PROGRESS') then 1 end)`.as('active'),
        sql<number>`count(case when status = 'READY_TO_START' then 1 end)`.as('ready_to_start'),
        sql<number>`count(case when status in ('BLOCKED', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL') then 1 end)`.as('blocked_waiting'),
        sql<number>`count(case when status in ('REVIEW', 'ACCEPTANCE') then 1 end)`.as('in_acceptance'),
        sql<number>`count(case when status = 'COMPLETED' then 1 end)`.as('completed'),
      ])
      .executeTakeFirst();
    const activeProjects = Number(projectsCountRes?.active || 0);
    const readyToStartProjects = Number(projectsCountRes?.ready_to_start || 0);
    const blockedWaitingProjects = Number(projectsCountRes?.blocked_waiting || 0);
    const inAcceptanceProjects = Number(projectsCountRes?.in_acceptance || 0);
    const completedProjects = Number(projectsCountRes?.completed || 0);

    // 4. PEOPLE / PERFORMANCE
    const employeesRes = await db
      .selectFrom('employees as e')
      .innerJoin('positions as pos', 'pos.id', 'e.position_id')
      .select([
        'pos.code as position_code',
        sql<number>`count(e.id)`.as('count'),
      ])
      .where('e.status', '=', 'ACTIVE')
      .groupBy('pos.code')
      .execute();

    let totalActiveEmployees = 0;
    let salesCount = 0;
    let devCount = 0;
    let seoCount = 0;
    let operationCount = 0;

    for (const row of employeesRes) {
      const cnt = Number(row.count);
      totalActiveEmployees += cnt;
      const code = row.position_code?.toUpperCase() || '';
      if (code.includes('SALE')) {
        salesCount += cnt;
      } else if (code.includes('DEV')) {
        devCount += cnt;
      } else if (code.includes('SEO')) {
        seoCount += cnt;
      } else {
        operationCount += cnt;
      }
    }

    const teamsRes = await db
      .selectFrom('teams')
      .select(['department', sql<number>`count(id)`.as('count')])
      .groupBy('department')
      .execute();

    let totalTeams = 0;
    const teamsBreakdown: Record<string, number> = {};
    for (const row of teamsRes) {
      const cnt = Number(row.count);
      totalTeams += cnt;
      if (row.department) teamsBreakdown[row.department] = cnt;
    }

    const kpiRes = await db
      .selectFrom('kpi_events')
      .select(sql<number>`coalesce(sum(kpi_points), 0)`.as('total'))
      .where('target_kpi_period', '=', period)
      .executeTakeFirst();
    const totalKpiPoints = Number(kpiRes?.total || 0);

    const commRes = await db
      .selectFrom('commissions')
      .select([
        'status',
        sql<number>`coalesce(sum(calculated_amount), 0)`.as('total_amount'),
      ])
      .groupBy('status')
      .execute();

    // Canonical Commission Statuses: UNEARNED, RELEASED, CALCULATED, APPROVED, ADJUSTED, REJECTED, IN_PAYROLL, PAID
    const commissions = {
      unearnedAmount: 0,
      releasedAmount: 0,
      calculatedAmount: 0,
      approvedAmount: 0,
      adjustedAmount: 0,
      rejectedAmount: 0,
      inPayrollAmount: 0,
      paidAmount: 0,
      totalAmount: 0,
    };

    for (const row of commRes) {
      const amt = Number(row.total_amount);
      commissions.totalAmount += amt;
      if (row.status === 'UNEARNED') commissions.unearnedAmount += amt;
      else if (row.status === 'RELEASED') commissions.releasedAmount += amt;
      else if (row.status === 'CALCULATED') commissions.calculatedAmount += amt;
      else if (row.status === 'APPROVED') commissions.approvedAmount += amt;
      else if (row.status === 'ADJUSTED') commissions.adjustedAmount += amt;
      else if (row.status === 'REJECTED') commissions.rejectedAmount += amt;
      else if (row.status === 'IN_PAYROLL') commissions.inPayrollAmount += amt;
      else if (row.status === 'PAID') commissions.paidAmount += amt;
    }

    // 5. PAYROLL / EXPENSE
    const payrollPeriodRow = await db
      .selectFrom('payroll_periods')
      .selectAll()
      .where('period_key', '=', period)
      .executeTakeFirst();

    let currentPayroll: ExecutiveDashboardData['payrollExpense']['payrollPeriod'] = null;
    if (payrollPeriodRow) {
      const netSalaryRes = await db
        .selectFrom('payrolls')
        .select(sql<number>`coalesce(sum(net_salary_amount), 0)`.as('total'))
        .where('payroll_period_id', '=', payrollPeriodRow.id)
        .executeTakeFirst();

      currentPayroll = {
        periodKey: payrollPeriodRow.period_key,
        status: payrollPeriodRow.status,
        totalNetSalary: Number(netSalaryRes?.total || 0),
      };
    }

    // Total expenses in period (by expense_date)
    const expensesRes = await db
      .selectFrom('expenses')
      .select(sql<number>`coalesce(sum(amount), 0)`.as('total'))
      .where(sql`to_char(expense_date, 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();
    const expensesInPeriod = Number(expensesRes?.total || 0);

    // 6. ALERTS
    // Pending Orders
    const pendingOrdersRaw = await db
      .selectFrom('orders as o')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .leftJoin('order_items as oi', 'oi.order_id', 'o.id')
      .select([
        'o.id',
        'o.order_code',
        'a.company_name',
        'o.created_at',
        sql<number>`coalesce(sum(oi.net_service_value + oi.vat_amount), 0)`.as('total_amount'),
      ])
      .where('o.workflow_status', '=', 'PENDING_APPROVAL')
      .groupBy(['o.id', 'o.order_code', 'a.company_name', 'o.created_at'])
      .orderBy('o.created_at', 'desc')
      .limit(5)
      .execute();

    const pendingOrders = pendingOrdersRaw.map((r) => ({
      id: String(r.id),
      orderCode: r.order_code,
      companyName: r.company_name,
      totalAmount: Number(r.total_amount),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
    }));

    // Pending Payments
    const pendingPaymentsRaw = await db
      .selectFrom('payments')
      .select([
        'id',
        'payment_code',
        'gross_cash_amount',
        'payment_method',
        'evidence_url',
        'created_at',
      ])
      .where('status', '=', 'PENDING_CONFIRMATION')
      .orderBy('created_at', 'desc')
      .limit(5)
      .execute();

    const pendingPayments = pendingPaymentsRaw.map((p) => ({
      id: String(p.id),
      paymentCode: p.payment_code,
      grossCashAmount: Number(p.gross_cash_amount),
      paymentMethod: p.payment_method,
      evidenceUrl: p.evidence_url || null,
      createdAt: p.created_at ? new Date(p.created_at).toISOString() : '',
    }));

    // Blocked Projects with reasons
    const blockedProjectsRaw = await db
      .selectFrom('projects as p')
      .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as a', 'a.id', 'o.account_id')
      .select([
        'p.id',
        'p.project_name',
        'p.materialized_progress_percent',
        'a.company_name',
      ])
      .where('p.status', '=', 'BLOCKED')
      .orderBy('p.updated_at', 'desc')
      .limit(5)
      .execute();

    const blockedProjects = await Promise.all(
      blockedProjectsRaw.map(async (bp) => {
        const blockedTask = await db
          .selectFrom('project_tasks as pt')
          .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
          .select('pt.blocked_reason')
          .where('pm.project_id', '=', bp.id)
          .where('pt.status', '=', 'BLOCKED')
          .where('pt.blocked_reason', 'is not', null)
          .executeTakeFirst();

        return {
          id: String(bp.id),
          projectName: bp.project_name,
          companyName: bp.company_name,
          progressPercent: Number(bp.materialized_progress_percent || 0),
          blockedReason: blockedTask?.blocked_reason || undefined,
        };
      }),
    );

    // Overdue Installments
    const overdueInstallmentsRaw = await db
      .selectFrom('payment_installments as pi')
      .innerJoin('order_item_payment_plans as plan', 'plan.id', 'pi.payment_plan_id')
      .select([
        'pi.id',
        'pi.installment_number',
        'pi.due_date',
        'pi.gross_amount_due',
        'pi.status',
      ])
      .where(
        sql<boolean>`pi.status = 'OVERDUE' OR (pi.status IN ('PENDING', 'PARTIALLY_PAID') AND pi.due_date < CURRENT_DATE)`,
      )
      .where('plan.status', '=', 'APPROVED')
      .orderBy('pi.due_date', 'asc')
      .limit(5)
      .execute();

    const overdueInstallments = overdueInstallmentsRaw.map((oi) => ({
      id: String(oi.id),
      installmentNumber: oi.installment_number,
      dueDate: oi.due_date ? String(oi.due_date) : '',
      grossAmountDue: Number(oi.gross_amount_due),
      status: oi.status,
    }));

    const financialOverview = await this.financeService.getOverview(period);

    return {
      period,
      cashReceivable: {
        grossCashConfirmedPeriod,
        grossCashConfirmedTotal,
        accountsReceivable,
        paymentPendingConfirmationCount,
        paymentPendingConfirmationAmount,
        installmentsOverdueCount,
        installmentsOverdueAmount,
      },
      financialOverview,
      sales: {
        totalLeads,
        potentialLeads,
        openDeals,
        wonDeals,
        ordersPendingApproval,
      },
      delivery: {
        activeProjects,
        readyToStartProjects,
        blockedWaitingProjects,
        inAcceptanceProjects,
        completedProjects,
      },
      people: {
        totalActiveEmployees,
        departments: {
          sales: salesCount,
          dev: devCount,
          seo: seoCount,
          operation: operationCount,
        },
        totalTeams,
        teamsBreakdown,
        totalKpiPoints,
        commissions,
      },
      payrollExpense: {
        payrollPeriod: currentPayroll,
        expensesInPeriod,
      },
      alerts: {
        pendingOrders,
        pendingPayments,
        blockedProjects,
        overdueInstallments,
      },
    };
  }
}
