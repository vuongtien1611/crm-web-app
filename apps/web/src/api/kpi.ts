import { fetchWithAuth } from './auth';

export interface KpiEventItem {
  id: string;
  employee_id: string;
  employee_name: string;
  policy_id: string;
  policy_name: string;
  source_type: 'PAYMENT_ALLOCATION' | 'PROJECT_ACCEPTANCE' | 'SEO_ARTICLE';
  source_id: string;
  metric_type: string;
  metric_value: number;
  kpi_points: number;
  eligible_revenue: number;
  target_kpi_period: string;
  qualified_at: string;
  created_at: string;
}

export interface KpiSummary {
  employeeId: string;
  employeeName: string;
  period: string;
  totalEligibleRevenue: number;
  totalKpiPoints: number;
  totalSeoArticles: number;
  matchedTier: {
    id: string;
    tier_name: string;
    min_threshold: number;
    max_threshold: number | null;
    reward_amount: number;
  } | null;
  rewardBonus: number;
  eventCount: number;
}

export async function fetchKpiEvents(params?: {
  page?: number;
  limit?: number;
  employeeId?: string;
  targetPeriod?: string;
  sourceType?: string;
}): Promise<{ data: KpiEventItem[]; meta: { page: number; limit: number; total: number } }> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.employeeId) query.append('employeeId', params.employeeId);
  if (params?.targetPeriod) query.append('targetPeriod', params.targetPeriod);
  if (params?.sourceType) query.append('sourceType', params.sourceType);

  const res = await fetchWithAuth(`/api/kpi/events?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch KPI events');
  return res.json();
}

export async function fetchEmployeeKpiSummary(employeeId: string, period?: string): Promise<KpiSummary> {
  const query = period ? `?period=${period}` : '';
  const res = await fetchWithAuth(`/api/kpi/employees/${employeeId}${query}`);
  if (!res.ok) throw new Error('Failed to fetch employee KPI summary');
  return res.json();
}
