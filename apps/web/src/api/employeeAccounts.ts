import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export interface EmployeeAccountItem {
  employee_id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  employee_status: string;
  employee_created_at: string;
  user_id: string;
  username: string;
  email: string;
  account_status: 'ACTIVE' | 'DISABLED';
  must_change_password: boolean;
  last_login_at: string | null;
  position_id: string;
  position_name: string;
  position_code: string;
  team_id: string | null;
  team_name: string | null;
  department: string | null;
  has_pending_reset_request: boolean;
}

export interface EmployeeAccountsResponse {
  data: EmployeeAccountItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isUnlocked: boolean;
}

export interface PasswordResetRequest {
  id: string;
  employee_id: string;
  status: 'PENDING' | 'RESOLVED';
  requested_at: string;
  resolved_at: string | null;
  resolved_by_employee_id: string | null;
  ip_address: string | null;
}

export interface EmployeeAccountDetailResponse {
  employee: EmployeeAccountItem & {
    roles: string[];
    roleDetails: Array<{ code: string; name: string }>;
  };
  pendingResetRequests: PasswordResetRequest[];
  targetResetRequest: PasswordResetRequest | null;
  isUnlocked: boolean;
}

export interface PinStatusResponse {
  isConfigured: boolean;
  isUnlocked: boolean;
}

export interface QueryEmployeeAccountsParams {
  page?: number;
  limit?: number;
  q?: string;
  department?: string;
  team_id?: string | number;
  position_id?: string | number;
  status?: string;
}

export interface UpdateEmployeeAccountPayload {
  username?: string;
  accountStatus?: 'ACTIVE' | 'DISABLED';
  newPassword?: string;
}

export async function getEmployeeAccountsApi(
  params?: QueryEmployeeAccountsParams,
): Promise<EmployeeAccountsResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', String(params.page));
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.q) query.append('q', params.q);
  if (params?.department && params.department !== 'ALL') query.append('department', params.department);
  if (params?.team_id && params.team_id !== 'ALL') query.append('team_id', String(params.team_id));
  if (params?.position_id && params.position_id !== 'ALL') query.append('position_id', String(params.position_id));
  if (params?.status && params.status !== 'ALL') query.append('status', params.status);

  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts?${query.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Không thể tải danh sách tài khoản' }));
    throw new Error(errorData.message || 'Không thể tải danh sách tài khoản');
  }
  return res.json();
}

export async function getEmployeeAccountDetailApi(
  employeeId: string,
  resetRequestId?: string | null,
): Promise<EmployeeAccountDetailResponse> {
  const query = resetRequestId ? `?resetRequest=${encodeURIComponent(resetRequestId)}` : '';
  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts/${employeeId}${query}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Không thể tải chi tiết tài khoản' }));
    throw new Error(errorData.message || 'Không thể tải chi tiết tài khoản');
  }
  return res.json();
}

export async function getBossPinStatusApi(): Promise<PinStatusResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts/pin-status`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Không thể kiểm tra trạng thái PIN' }));
    throw new Error(errorData.message || 'Không thể kiểm tra trạng thái PIN');
  }
  return res.json();
}

export async function verifyBossPinApi(pin: string): Promise<{ success: boolean; unlocked: boolean; message: string }> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Xác thực PIN thất bại' }));
    throw new Error(errorData.message || 'Xác thực PIN thất bại');
  }
  return res.json();
}

export async function changeBossPinApi(
  newPin: string,
  currentPin?: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts/change-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPin, currentPin }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Đổi mã PIN thất bại' }));
    throw new Error(errorData.message || 'Đổi mã PIN thất bại');
  }
  return res.json();
}

export async function updateEmployeeAccountApi(
  employeeId: string,
  payload: UpdateEmployeeAccountPayload,
): Promise<{ success: boolean; message: string; data?: any }> {
  const res = await fetchWithAuth(`${API_BASE_URL}/employee-accounts/${employeeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Cập nhật tài khoản thất bại' }));
    const error: any = new Error(errorData.message || 'Cập nhật tài khoản thất bại');
    error.code = errorData.code;
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function forgotPasswordApi(identifier: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: 'Gửi yêu cầu quên mật khẩu thất bại' }));
    throw new Error(errorData.message || 'Gửi yêu cầu quên mật khẩu thất bại');
  }
  return res.json();
}
