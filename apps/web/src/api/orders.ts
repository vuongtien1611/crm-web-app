import { fetchWithAuth } from './auth';

export interface OrderItemRequirement {
  id: string;
  field_key_snapshot: string;
  label_snapshot: string;
  field_type_snapshot: string;
  options_snapshot?: string;
  value_text?: string;
  value_json?: any;
}

export interface ChangeRequest {
  id: string;
  order_item_id: string;
  change_type: 'SCOPE_CHANGE' | 'PRICE_CHANGE' | 'CANCELLATION';
  description: string;
  amount_delta: number;
  days_delta: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  requested_by_name?: string;
  approved_by_name?: string;
  approved_at?: string;
  implemented_at?: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  deal_id?: string;
  deal_name?: string;
  closing_sale_id: string;
  closing_sale_name?: string;
  closing_sale_code?: string;
  service_id: string;
  service_name?: string;
  requirement_template_id: string;
  requirement_template_version: number;
  original_price: number;
  discount_amount: number;
  net_service_value: number;
  vat_amount: number;
  start_date?: string | null;
  end_date?: string | null;
  approval_status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  delivery_status: 'PENDING' | 'WAITING_DEPENDENCY' | 'READY_FOR_ASSIGNMENT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  payment_status: 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID';
  created_at: string;
  requirements?: OrderItemRequirement[];
  changeRequests?: ChangeRequest[];
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name?: string;
  payload_before_sanitized?: string;
  payload_after_sanitized?: string;
  created_at: string;
}

export interface OrderDetail {
  id: string;
  account_id: string;
  company_name: string;
  tax_code?: string;
  account_phone?: string;
  account_email?: string;
  primary_contact_id?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  order_code: string;
  order_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  workflow_status: 'DRAFT' | 'PENDING_APPROVAL' | 'NEED_MORE_INFO' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  auditLogs?: AuditLog[];
}

export interface OrderListItem {
  id: string;
  account_id: string;
  company_name: string;
  primary_contact_name?: string;
  order_code: string;
  order_name?: string;
  workflow_status: string;
  itemCount: number;
  totalNetValue: number;
  created_at: string;
}

export interface FetchOrdersParams {
  page?: number;
  limit?: number;
  q?: string;
  workflowStatus?: string;
}

export async function fetchOrdersApi(params: FetchOrdersParams) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  if (params.workflowStatus) query.set('workflowStatus', params.workflowStatus);

  const res = await fetchWithAuth(`/api/orders?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchOrderByIdApi(id: string): Promise<OrderDetail> {
  const res = await fetchWithAuth(`/api/orders/${id}`);
  if (!res.ok) throw new Error('Failed to fetch order detail');
  return res.json();
}

export async function submitOrderApi(id: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/submit`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to submit order');
  }
  return res.json();
}

export async function approveOrderApi(id: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/approve`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to approve order');
  }
  return res.json();
}

export async function requestMoreInfoApi(id: string, note: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/request-more-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to request more info');
  }
  return res.json();
}

export async function resubmitOrderApi(id: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/resubmit`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to resubmit order');
  }
  return res.json();
}

export async function rejectOrderApi(id: string, reason: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reject order');
  }
  return res.json();
}

export async function cancelOrderApi(id: string, reason?: string) {
  const res = await fetchWithAuth(`/api/orders/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to cancel order');
  }
  return res.json();
}

export async function fetchSalesRepsApi(): Promise<any[]> {
  const res = await fetchWithAuth('/api/orders/sales-reps');
  if (!res.ok) return [];
  return res.json();
}

export async function addOrderItemApi(
  orderId: string,
  data: {
    serviceId: number | string;
    closingSaleId: number | string;
    originalPrice: number;
    discountAmount?: number;
    dealId?: string | number;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const res = await fetchWithAuth(`/api/orders/${orderId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: Number(data.serviceId),
      closingSaleId: Number(data.closingSaleId),
      originalPrice: Number(data.originalPrice),
      discountAmount: Number(data.discountAmount || 0),
      ...(data.dealId ? { dealId: String(data.dealId) } : {}),
      ...(data.startDate ? { startDate: data.startDate } : {}),
      ...(data.endDate ? { endDate: data.endDate } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to add order item');
  }
  return res.json();
}

export async function updateOrderItemApi(
  itemId: string,
  data: {
    serviceId?: number | string;
    closingSaleId?: number | string;
    originalPrice?: number;
    discountAmount?: number;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const res = await fetchWithAuth(`/api/order-items/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Cập nhật mục dịch vụ thất bại');
  }
  return res.json();
}

export async function updateOrderApi(
  orderId: string,
  data: {
    orderName?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const res = await fetchWithAuth(`/api/orders/${orderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Cập nhật đơn hàng thất bại');
  }
  return res.json();
}

export async function submitOrderItemApi(id: string) {
  const res = await fetchWithAuth(`/api/order-items/${id}/submit`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to submit item');
  }
  return res.json();
}

export async function approveOrderItemApi(id: string) {
  const res = await fetchWithAuth(`/api/order-items/${id}/approve`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to approve item');
  }
  return res.json();
}

export async function rejectOrderItemApi(id: string) {
  const res = await fetchWithAuth(`/api/order-items/${id}/reject`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reject item');
  }
  return res.json();
}

export async function cancelOrderItemApi(id: string) {
  const res = await fetchWithAuth(`/api/order-items/${id}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to cancel item');
  }
  return res.json();
}

export async function createChangeRequestApi(
  itemId: string,
  data: { changeType: string; description: string; amountDelta?: number; daysDelta?: number },
) {
  const res = await fetchWithAuth(`/api/order-items/${itemId}/change-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create change request');
  }
  return res.json();
}

export async function approveChangeRequestApi(id: string) {
  const res = await fetchWithAuth(`/api/change-requests/${id}/approve`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to approve change request');
  }
  return res.json();
}

export async function rejectChangeRequestApi(id: string) {
  const res = await fetchWithAuth(`/api/change-requests/${id}/reject`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to reject change request');
  }
  return res.json();
}

export async function implementChangeRequestApi(id: string) {
  const res = await fetchWithAuth(`/api/change-requests/${id}/implement`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to implement change request');
  }
  return res.json();
}
