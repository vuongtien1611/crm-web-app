import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export type EmployeeStatus = 'PROBATION' | 'ACTIVE' | 'RESIGNED' | 'TERMINATED';

export interface EmployeePosition {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeRole {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeTeam {
  id: string;
  code: string;
  name: string;
  department: string;
  isLeader: boolean;
}

export interface EmployeeUserAccount {
  id: string;
  username: string;
  email: string;
  status: string;
  must_change_password: boolean;
  created_at?: string;
}

export interface EmployeeItem {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  hire_date: string | null;
  status: EmployeeStatus;
  created_at: string;
  position: EmployeePosition | null;
  user: EmployeeUserAccount | null;
  roles: EmployeeRole[];
  currentTeam: EmployeeTeam | null;
}

export interface EmployeeSummary {
  total: number;
  active: number;
  probation: number;
  resigned: number;
  terminated: number;
}

export interface EmployeeListResponse {
  data: EmployeeItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
  summary: EmployeeSummary;
}

export interface EmployeeTeamHistoryItem {
  membershipId: string;
  teamId: string;
  teamCode: string;
  teamName: string;
  department: string;
  isLeader: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isCurrent: boolean;
}

export interface EmployeeDetailResponse {
  employee: {
    id: string;
    employee_code: string;
    full_name: string;
    phone: string | null;
    hire_date: string | null;
    status: EmployeeStatus;
    created_at: string;
  };
  account: {
    user_id: string;
    username: string;
    email: string;
    user_status: string;
    must_change_password: boolean;
    created_at: string;
  } | null;
  position: EmployeePosition | null;
  roles: EmployeeRole[];
  currentTeam: EmployeeTeam | null;
  teamHistory: EmployeeTeamHistoryItem[];
}

export interface FormOptionsResponse {
  positions: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ id: string; code: string; name: string }>;
  teams: Array<{ id: string; code: string; name: string; department: string }>;
  canonicalDepartments: string[];
  compatibility: Record<string, { roles: string[]; departments: string[] }>;
}

export interface CreateEmployeeAccountPayload {
  username: string;
  email: string;
  password?: string;
  fullName: string;
  phone?: string;
  hireDate: string;
  positionCode: string;
  roleCode: string;
  department: string;
  teamId?: string | number;
  isLeader?: boolean;
}

export interface GetEmployeesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  positionCode?: string;
  department?: string;
  teamId?: string | number;
}

export async function getEmployees(params?: GetEmployeesParams): Promise<EmployeeListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.search) query.append('search', params.search);
  if (params?.status) query.append('status', params.status);
  if (params?.positionCode) query.append('positionCode', params.positionCode);
  if (params?.department) query.append('department', params.department);
  if (params?.teamId) query.append('teamId', String(params.teamId));

  const url = `${API_BASE_URL}/employees${query.toString() ? `?${query.toString()}` : ''}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh sách nhân viên');
  }
  return res.json();
}

export async function getEmployeeById(id: string): Promise<EmployeeDetailResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employees/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Không thể tải thông tin nhân viên #${id}`);
  }
  return res.json();
}

export async function getEmployeeFormOptions(): Promise<FormOptionsResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employees/meta/options`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải cấu hình tạo nhân viên');
  }
  return res.json();
}

export async function createEmployeeAccount(
  payload: CreateEmployeeAccountPayload,
): Promise<any> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Tạo nhân viên và tài khoản thất bại');
  }

  return res.json();
}
