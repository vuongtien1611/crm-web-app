import { fetchWithAuth, buildApiUrl } from './auth';

export interface SubscriptionCustomer {
  id: string;
  name: string;
  taxCode?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  contactName?: string;
  contactPosition?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface SubscriptionService {
  id: string;
  name: string;
  code: string;
  description?: string;
}

export interface PeriodItem {
  id: string;
  periodIndex: number;
  periodNetValue?: number;
  vatRate?: number;
  vatAmount?: number;
  grossPayable?: number;
  startDate: string;
  endDate: string;
  executionStatus: string;
  paymentStatus: string;
  createdAt?: string;
  assignments?: Array<{
    id: string;
    employeeId: string;
    employeeCode: string;
    fullName: string;
    assignmentType: 'PRIMARY' | 'SUPPORT';
    isActive: boolean;
    assignedAt: string;
    unassignedAt: string | null;
    replacementReason: string | null;
  }>;
  acceptance?: {
    id: string;
    acceptedByName: string;
    acceptedAt: string;
    evidenceDocument: string;
    recordedByEmployeeName?: string;
  } | null;
}

export interface SubscriptionListItem {
  id: string;
  orderItemId: string;
  orderId: string;
  orderCode: string;
  customer: SubscriptionCustomer;
  service: SubscriptionService;
  netServiceValue: number;
  billingInterval: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'CANCELLED';
  totalPeriods: number;
  currentPeriod: PeriodItem | null;
  nextPeriod: {
    id: string;
    periodIndex: number;
    startDate: string;
    endDate: string;
  } | null;
  paymentStatus: string;
  acceptanceStatus: string;
  createdAt: string;
}

export interface SubscriptionDetail {
  id: string;
  orderItemId: string;
  orderId: string;
  orderCode: string;
  orderWorkflowStatus: string;
  customer: SubscriptionCustomer;
  service: SubscriptionService;
  closingSale?: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  netServiceValue: number;
  vatAmount: number;
  itemApprovalStatus: string;
  itemDeliveryStatus: string;
  itemPaymentStatus: string;
  billingInterval: string;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  status: string;
  previousSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
  periods: PeriodItem[];
  paymentPlan: {
    id: string;
    version: number;
    status: string;
    approvedAt: string | null;
    installments: Array<{
      id: string;
      installmentNumber: number;
      servicePeriodId: string | null;
      dueDate: string;
      grossAmountDue: number;
      status: string;
    }>;
  } | null;
  linkedProject: {
    id: string;
    projectName: string;
    status: string;
    progressPercent: number;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  renewalHistory: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
  }>;
}

export interface SubscriptionsListResponse {
  data: SubscriptionListItem[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalActive: number;
    totalPaused: number;
    totalExpired: number;
    totalCancelled: number;
    totalCount: number;
  };
}

export interface QuerySubscriptionsParams {
  page?: number;
  limit?: number;
  status?: string;
  billing_interval?: string;
  search?: string;
}

export interface EligibleSubscriptionOrderItem {
  orderItemId: string;
  orderCode: string;
  orderStatus: string;
  itemApprovalStatus: string;
  customerName: string;
  serviceName: string;
  serviceCode: string;
  netServiceValue: number;
}

export interface CreateSubscriptionInput {
  orderItemId: string;
  billingInterval: 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
  intervalCount: number;
  startDate: string;
  endDate?: string;
  autoRenew: boolean;
}

export async function getSubscriptionsApi(
  params?: QuerySubscriptionsParams,
): Promise<SubscriptionsListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.status) query.append('status', params.status);
  if (params?.billing_interval) query.append('billing_interval', params.billing_interval);
  if (params?.search) query.append('search', params.search);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetchWithAuth(buildApiUrl(`/subscriptions${qs}`));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Lỗi khi tải danh sách Subscription');
  }
  return response.json();
}

export async function getEligibleSubscriptionOrderItemsApi(): Promise<EligibleSubscriptionOrderItem[]> {
  const response = await fetchWithAuth(buildApiUrl('/subscriptions/eligible-order-items'));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải các mục dịch vụ đủ điều kiện');
  }
  return response.json();
}

export async function createSubscriptionApi(input: CreateSubscriptionInput): Promise<SubscriptionDetail> {
  const response = await fetchWithAuth(buildApiUrl('/subscriptions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tạo hợp đồng định kỳ');
  }
  return response.json();
}

export async function getSubscriptionByIdApi(id: string): Promise<SubscriptionDetail> {
  const response = await fetchWithAuth(buildApiUrl(`/subscriptions/${id}`));
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Lỗi khi tải thông tin Subscription #${id}`);
  }
  return response.json();
}

export async function generatePeriodsApi(id: string, count: number = 1): Promise<any> {
  const response = await fetchWithAuth(buildApiUrl(`/subscriptions/${id}/generate-periods`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Lỗi khi tạo kỳ dịch vụ');
  }
  return response.json();
}

export async function cancelSubscriptionApi(id: string): Promise<any> {
  const response = await fetchWithAuth(buildApiUrl(`/subscriptions/${id}/cancel`), {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Lỗi khi hủy Subscription');
  }
  return response.json();
}
