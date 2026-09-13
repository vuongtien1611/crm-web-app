import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export interface DailyReportWorkItem {
  id?: string;
  dailyReportId?: string;
  projectId?: string | null;
  projectName?: string | null;
  workTitle: string;
  workDetail: string;
  link?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  progressPercent: number;
  note?: string | null;
  sortOrder?: number;
}

export interface DailyReportItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  email?: string;
  positionName?: string;
  reportDate: string; // YYYY-MM-DD
  difficulty: string | null;
  supportNeeded: string | null;
  nextPlan: string | null;
  note: string | null;
  submittedAt: string;
  items?: DailyReportWorkItem[];
}

export interface CreateDailyReportPayload {
  report_date: string;
  difficulty?: string;
  support_needed?: string;
  next_plan?: string;
  note?: string;
  items?: Partial<DailyReportWorkItem>[];
}

export interface UpdateDailyReportPayload {
  difficulty?: string;
  support_needed?: string;
  next_plan?: string;
  note?: string;
}

export interface QueryDailyReportsParams {
  date?: string;
  month?: string;
  fromDate?: string;
  toDate?: string;
  employee_id?: string;
  team_id?: string;
  department?: string;
  project_id?: string;
  status?: string;
  search?: string;
  scope?: 'own' | 'team' | 'all';
}

export interface DailyReportStats {
  reportedEmployeesCount: number;
  totalEmployeesCount: number;
  unreportedEmployeesCount: number;
  totalWorkItems: number;
  doneWorkItems: number;
  inProgressWorkItems: number;
  blockedWorkItems: number;
  activeProjectsCount: number;
  departments: { department: string; count: number }[];
  topProjects: { id: string; name: string; taskCount: number }[];
}

export interface DailyReportFilterOptions {
  departments: string[];
  teams: { id: string; name: string; department: string }[];
  employees: { id: string; fullName: string; employeeCode: string; teamId: string | null }[];
  projects: { id: string; name: string }[];
}

export interface ProjectWorkItem {
  id: string;
  reportId: string;
  reportDate: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  teamName: string | null;
  projectId: string;
  projectName: string;
  taskName: string;
  taskDetail: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  progressPercent: number;
  challenges: string | null;
  supportNeeded: string | null;
  submittedAt: string;
}

export async function getDailyReportsApi(
  params?: QueryDailyReportsParams,
): Promise<DailyReportItem[]> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.month) query.append('month', params.month);
  if (params?.fromDate) query.append('fromDate', params.fromDate);
  if (params?.toDate) query.append('toDate', params.toDate);
  if (params?.employee_id) query.append('employee_id', params.employee_id);
  if (params?.team_id) query.append('team_id', params.team_id);
  if (params?.department) query.append('department', params.department);
  if (params?.project_id) query.append('project_id', params.project_id);
  if (params?.status) query.append('status', params.status);
  if (params?.search) query.append('search', params.search);
  if (params?.scope) query.append('scope', params.scope);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports${qs}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải danh sách báo cáo ngày');
  }
  const result = await response.json();
  if (Array.isArray(result)) {
    return result;
  }
  if (result && Array.isArray(result.data)) {
    return result.data;
  }
  return [];
}

export async function getDailyReportStatsApi(
  params?: QueryDailyReportsParams,
): Promise<DailyReportStats> {
  const query = new URLSearchParams();
  if (params?.fromDate) query.append('fromDate', params.fromDate);
  if (params?.toDate) query.append('toDate', params.toDate);
  if (params?.department) query.append('department', params.department);
  if (params?.team_id) query.append('team_id', params.team_id);
  if (params?.employee_id) query.append('employee_id', params.employee_id);
  if (params?.project_id) query.append('project_id', params.project_id);
  if (params?.status) query.append('status', params.status);
  if (params?.search) query.append('search', params.search);
  if (params?.scope) query.append('scope', params.scope);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports/stats${qs}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải thống kê báo cáo');
  }
  return response.json();
}

export async function getDailyReportFilterOptionsApi(): Promise<DailyReportFilterOptions> {
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports/filter-options`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải bộ lọc');
  }
  return response.json();
}

export async function getProjectWorkItemsApi(params: {
  projectId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<ProjectWorkItem[]> {
  const query = new URLSearchParams();
  query.append('projectId', params.projectId);
  if (params.fromDate) query.append('fromDate', params.fromDate);
  if (params.toDate) query.append('toDate', params.toDate);

  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports/project-work-items?${query.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tải công việc dự án');
  }
  return response.json();
}

export async function exportDailyReportsApi(params: Record<string, string | undefined>): Promise<Blob> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) query.append(k, v);
  });
  const response = await fetchWithAuth(`${API_BASE_URL}/exports/daily-reports?${query.toString()}`);
  if (!response.ok) {
    throw new Error('Lỗi khi xuất file Excel');
  }
  return response.blob();
}

export async function getDailyReportByIdApi(id: string): Promise<DailyReportItem> {
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports/${id}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi tải chi tiết báo cáo #${id}`);
  }
  return response.json();
}

export async function createDailyReportApi(
  payload: CreateDailyReportPayload,
): Promise<DailyReportItem> {
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Lỗi khi tạo báo cáo ngày');
  }
  return response.json();
}

export async function updateDailyReportApi(
  id: string,
  payload: UpdateDailyReportPayload,
): Promise<DailyReportItem> {
  const response = await fetchWithAuth(`${API_BASE_URL}/daily-reports/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi khi cập nhật báo cáo #${id}`);
  }
  return response.json();
}
