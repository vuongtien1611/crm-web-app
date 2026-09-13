import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export type TeamDepartment = 'SALES' | 'DEV' | 'SEO' | 'OPERATION';

export interface TeamLeaderSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  positionCode?: string;
  positionName?: string;
}

export interface TeamListItem {
  id: string;
  code: string;
  name: string;
  department: TeamDepartment;
  description: string | null;
  activeMemberCount: number;
  currentLeader: TeamLeaderSummary | null;
  createdAt: string;
}

export interface TeamListResponse {
  data: TeamListItem[];
  total: number;
}

export interface TeamMemberItem {
  membershipId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  status: string;
  positionCode: string | null;
  positionName: string | null;
  roleCode: string | null;
  roleName: string | null;
  isLeader: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isCurrent: boolean;
}

export interface TeamDetailResponse {
  id: string;
  code: string;
  name: string;
  department: TeamDepartment;
  description: string | null;
  createdAt: string;
  currentLeader: TeamLeaderSummary | null;
  activeMemberCount: number;
  totalHistoricalMemberCount: number;
}

export interface CreateTeamPayload {
  name: string;
  code: string;
  department: TeamDepartment;
  description?: string;
}

export interface AssignMemberPayload {
  employeeId: string;
  isLeader?: boolean;
}

export interface MoveMemberPayload {
  employeeId: string;
  targetTeamId: string;
}

export interface ChangeLeaderPayload {
  newLeaderEmployeeId: string;
}

// ------------------------------------------------------------------
// API CALLS
// ------------------------------------------------------------------

export async function getTeams(params?: {
  department?: string;
  search?: string;
}): Promise<TeamListResponse> {
  const query = new URLSearchParams();
  if (params?.department) query.append('department', params.department);
  if (params?.search) query.append('search', params.search);

  const url = `${API_BASE_URL}/teams${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh sách nhóm làm việc');
  }
  return res.json();
}

export async function getTeamById(id: string): Promise<TeamDetailResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Không thể tải thông tin nhóm #${id}`);
  }
  return res.json();
}

export async function getTeamMembers(id: string): Promise<TeamMemberItem[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${id}/members`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh sách thành viên của nhóm');
  }
  return res.json();
}

export async function getTeamHistory(id: string): Promise<TeamMemberItem[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${id}/history`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải lịch sử thành viên của nhóm');
  }
  return res.json();
}

export async function createTeam(payload: CreateTeamPayload): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Tạo nhóm làm việc thất bại');
  }
  return res.json();
}

export async function assignMember(
  teamId: string,
  payload: AssignMemberPayload,
): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${teamId}/assign-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Thêm thành viên vào nhóm thất bại');
  }
  return res.json();
}

export async function moveMember(
  teamId: string,
  payload: MoveMemberPayload,
): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${teamId}/move-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Chuyển nhóm cho thành viên thất bại');
  }
  return res.json();
}

export async function changeLeader(
  teamId: string,
  payload: ChangeLeaderPayload,
): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/${teamId}/change-leader`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Bổ nhiệm / thay đổi Trưởng nhóm thất bại');
  }
  return res.json();
}

export interface SalesWorkspaceMemberSummary {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  positionName: string | null;
  isLeader: boolean;
  leadsCount: number;
  dealsCount: number;
  wonDealsCount: number;
  wonRevenue: number;
}

export interface SalesWorkspaceSummaryResponse {
  team: {
    id: string;
    name: string;
    code: string;
    department: string;
  };
  period: string;
  metrics: {
    totalLeads: number;
    openDealsCount: number;
    wonDealsCount: number;
    wonRevenue: number;
    totalCommission: number;
  };
  members: SalesWorkspaceMemberSummary[];
}

export async function getSalesWorkspaceSummaryApi(
  period?: string,
): Promise<SalesWorkspaceSummaryResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/workspaces/sales/summary${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải dữ liệu Sales Workspace');
  }
  return res.json();
}

export interface DevWorkspaceMemberSummary {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  positionName: string | null;
  isLeader: boolean;
  activePrimaryProjectsCount: number;
  activeSupportProjectsCount: number;
  totalActiveProjects: number;
  activeTasksCount: number;
  kpiPoints: number;
}

export interface DevWorkspaceRecentProject {
  id: string;
  project_name: string;
  status: string;
  materialized_progress_percent: number;
  created_at: string;
  order_code: string;
  company_name: string;
  service_name: string;
  primaryAssignees: string[];
  supportAssignees: string[];
}

export interface DevWorkspaceSummaryResponse {
  team: {
    id: string;
    name: string;
    code: string;
    department: string;
  };
  period: string;
  metrics: {
    totalProjects: number;
    activeProjectsCount: number;
    blockedProjectsCount: number;
    completedProjectsCount: number;
    reviewAcceptanceCount: number;
    totalAcceptances: number;
    totalKpiPoints: number;
  };
  tasksSummary: {
    todo: number;
    inProgress: number;
    blocked: number;
    done: number;
    total: number;
  };
  members: DevWorkspaceMemberSummary[];
  recentProjects: DevWorkspaceRecentProject[];
}

export async function getDevWorkspaceSummaryApi(
  period?: string,
): Promise<DevWorkspaceSummaryResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/workspaces/dev/summary${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải dữ liệu Dev Workspace');
  }
  return res.json();
}

export type SeoWorkspaceMemberSummary = DevWorkspaceMemberSummary;
export type SeoWorkspaceRecentProject = DevWorkspaceRecentProject;
export type SeoWorkspaceSummaryResponse = DevWorkspaceSummaryResponse;

export async function getSeoWorkspaceSummaryApi(
  period?: string,
): Promise<SeoWorkspaceSummaryResponse> {
  const query = period ? `?period=${period}` : '';
  const res = await fetchWithAuth(`${API_BASE_URL}/teams/workspaces/seo/summary${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải dữ liệu SEO Workspace');
  }
  return res.json();
}

