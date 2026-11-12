import { fetchWithAuth } from './auth';

export interface LeadItem {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  quality: 'UNCLASSIFIED' | 'POTENTIAL' | 'NOT_POTENTIAL';
  not_potential_reason: string | null;
  status: 'NEW' | 'CALLED' | 'CONSULTED' | 'FOLLOWING' | 'CONVERTED' | 'FAILED';
  failed_reason: string | null;
  landing_page: string | null;
  external_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
  platform_id: string | null;
  platform_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  assigned_sale_id: string | null;
  assigned_sale_name: string | null;
  creator_employee_id: string | null;
  creator_employee_name: string | null;
  sales_content_id: string | null;
  content_title: string | null;
}

export interface LeadDetail extends LeadItem {
  deal?: {
    id: string;
    deal_name: string;
    status: string;
    expected_value: number;
    account_id: string;
    account_name?: string | null;
  } | null;
  assignmentHistory: Array<{
    id: string;
    assigned_at: string;
    reason: string | null;
    from_sale_name: string | null;
    to_sale_name: string;
    assigned_by_name: string | null;
  }>;
  activities: Array<{
    id: string;
    activity_type: string;
    occurred_at: string;
    next_follow_up_at: string | null;
    result_note: string | null;
    employee_name: string;
  }>;
}

export interface PlatformItem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface ChannelItem {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface SalesContentItem {
  id: string;
  content_title: string;
  url: string | null;
  creator_name: string;
  platform_name: string | null;
  channel_name: string | null;
}

export interface MarketAssignmentItem {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  platform_id: string | null;
  platform_name: string | null;
  platform_code: string | null;
  channel_id: string | null;
  channel_name: string | null;
  channel_code: string | null;
  is_active: boolean;
  assigned_at: string;
  team_name: string | null;
  team_id: string | null;
}

export interface AcquisitionOverview {
  totalLeads: number;
  unassignedLeads: number;
  convertedLeads: number;
  conversionRate: number;
  platforms: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    totalLeads: number;
    convertedLeads: number;
    conversionRate: number;
  }>;
  channels: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
    totalLeads: number;
    convertedLeads: number;
    conversionRate: number;
  }>;
}

export interface LeadDistributionItem {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  teamName: string;
  assignedLeadsCount: number;
  convertedLeadsCount: number;
  activeAssignmentsCount: number;
  conversionRate: number;
}

// --- ACQUISITION ---
export async function getMarketAssignmentsApi(): Promise<MarketAssignmentItem[]> {
  const res = await fetchWithAuth('/api/acquisition/market-assignments');
  if (!res.ok) throw new Error('Failed to fetch market assignments');
  return res.json();
}

export async function assignMarketApi(data: {
  employeeId: string;
  platformId?: string;
  channelId?: string;
}): Promise<MarketAssignmentItem> {
  const res = await fetchWithAuth('/api/acquisition/market-assignments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create market assignment');
  }
  return res.json();
}

export async function deactivateMarketAssignmentApi(id: string): Promise<any> {
  const res = await fetchWithAuth(`/api/acquisition/market-assignments/${id}/deactivate`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to deactivate market assignment');
  }
  return res.json();
}

export async function getAcquisitionOverviewApi(): Promise<AcquisitionOverview> {
  const res = await fetchWithAuth('/api/acquisition/overview');
  if (!res.ok) throw new Error('Failed to fetch acquisition overview');
  return res.json();
}

export async function getLeadDistributionApi(): Promise<LeadDistributionItem[]> {
  const res = await fetchWithAuth('/api/acquisition/distribution');
  if (!res.ok) throw new Error('Failed to fetch lead distribution');
  return res.json();
}

// --- ACQUISITION ---
export async function getPlatformsApi(): Promise<PlatformItem[]> {
  const res = await fetchWithAuth('/api/acquisition/platforms');
  if (!res.ok) throw new Error('Failed to fetch platforms');
  return res.json();
}

export async function createPlatformApi(data: { code: string; name: string }): Promise<PlatformItem> {
  const res = await fetchWithAuth('/api/acquisition/platforms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create platform');
  }
  return res.json();
}

export async function getChannelsApi(): Promise<ChannelItem[]> {
  const res = await fetchWithAuth('/api/acquisition/channels');
  if (!res.ok) throw new Error('Failed to fetch channels');
  return res.json();
}

export async function createChannelApi(data: { code: string; name: string }): Promise<ChannelItem> {
  const res = await fetchWithAuth('/api/acquisition/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create channel');
  }
  return res.json();
}

export async function getSalesContentsApi(): Promise<SalesContentItem[]> {
  const res = await fetchWithAuth('/api/acquisition/sales-contents');
  if (!res.ok) throw new Error('Failed to fetch sales contents');
  return res.json();
}

// --- LEADS ---
export async function getLeadsApi(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  quality?: string;
  unassigned?: boolean;
}): Promise<{ data: LeadItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  if (params.quality && params.quality !== 'ALL') query.set('quality', params.quality);
  if (params.unassigned) query.set('unassigned', 'true');

  const res = await fetchWithAuth(`/api/leads?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

export async function getLeadDetailApi(id: string): Promise<LeadDetail> {
  const res = await fetchWithAuth(`/api/leads/${id}`);
  if (!res.ok) throw new Error('Failed to fetch lead detail');
  return res.json();
}

export async function createLeadApi(data: any): Promise<LeadItem> {
  const res = await fetchWithAuth('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create lead');
  }
  return res.json();
}

export async function qualifyLeadApi(id: string, quality: string, notPotentialReason?: string): Promise<LeadItem> {
  const res = await fetchWithAuth(`/api/leads/${id}/qualify`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quality, notPotentialReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to qualify lead');
  }
  return res.json();
}

export async function updateLeadStatusApi(id: string, status: string): Promise<LeadItem> {
  const res = await fetchWithAuth(`/api/leads/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update status');
  }
  return res.json();
}

export async function assignLeadApi(id: string, toSaleId: string, reason?: string): Promise<LeadItem> {
  const res = await fetchWithAuth(`/api/leads/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toSaleId, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to assign lead');
  }
  return res.json();
}

export async function markLeadFailedApi(id: string, failedReason: string): Promise<LeadItem> {
  const res = await fetchWithAuth(`/api/leads/${id}/mark-failed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failedReason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark lead as failed');
  }
  return res.json();
}

export async function convertLeadToDealApi(id: string, data: any): Promise<any> {
  const res = await fetchWithAuth(`/api/leads/${id}/convert-to-deal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to convert lead to deal');
  }
  return res.json();
}

export async function restoreLeadConvertedApi(id: string): Promise<any> {
  const res = await fetchWithAuth(`/api/leads/${id}/restore-converted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể đưa Lead về trạng thái Đã chuyển đổi');
  }
  return res.json();
}

export async function createSalesActivityApi(data: {
  leadId?: string;
  dealId?: string;
  activityType: string;
  occurredAt?: string;
  nextFollowUpAt?: string;
  resultNote?: string;
}): Promise<any> {
  const res = await fetchWithAuth('/api/sales-activities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to log activity');
  }
  return res.json();
}
