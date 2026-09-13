import { fetchWithAuth } from './auth';

export interface CommissionItem {
  id: string;
  policy_id: string;
  order_item_id: string;
  service_period_id: string | null;
  beneficiary_employee_id: string;
  beneficiary_name: string;
  commission_type: 'SALE' | 'PROJECT_DELIVERY' | 'TEAM_OVERRIDE';
  rate_snapshot: number;
  commission_base: number;
  calculated_amount: number;
  approved_amount: number | null;
  decision_reason: string | null;
  status: 'UNEARNED' | 'RELEASED' | 'CALCULATED' | 'APPROVED' | 'ADJUSTED' | 'REJECTED' | 'IN_PAYROLL' | 'PAID';
  created_at: string;
  policy_name: string | null;
}

export interface CommissionDetail extends CommissionItem {
  approved_by_employee_id: string | null;
  updated_at: string;
  sources: Array<{
    id: string;
    source_type: string;
    source_id: string;
    source_amount: number;
  }>;
}

export async function fetchCommissions(params?: {
  page?: number;
  limit?: number;
  employeeId?: string;
  commissionType?: string;
  status?: string;
}): Promise<{ data: CommissionItem[]; meta: { page: number; limit: number; total: number } }> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.employeeId) query.append('employeeId', params.employeeId);
  if (params?.commissionType) query.append('commissionType', params.commissionType);
  if (params?.status) query.append('status', params.status);

  const res = await fetchWithAuth(`/api/commissions?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch commissions');
  return res.json();
}

export async function fetchCommissionById(id: string): Promise<CommissionDetail> {
  const res = await fetchWithAuth(`/api/commissions/${id}`);
  if (!res.ok) throw new Error('Failed to fetch commission detail');
  return res.json();
}

export async function approveCommission(id: string): Promise<CommissionItem> {
  const res = await fetchWithAuth(`/api/commissions/${id}/approve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to approve commission');
  }
  return res.json();
}

export async function adjustCommission(id: string, approvedAmount: number, reason?: string): Promise<CommissionItem> {
  const res = await fetchWithAuth(`/api/commissions/${id}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedAmount, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to adjust commission');
  }
  return res.json();
}

export async function rejectCommission(id: string, reason?: string): Promise<CommissionItem> {
  const res = await fetchWithAuth(`/api/commissions/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reject commission');
  }
  return res.json();
}
