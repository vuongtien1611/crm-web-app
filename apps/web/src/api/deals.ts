import { fetchWithAuth } from './auth';

export interface DealItem {
  id: string;
  account_id: string;
  company_name: string;
  primary_contact_id: string | null;
  primary_contact_name: string | null;
  lead_id: string | null;
  assigned_sale_id: string;
  assigned_sale_name: string;
  assigned_sale_code: string;
  closing_sale_id: string | null;
  closing_sale_name: string | null;
  deal_name: string;
  expected_value: number;
  status: 'OPEN' | 'NEGOTIATING' | 'WON' | 'LOST';
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealDetail extends DealItem {
  tax_code: string | null;
  account_phone: string | null;
  account_email: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  closing_sale_code: string | null;
  lead_name: string | null;
  activities: Array<{
    id: string;
    activity_type: string;
    occurred_at: string;
    next_follow_up_at: string | null;
    result_note: string | null;
    employee_name: string;
  }>;
  orderItems: Array<{
    id: string;
    order_id: string;
    order_code: string;
    order_status: string;
    deal_id: string;
    closing_sale_id: string;
    closing_sale_name: string;
    service_name: string;
    net_service_value: number;
    approval_status: string;
    created_at: string;
  }>;
}

export async function getDealsApi(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  assignedSaleId?: string;
}): Promise<{ data: DealItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  if (params.assignedSaleId) query.set('assignedSaleId', params.assignedSaleId);

  const res = await fetchWithAuth(`/api/deals?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch deals');
  return res.json();
}

export async function getDealDetailApi(id: string): Promise<DealDetail> {
  const res = await fetchWithAuth(`/api/deals/${id}`);
  if (!res.ok) throw new Error('Failed to fetch deal detail');
  return res.json();
}

export async function startNegotiationApi(id: string): Promise<DealItem> {
  const res = await fetchWithAuth(`/api/deals/${id}/start-negotiation`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to start negotiation');
  }
  return res.json();
}

export async function assignDealApi(id: string, toSaleId: string): Promise<DealItem> {
  const res = await fetchWithAuth(`/api/deals/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toSaleId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to assign deal');
  }
  return res.json();
}

export async function setClosingSaleApi(id: string, closingSaleId: string): Promise<DealItem> {
  const res = await fetchWithAuth(`/api/deals/${id}/set-closing-sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ closingSaleId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to set closing sale');
  }
  return res.json();
}

export async function markWonApi(id: string): Promise<any> {
  const res = await fetchWithAuth(`/api/deals/${id}/win`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark deal as WON');
  }
  return res.json();
}

export async function markLostApi(id: string, lostReason: string): Promise<DealItem> {
  const res = await fetchWithAuth(`/api/deals/${id}/lose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lostReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark deal as LOST');
  }
  return res.json();
}

export async function updateDealApi(id: string, data: { dealName?: string; expectedValue?: number }): Promise<DealItem> {
  const res = await fetchWithAuth(`/api/deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update deal');
  }
  return res.json();
}
