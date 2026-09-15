import { Injectable } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';

export interface FinanceOverviewData {
  period: string;
  cashBalance: {
    status: 'NOT_CONFIGURED';
    currentBalance: null;
    openingBalance: null;
    note: string;
  };
  netCashFlow: {
    status: 'NOT_AVAILABLE';
    amount: null;
    note: string;
  };
  confirmedCashIn: {
    periodAmount: number;
    totalAmount: number;
  };
  receivables: {
    total: number;
    notDue: number;
    nearDue7Days: number;
    overdue: number;
    overdueCount: number;
    topDebtors: Array<{
      accountId: string;
      companyName: string;
      totalDebt: number;
      overdueDebt: number;
      ordersCount: number;
    }>;
  };
  expenses: {
    totalInPeriod: number;
    approvedInPeriod: number;
    pendingInPeriod: number;
    approvedCount: number;
    pendingCount: number;
    categoryBreakdown: Array<{
      categoryId: string;
      categoryCode: string;
      categoryName: string;
      amount: number;
      percent: number;
    }>;
    topExpenses: Array<{
      id: string;
      amount: number;
      categoryName: string;
      expenseDate: string;
      note: string | null;
      isApproved: boolean;
      approverName: string | null;
    }>;
  };
  pendingPayments: {
    count: number;
    amount: number;
  };
}

@Injectable()
export class FinanceService {
  constructor(private readonly kysely: KyselyService) {}

  async getOverview(periodParam?: string): Promise<FinanceOverviewData> {
    const db = this.kysely.db;
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? periodParam : currentPeriod;

    // 1. CONFIRMED CASH IN
    const cashPeriodRes = await db
      .selectFrom('payments')
      .select(sql<number>`coalesce(sum(gross_cash_amount), 0)`.as('total'))
      .where('status', '=', 'CONFIRMED')
      .where(sql`to_char(coalesce(confirmed_at, created_at), 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();
    const confirmedCashInPeriod = Number(cashPeriodRes?.total || 0);

    const cashTotalRes = await db
      .selectFrom('payments')
      .select(sql<number>`coalesce(sum(gross_cash_amount), 0)`.as('total'))
      .where('status', '=', 'CONFIRMED')
      .executeTakeFirst();
    const confirmedCashInTotal = Number(cashTotalRes?.total || 0);

    // 2. RECEIVABLES (AR)
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
    const totalReceivables = Number(arRes.rows[0]?.ar || 0);

    // Overdue Installments
    const overdueRes = await db
      .selectFrom('payment_installments')
      .select([
        sql<number>`count(id)`.as('count'),
        sql<number>`coalesce(sum(gross_amount_due), 0)`.as('amount'),
      ])
      .where((eb) =>
        eb.or([
          eb('status', '=', 'OVERDUE'),
          eb.and([
            eb('status', 'in', ['PENDING', 'PARTIALLY_PAID']),
            eb('due_date', '<', sql<Date>`CURRENT_DATE`),
          ]),
        ]),
      )
      .executeTakeFirst();
    const overdueAmount = Number(overdueRes?.amount || 0);
    const overdueCount = Number(overdueRes?.count || 0);

    // Near Due (within next 7 days)
    const nearDueRes = await db
      .selectFrom('payment_installments')
      .select(sql<number>`coalesce(sum(gross_amount_due), 0)`.as('amount'))
      .where('status', 'in', ['PENDING', 'PARTIALLY_PAID'])
      .where('due_date', '>=', sql<Date>`CURRENT_DATE`)
      .where('due_date', '<=', sql<Date>`CURRENT_DATE + INTERVAL '7 days'`)
      .executeTakeFirst();
    const nearDue7DaysAmount = Number(nearDueRes?.amount || 0);

    // Not Due (after 7 days or remaining)
    const notDueAmount = Math.max(0, totalReceivables - overdueAmount - nearDue7DaysAmount);

    // Top Debtors
    const topDebtorsRaw = await sql<{
      account_id: string;
      company_name: string;
      total_debt: string;
      overdue_debt: string;
      orders_count: string;
    }>`
      SELECT 
        a.id AS account_id,
        a.company_name,
        coalesce(sum(pi.gross_amount_due), 0) AS total_debt,
        coalesce(sum(CASE WHEN pi.due_date < CURRENT_DATE OR pi.status = 'OVERDUE' THEN pi.gross_amount_due ELSE 0 END), 0) AS overdue_debt,
        count(DISTINCT o.id) AS orders_count
      FROM accounts a
      INNER JOIN orders o ON o.account_id = a.id
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN order_item_payment_plans opp ON opp.order_item_id = oi.id AND opp.status = 'APPROVED'
      INNER JOIN payment_installments pi ON pi.payment_plan_id = opp.id
      WHERE pi.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
      GROUP BY a.id, a.company_name
      ORDER BY total_debt DESC
      LIMIT 5
    `.execute(db);

    const topDebtors = (topDebtorsRaw.rows || []).map((r) => ({
      accountId: String(r.account_id),
      companyName: r.company_name,
      totalDebt: Number(r.total_debt),
      overdueDebt: Number(r.overdue_debt),
      ordersCount: Number(r.orders_count),
    }));

    // Pending payments
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

    // 3. EXPENSES IN PERIOD
    const expensesPeriodRes = await db
      .selectFrom('expenses')
      .select([
        sql<number>`count(id)`.as('total_count'),
        sql<number>`coalesce(sum(amount), 0)`.as('total_amount'),
        sql<number>`count(case when approved_by_employee_id is not null then 1 end)`.as('approved_count'),
        sql<number>`coalesce(sum(case when approved_by_employee_id is not null then amount else 0 end), 0)`.as('approved_amount'),
        sql<number>`count(case when approved_by_employee_id is null then 1 end)`.as('pending_count'),
        sql<number>`coalesce(sum(case when approved_by_employee_id is null then amount else 0 end), 0)`.as('pending_amount'),
      ])
      .where(sql`to_char(expense_date, 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();

    const totalExpensesInPeriod = Number(expensesPeriodRes?.total_amount || 0);
    const approvedExpensesInPeriod = Number(expensesPeriodRes?.approved_amount || 0);
    const pendingExpensesInPeriod = Number(expensesPeriodRes?.pending_amount || 0);
    const approvedCount = Number(expensesPeriodRes?.approved_count || 0);
    const pendingCount = Number(expensesPeriodRes?.pending_count || 0);

    // Expense breakdown by category in period
    const categoriesRaw = await db
      .selectFrom('expenses as e')
      .innerJoin('expense_categories as ec', 'ec.id', 'e.category_id')
      .select([
        'ec.id as category_id',
        'ec.code as category_code',
        'ec.name as category_name',
        sql<number>`coalesce(sum(e.amount), 0)`.as('category_amount'),
      ])
      .where(sql`to_char(e.expense_date, 'YYYY-MM') = ${period}` as any)
      .groupBy(['ec.id', 'ec.code', 'ec.name'])
      .orderBy('category_amount', 'desc')
      .execute();

    const categoryBreakdown = categoriesRaw.map((c) => {
      const amt = Number(c.category_amount);
      const pct = totalExpensesInPeriod > 0 ? (amt / totalExpensesInPeriod) * 100 : 0;
      return {
        categoryId: String(c.category_id),
        categoryCode: c.category_code,
        categoryName: c.category_name,
        amount: amt,
        percent: Math.round(pct * 10) / 10,
      };
    });

    // Top 5 expenses in period
    const topExpensesRaw = await db
      .selectFrom('expenses as e')
      .innerJoin('expense_categories as ec', 'ec.id', 'e.category_id')
      .leftJoin('employees as emp', 'emp.id', 'e.approved_by_employee_id')
      .select([
        'e.id',
        'e.amount',
        'ec.name as category_name',
        'e.expense_date',
        'e.note',
        'e.approved_by_employee_id',
        'emp.full_name as approver_name',
      ])
      .where(sql`to_char(e.expense_date, 'YYYY-MM') = ${period}` as any)
      .orderBy('e.amount', 'desc')
      .limit(5)
      .execute();

    const topExpenses = topExpensesRaw.map((te) => ({
      id: String(te.id),
      amount: Number(te.amount),
      categoryName: te.category_name,
      expenseDate: te.expense_date ? new Date(te.expense_date).toISOString().split('T')[0] : '',
      note: te.note || null,
      isApproved: te.approved_by_employee_id !== null,
      approverName: te.approver_name || null,
    }));

    return {
      period,
      cashBalance: {
        status: 'NOT_CONFIGURED',
        currentBalance: null,
        openingBalance: null,
        note: 'Chưa cấu hình số dư đầu kỳ (SCHEMA GAP: Thiếu bảng financial_accounts/cash_ledger)',
      },
      netCashFlow: {
        status: 'NOT_AVAILABLE',
        amount: null,
        note: 'Chưa đủ dữ liệu thực chi xuất quỹ (SCHEMA GAP: expenses chưa có payment_status/paid_at)',
      },
      confirmedCashIn: {
        periodAmount: confirmedCashInPeriod,
        totalAmount: confirmedCashInTotal,
      },
      receivables: {
        total: totalReceivables,
        notDue: notDueAmount,
        nearDue7Days: nearDue7DaysAmount,
        overdue: overdueAmount,
        overdueCount,
        topDebtors,
      },
      expenses: {
        totalInPeriod: totalExpensesInPeriod,
        approvedInPeriod: approvedExpensesInPeriod,
        pendingInPeriod: pendingExpensesInPeriod,
        approvedCount,
        pendingCount,
        categoryBreakdown,
        topExpenses,
      },
      pendingPayments: {
        count: paymentPendingConfirmationCount,
        amount: paymentPendingConfirmationAmount,
      },
    };
  }

  // --------------------------------------------------
  // RECEIVABLES LIST (DRILLDOWN)
  // --------------------------------------------------
  async getReceivables(query: { status?: string; search?: string; page?: number; limit?: number }) {
    const db = this.kysely.db;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const offset = (page - 1) * limit;

    const rawRows = await sql<{
      installment_id: string;
      installment_number: number;
      due_date: string;
      installment_status: string;
      gross_amount_due: string;
      allocated_paid: string;
      remaining_amount: string;
      overdue_days: number;
      order_id: string;
      order_code: string;
      account_id: string;
      company_name: string;
      contact_name: string | null;
      service_name: string;
    }>`
      WITH approved_plans AS (
        SELECT id, order_item_id FROM order_item_payment_plans WHERE status = 'APPROVED'
      ),
      allocations_agg AS (
        SELECT 
          pa.installment_id,
          coalesce(sum(pa.gross_allocated_amount), 0) AS allocated_paid
        FROM payment_allocations pa
        INNER JOIN payments p ON p.id = pa.payment_id
        WHERE p.status = 'CONFIRMED'
        GROUP BY pa.installment_id
      )
      SELECT 
        pi.id AS installment_id,
        pi.installment_number,
        pi.due_date,
        pi.status AS installment_status,
        pi.gross_amount_due,
        coalesce(al.allocated_paid, 0) AS allocated_paid,
        greatest(0, pi.gross_amount_due - coalesce(al.allocated_paid, 0)) AS remaining_amount,
        greatest(0, CURRENT_DATE - pi.due_date) AS overdue_days,
        o.id AS order_id,
        o.order_code,
        a.id AS account_id,
        a.company_name,
        c.full_name AS contact_name,
        s.name AS service_name
      FROM payment_installments pi
      INNER JOIN approved_plans ap ON ap.id = pi.payment_plan_id
      INNER JOIN order_items oi ON oi.id = ap.order_item_id
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN accounts a ON a.id = o.account_id
      LEFT JOIN contacts c ON c.account_id = a.id
      INNER JOIN services s ON s.id = oi.service_id
      LEFT JOIN allocations_agg al ON al.installment_id = pi.id
      WHERE (pi.gross_amount_due - coalesce(al.allocated_paid, 0)) > 0
      ${
        query.status === 'OVERDUE'
          ? sql`AND (pi.status = 'OVERDUE' OR pi.due_date < CURRENT_DATE)`
          : query.status === 'NEAR_DUE'
          ? sql`AND pi.due_date >= CURRENT_DATE AND pi.due_date <= CURRENT_DATE + INTERVAL '7 days'`
          : query.status === 'NOT_DUE'
          ? sql`AND pi.due_date > CURRENT_DATE + INTERVAL '7 days'`
          : sql``
      }
      ${
        query.search
          ? sql`AND (a.company_name ILIKE ${'%' + query.search + '%'} OR o.order_code ILIKE ${'%' + query.search + '%'})`
          : sql``
      }
      ORDER BY pi.due_date ASC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);

    const countRes = await sql<{ total: string }>`
      WITH approved_plans AS (
        SELECT id, order_item_id FROM order_item_payment_plans WHERE status = 'APPROVED'
      ),
      allocations_agg AS (
        SELECT 
          pa.installment_id,
          coalesce(sum(pa.gross_allocated_amount), 0) AS allocated_paid
        FROM payment_allocations pa
        INNER JOIN payments p ON p.id = pa.payment_id
        WHERE p.status = 'CONFIRMED'
        GROUP BY pa.installment_id
      )
      SELECT count(pi.id) AS total
      FROM payment_installments pi
      INNER JOIN approved_plans ap ON ap.id = pi.payment_plan_id
      INNER JOIN order_items oi ON oi.id = ap.order_item_id
      INNER JOIN orders o ON o.id = oi.order_id
      INNER JOIN accounts a ON a.id = o.account_id
      LEFT JOIN allocations_agg al ON al.installment_id = pi.id
      WHERE (pi.gross_amount_due - coalesce(al.allocated_paid, 0)) > 0
      ${
        query.status === 'OVERDUE'
          ? sql`AND (pi.status = 'OVERDUE' OR pi.due_date < CURRENT_DATE)`
          : query.status === 'NEAR_DUE'
          ? sql`AND pi.due_date >= CURRENT_DATE AND pi.due_date <= CURRENT_DATE + INTERVAL '7 days'`
          : query.status === 'NOT_DUE'
          ? sql`AND pi.due_date > CURRENT_DATE + INTERVAL '7 days'`
          : sql``
      }
      ${
        query.search
          ? sql`AND (a.company_name ILIKE ${'%' + query.search + '%'} OR o.order_code ILIKE ${'%' + query.search + '%'})`
          : sql``
      }
    `.execute(db);

    const items = (rawRows.rows || []).map((r) => {
      const isOverdue = r.installment_status === 'OVERDUE' || Number(r.overdue_days) > 0;
      return {
        installmentId: String(r.installment_id),
        installmentNumber: Number(r.installment_number),
        dueDate: r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : '',
        overdueDays: Number(r.overdue_days || 0),
        status: isOverdue ? 'OVERDUE' : r.installment_status,
        grossAmountDue: Number(r.gross_amount_due),
        allocatedPaid: Number(r.allocated_paid),
        remainingAmount: Number(r.remaining_amount),
        orderId: String(r.order_id),
        orderCode: r.order_code,
        accountId: String(r.account_id),
        companyName: r.company_name,
        contactName: r.contact_name || null,
        serviceName: r.service_name,
      };
    });

    return {
      data: items,
      meta: {
        page,
        limit,
        total: Number(countRes.rows[0]?.total || 0),
      },
    };
  }

  // --------------------------------------------------
  // CASHFLOW JOURNAL (DRILLDOWN)
  // --------------------------------------------------
  async getCashflow(query: { type?: 'IN' | 'OUT' | 'ALL'; period?: string; page?: number; limit?: number }) {
    const db = this.kysely.db;
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 25));
    const offset = (page - 1) * limit;
    const period = query.period;

    const rows = await sql<{
      id: string;
      direction: 'IN' | 'OUT';
      transaction_date: string;
      source_type: string;
      reference_code: string;
      amount: string;
      actor_name: string | null;
      note: string | null;
      evidence_url: string | null;
      link_url: string;
      accounting_status: string;
    }>`
      WITH in_flows AS (
        SELECT 
          p.id AS id,
          'IN' AS direction,
          coalesce(p.confirmed_at, p.created_at) AS transaction_date,
          'CUSTOMER_PAYMENT' AS source_type,
          p.payment_code AS reference_code,
          p.gross_cash_amount AS amount,
          emp.full_name AS actor_name,
          p.payment_method AS note,
          p.evidence_url AS evidence_url,
          '/payments/' || p.id AS link_url,
          'CONFIRMED_IN' AS accounting_status
        FROM payments p
        LEFT JOIN employees emp ON emp.id = p.created_by_employee_id
        WHERE p.status = 'CONFIRMED'
        ${period ? sql`AND to_char(coalesce(p.confirmed_at, p.created_at), 'YYYY-MM') = ${period}` : sql``}
      ),
      out_flows AS (
        SELECT 
          e.id AS id,
          'OUT' AS direction,
          e.expense_date::timestamptz AS transaction_date,
          e.source_type AS source_type,
          'EXP-' || e.id AS reference_code,
          e.amount AS amount,
          emp.full_name AS actor_name,
          e.note AS note,
          NULL AS evidence_url,
          '/expenses/' || e.id AS link_url,
          CASE WHEN e.approved_by_employee_id IS NOT NULL THEN 'APPROVED_EXPENSE' ELSE 'PENDING_EXPENSE' END AS accounting_status
        FROM expenses e
        LEFT JOIN employees emp ON emp.id = coalesce(e.approved_by_employee_id, e.created_by_employee_id)
        ${
          period
            ? sql`WHERE to_char(e.expense_date, 'YYYY-MM') = ${period}`
            : sql``
        }
      ),
      combined AS (
        ${
          query.type === 'IN'
            ? sql`SELECT * FROM in_flows`
            : query.type === 'OUT'
            ? sql`SELECT * FROM out_flows`
            : sql`SELECT * FROM in_flows UNION ALL SELECT * FROM out_flows`
        }
      )
      SELECT * FROM combined
      ORDER BY transaction_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `.execute(db);

    const countRes = await sql<{ total: string }>`
      WITH in_flows AS (
        SELECT p.id FROM payments p
        WHERE p.status = 'CONFIRMED'
        ${period ? sql`AND to_char(coalesce(p.confirmed_at, p.created_at), 'YYYY-MM') = ${period}` : sql``}
      ),
      out_flows AS (
        SELECT e.id FROM expenses e
        ${period ? sql`WHERE to_char(e.expense_date, 'YYYY-MM') = ${period}` : sql``}
      ),
      combined AS (
        ${
          query.type === 'IN'
            ? sql`SELECT id FROM in_flows`
            : query.type === 'OUT'
            ? sql`SELECT id FROM out_flows`
            : sql`SELECT id FROM in_flows UNION ALL SELECT id FROM out_flows`
        }
      )
      SELECT count(*) AS total FROM combined
    `.execute(db);

    const items = (rows.rows || []).map((r) => ({
      id: String(r.id),
      direction: r.direction,
      transactionDate: r.transaction_date ? new Date(r.transaction_date).toISOString() : '',
      sourceType: r.source_type,
      referenceCode: r.reference_code,
      amount: Number(r.amount),
      actorName: r.actor_name || null,
      note: r.note || null,
      evidenceUrl: r.evidence_url || null,
      linkUrl: r.link_url,
      accountingStatus: r.accounting_status,
    }));

    return {
      data: items,
      meta: {
        page,
        limit,
        total: Number(countRes.rows[0]?.total || 0),
      },
    };
  }
}
