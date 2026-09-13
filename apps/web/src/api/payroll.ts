import { fetchWithAuth } from './auth';

export interface PayrollPeriod {
  id: string;
  period_key: string;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'CALCULATING' | 'REVIEW' | 'APPROVED' | 'LOCKED';
  locked_at?: string | null;
  locked_by_employee_id?: string | null;
  employee_count?: number;
  total_gross_payroll?: number;
  created_at: string;
  updated_at: string;
  stats?: {
    employee_count: number;
    total_base_salary: number;
    total_commissions: number;
    total_kpi_bonuses: number;
    total_team_overrides: number;
    total_adjustments: number;
    total_net_salary: number;
  };
}

export interface EmployeePayrollItem {
  id: string;
  payroll_period_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  base_salary: number;
  released_commission_amount: number;
  kpi_bonus_amount: number;
  team_override_amount: number;
  adjustment_amount: number;
  net_salary_amount: number;
  created_at: string;
}

export interface PayrollItemLine {
  id: string;
  payroll_id: string;
  item_type: string;
  amount: number;
  description: string;
  created_at: string;
}

export interface PayrollAdjustment {
  id: string;
  target_payroll_id: string;
  origin_payroll_period_id: string;
  amount: number;
  reason: string;
  created_by_employee_id: string;
  created_at: string;
}

export interface EmployeePayrollDetail extends EmployeePayrollItem {
  items: PayrollItemLine[];
  adjustments: PayrollAdjustment[];
}

export async function fetchPayrollPeriods(params?: { page?: number; limit?: number; status?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.status) query.append('status', params.status);

  const res = await fetchWithAuth(`/api/payroll/periods?${query.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch payroll periods');
  }
  return (await res.json()) as { data: PayrollPeriod[]; meta: { total: number; page: number; limit: number } };
}

export async function createPayrollPeriod(data: { periodKey: string; startDate: string; endDate: string }) {
  const res = await fetchWithAuth('/api/payroll/periods', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to create payroll period');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function fetchPayrollPeriodById(id: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${id}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch payroll period detail');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function calculatePayrollPeriod(id: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${id}/calculate`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to calculate payroll period');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function submitPayrollReview(id: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${id}/submit-review`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to submit payroll period for review');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function approvePayrollPeriod(id: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${id}/approve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to approve payroll period');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function lockPayrollPeriod(id: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${id}/lock`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to lock payroll period');
  }
  return (await res.json()) as PayrollPeriod;
}

export async function addPayrollAdjustment(periodId: string, data: { employeeId: string; amount: number; reason: string }) {
  const res = await fetchWithAuth(`/api/payroll/periods/${periodId}/adjustments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to add payroll adjustment');
  }
  return (await res.json()) as PayrollAdjustment;
}

export async function fetchPeriodEmployees(periodId: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${periodId}/employees`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch period employees');
  }
  return (await res.json()) as EmployeePayrollItem[];
}

export async function fetchEmployeePayrollDetail(periodId: string, employeeId: string) {
  const res = await fetchWithAuth(`/api/payroll/periods/${periodId}/employees/${employeeId}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch employee payroll detail');
  }
  return (await res.json()) as EmployeePayrollDetail;
}
