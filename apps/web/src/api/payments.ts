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

export interface AllocatableInstallment {
  installment_id: string;
  installment_number: number;
  due_date: string;
  gross_amount_due: number;
  remaining_amount: number;
  order_item_id: string;
  service_name: string;
  order_code: string;
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

export const createSingleInstallmentPlanApi = async (orderItemId: string, dueDate: string) => {
  const res = await fetchWithAuth(buildApiUrl(
    `/payments/order-items/${orderItemId}/payment-plan/single-installment`,
  ), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dueDate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tạo đợt thanh toán');
  }
  return res.json();
};

export const getAllocatableInstallmentsApi = async (paymentId: string): Promise<{
  paymentRemaining: number;
  installments: AllocatableInstallment[];
}> => {
  const res = await fetchWithAuth(buildApiUrl(`/payments/${paymentId}/allocatable-installments`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải các đợt thanh toán còn dư nợ');
  }
  return res.json();
};

export const allocateConfirmedPaymentApi = async (
  paymentId: string,
  data: { installmentId: string; grossAllocatedAmount: number },
) => {
  const res = await fetchWithAuth(buildApiUrl(`/payments/${paymentId}/allocations`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể phân bổ khoản thanh toán');
  }
  return res.json();
};

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
