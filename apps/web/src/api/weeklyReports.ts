import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export interface WeeklyReportRecord {
  id: string;
  teamId: number;
  teamName: string;
  createdByEmployeeId: string;
  creatorName: string;
  creatorCode?: string;
  weekStart: string;
  weekEnd: string;
  summaryWorkDone: string | null;
  summaryBlockers: string | null;
  summaryNextWeek: string | null;
  leaderNote: string | null;
  status: 'DRAFT' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateWeeklyReportPayload {
  team_id?: number | string;
  week_start: string;
  week_end: string;
  summary_work_done?: string;
  summary_blockers?: string;
  summary_next_week?: string;
  leader_note?: string;
  status?: 'DRAFT' | 'COMPLETED';
}

export interface UpdateWeeklyReportPayload {
  summary_work_done?: string;
  summary_blockers?: string;
  summary_next_week?: string;
  leader_note?: string;
  status?: 'DRAFT' | 'COMPLETED';
}

export interface QueryWeeklyReportsParams {
  team_id?: string | number;
  week_start?: string;
  week_end?: string;
  status?: string;
}

export interface SynthesizeResponse {
  team_id: number;
  team_name: string;
  week_start: string;
  week_end: string;
  summary_work_done: string;
  summary_blockers: string;
  summary_next_week: string;
  member_reports_count?: number;
  items_count?: number;
}

export async function getWeeklyReportsApi(
  params?: QueryWeeklyReportsParams,
): Promise<WeeklyReportRecord[]> {
  const query = new URLSearchParams();
  if (params?.team_id) query.append('team_id', String(params.team_id));
  if (params?.week_start) query.append('week_start', params.week_start);
  if (params?.week_end) query.append('week_end', params.week_end);
  if (params?.status) query.append('status', params.status);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetchWithAuth(`${API_BASE_URL}/weekly-reports${qs}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải danh sách báo cáo tuần');
  }
  const result = await response.json();
  return Array.isArray(result) ? result : [];
}

export async function getWeeklyReportByIdApi(id: string): Promise<WeeklyReportRecord> {
  const response = await fetchWithAuth(`${API_BASE_URL}/weekly-reports/${id}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi tải chi tiết báo cáo tuần #${id}`);
  }
  return response.json();
}

export async function createWeeklyReportApi(
  payload: CreateWeeklyReportPayload,
): Promise<WeeklyReportRecord> {
  const response = await fetchWithAuth(`${API_BASE_URL}/weekly-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tạo báo cáo tuần');
  }
  return response.json();
}

export async function updateWeeklyReportApi(
  id: string,
  payload: UpdateWeeklyReportPayload,
): Promise<WeeklyReportRecord> {
  const response = await fetchWithAuth(`${API_BASE_URL}/weekly-reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi cập nhật báo cáo tuần #${id}`);
  }
  return response.json();
}

export async function completeWeeklyReportApi(id: string): Promise<WeeklyReportRecord> {
  const response = await fetchWithAuth(`${API_BASE_URL}/weekly-reports/${id}/complete`, {
    method: 'PUT',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi hoàn tất báo cáo tuần #${id}`);
  }
  return response.json();
}

export async function synthesizeWeeklyReportApi(params: {
  team_id?: string | number;
  week_start: string;
  week_end: string;
}): Promise<SynthesizeResponse> {
  const query = new URLSearchParams();
  if (params.team_id) query.append('team_id', String(params.team_id));
  query.append('week_start', params.week_start);
  query.append('week_end', params.week_end);

  const response = await fetchWithAuth(
    `${API_BASE_URL}/weekly-reports/synthesize?${query.toString()}`,
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tổng hợp báo cáo tuần');
  }
  return response.json();
}

export async function downloadWeeklyReportExcel(
  id?: string,
  params?: QueryWeeklyReportsParams,
): Promise<void> {
  let url = `${API_BASE_URL}/weekly-reports/export`;
  if (id) {
    url = `${API_BASE_URL}/weekly-reports/export/${id}`;
  } else if (params) {
    const query = new URLSearchParams();
    if (params.team_id) query.append('team_id', String(params.team_id));
    if (params.week_start) query.append('week_start', params.week_start);
    if (params.week_end) query.append('week_end', params.week_end);
    if (params.status) query.append('status', params.status);
    const qs = query.toString();
    if (qs) url += `?${qs}`;
  }

  const response = await fetchWithAuth(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải file Excel báo cáo tuần');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition');
  let filename = id ? `Bao_Cao_Tuan_${id}.xlsx` : `Danh_Sach_Bao_Cao_Tuan.xlsx`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }

  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
