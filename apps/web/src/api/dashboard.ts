import { fetchWithAuth, buildApiUrl } from './auth';
import { FinanceOverviewData } from './finance';

export interface ExecutiveDashboardData {
  period: string;
  financialOverview?: FinanceOverviewData;
  cashReceivable: {
    grossCashConfirmedPeriod: number;
    grossCashConfirmedTotal: number;
    accountsReceivable: number;
    paymentPendingConfirmationCount: number;
    paymentPendingConfirmationAmount: number;
    installmentsOverdueCount: number;
    installmentsOverdueAmount: number;
  };
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

export async function getExecutiveDashboardApi(
  period?: string,
): Promise<ExecutiveDashboardData> {
  const query = period ? `?period=${period}` : '';
  const res = await fetchWithAuth(buildApiUrl(`/dashboard/executive${query}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải dữ liệu Executive Dashboard');
  }
  return res.json();
}
