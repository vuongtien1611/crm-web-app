import { fetchWithAuth, buildApiUrl } from './auth';

export interface AllocationItem {
  id?: string;
  paymentId?: string;
  installmentId: string;
  grossAllocatedAmount: number;
  vatAllocatedAmount?: number;
  serviceAmount?: number;
  netEligibleAmount?: number;
  closingSaleId?: string;
}

export interface PaymentProjectItem {
  id: string | number;
  name: string;
}

export interface PaymentItem {
  id: string;
  payment_code: string;
  gross_cash_amount: number;
  payment_method: 'BANK_TRANSFER' | 'CASH' | 'CREDIT_CARD' | 'E_WALLET';
  evidence_url?: string;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED';
  created_by_employee_id: string;
  confirmed_by_employee_id?: string;
  confirmed_at?: string;
  created_at: string;
  allocations?: AllocationItem[];
  projects?: PaymentProjectItem[];
}

export const getPaymentsApi = async (params?: { page?: number; limit?: number; status?: string }) => {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.status) query.append('status', params.status);

  const res = await fetchWithAuth(buildApiUrl(`/payments?${query.toString()}`));
  if (!res.ok) throw new Error('Failed to fetch payments');
  return res.json();
};

export const getGrossCashApi = async () => {
  const res = await fetchWithAuth(buildApiUrl('/payments/gross-cash'));
  if (!res.ok) throw new Error('Failed to fetch gross cash');
  return res.json();
};

export const getPaymentByIdApi = async (id: string) => {
  const res = await fetchWithAuth(buildApiUrl(`/payments/${id}`));
  if (!res.ok) throw new Error('Failed to fetch payment detail');
  return res.json();
};

export const createPaymentApi = async (data: {
  grossCashAmount: number;
  paymentMethod: string;
  evidenceUrl?: string;
  paymentCode?: string;
  allocations?: AllocationItem[];
}) => {
  const numericGrossCashAmount = Number(data.grossCashAmount);
  if (!Number.isFinite(numericGrossCashAmount) || numericGrossCashAmount < 0.01) {
    throw new Error('Số tiền thanh toán không hợp lệ (phải là số lớn hơn 0)');
  }

  const payload = {
    grossCashAmount: numericGrossCashAmount,
    paymentMethod: data.paymentMethod,
    evidenceUrl: data.evidenceUrl || undefined,
    paymentCode: data.paymentCode || undefined,
    allocations: data.allocations,
  };

  const res = await fetchWithAuth(buildApiUrl('/payments'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create payment');
  }
  return res.json();
};

export const confirmPaymentApi = async (id: string, data?: { allocations?: AllocationItem[] }) => {
  const res = await fetchWithAuth(buildApiUrl(`/payments/${id}/confirm`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to confirm payment');
  }
  return res.json();
};

export const rejectPaymentApi = async (id: string, data?: { reason?: string }) => {
  const res = await fetchWithAuth(buildApiUrl(`/payments/${id}/reject`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reject payment');
  }
  return res.json();
};
