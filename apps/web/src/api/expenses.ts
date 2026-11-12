import { fetchWithAuth, buildApiUrl } from './auth';

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  created_at: string;
}

export type ExpenseSourceType = 'PAYROLL' | 'DIRECT_PURCHASE' | 'ADS' | 'INFRASTRUCTURE';

export interface ExpenseItem {
  id: string;
  category_id: string;
  category_code: string;
  category_name: string;
  amount: number | string;
  expense_date: string;
  source_type: ExpenseSourceType;
  source_payroll_period_id: string | null;
  created_by_employee_id: string;
  approved_by_employee_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ExpenseListResponse {
  data: ExpenseItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CreateManualExpensePayload {
  category_id: string;
  amount: number;
  expense_date: string;
  source_type: 'DIRECT_PURCHASE' | 'ADS' | 'INFRASTRUCTURE';
  note?: string;
}

export interface ProcessPayrollExpensePayload {
  payroll_period_id: string;
  note?: string;
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const res = await fetchWithAuth(buildApiUrl('/expenses/categories'));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh mục chi phí');
  }
  return res.json();
}

export async function getExpenses(params?: {
  page?: number;
  limit?: number;
  sourceType?: string;
  categoryId?: string;
}): Promise<ExpenseListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.sourceType && params.sourceType !== 'ALL') query.set('sourceType', params.sourceType);
  if (params?.categoryId && params.categoryId !== 'ALL') query.set('categoryId', params.categoryId);

  const res = await fetchWithAuth(buildApiUrl(`/expenses?${query.toString()}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh sách chi phí');
  }
  return res.json();
}

export async function getExpenseById(id: string): Promise<ExpenseItem> {
  const res = await fetchWithAuth(buildApiUrl(`/expenses/${id}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Không thể tải chi tiết khoản chi #${id}`);
  }
  return res.json();
}

export async function createManualExpense(payload: CreateManualExpensePayload): Promise<ExpenseItem> {
  const res = await fetchWithAuth(buildApiUrl('/expenses/manual'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tạo khoản chi');
  }
  return res.json();
}

export async function createExpenseFromPayroll(payload: ProcessPayrollExpensePayload): Promise<ExpenseItem> {
  const res = await fetchWithAuth(buildApiUrl('/expenses/from-payroll'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể hạch toán chi phí từ bảng lương');
  }
  return res.json();
}
