import { fetchWithAuth } from './auth';

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

export interface ReceivableItem {
  installmentId: string;
  installmentNumber: number;
  dueDate: string;
  overdueDays: number;
  status: string;
  grossAmountDue: number;
  allocatedPaid: number;
  remainingAmount: number;
  orderId: string;
  orderCode: string;
  accountId: string;
  companyName: string;
  contactName: string | null;
  serviceName: string;
}

export interface CashflowItem {
  id: string;
  direction: 'IN' | 'OUT';
  transactionDate: string;
  sourceType: string;
  referenceCode: string;
  amount: number;
  actorName: string | null;
  note: string | null;
  evidenceUrl: string | null;
  linkUrl: string;
  accountingStatus: string;
}

export async function getFinanceOverviewApi(period?: string): Promise<FinanceOverviewData> {
  const url = period ? `/api/finance/overview?period=${period}` : '/api/finance/overview';
  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Không thể tải tổng quan tài chính');
  }
  return await response.json();
}

export async function getReceivablesApi(params: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: ReceivableItem[]; meta: { page: number; limit: number; total: number } }> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await fetchWithAuth(`/api/finance/receivables?${query.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Không thể tải danh sách công nợ phải thu');
  }
  return await response.json();
}

export async function getCashflowApi(params: {
  type?: 'IN' | 'OUT' | 'ALL';
  period?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: CashflowItem[]; meta: { page: number; limit: number; total: number } }> {
  const query = new URLSearchParams();
  if (params.type) query.set('type', params.type);
  if (params.period) query.set('period', params.period);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await fetchWithAuth(`/api/finance/cashflow?${query.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Không thể tải sổ cái dòng tiền');
  }
  return await response.json();
}
