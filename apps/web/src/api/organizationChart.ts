import { fetchWithAuth } from './auth';

const API_BASE_URL = '/api';

export interface OrgEmployeeCard {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  status: string;
  positionCode: string | null;
  positionName: string | null;
  roles: string[];
  teamId: string | null;
  teamName: string | null;
  department: string | null;
  isLeader: boolean;
  isBoss: boolean;
  membershipId: string | null;
  joinedAt?: string | null;
}

export interface OrgTeamData {
  id: string;
  code: string;
  name: string;
  department: string;
  description: string | null;
  leader: OrgEmployeeCard | null;
  members: OrgEmployeeCard[];
  memberCount: number;
}

export interface OrgChartResponse {
  boss: OrgEmployeeCard | null;
  teams: OrgTeamData[];
  externalStaff: OrgEmployeeCard[];
  departments: string[];
}

export interface MoveMemberPayload {
  employeeId: string;
  targetTeamId: string;
  reason?: string;
}

export interface ChangeLeaderPayload {
  teamId: string;
  newLeaderEmployeeId: string;
}

export async function fetchOrganizationChart(): Promise<OrgChartResponse> {
  const res = await fetchWithAuth(`${API_BASE_URL}/organization-chart`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải sơ đồ nhân sự');
  }

  return res.json();
}

export async function moveOrgChartMember(payload: MoveMemberPayload): Promise<{
  message: string;
  oldMembershipId: string;
  newMembershipId: string;
  sourceTeamId: string;
  targetTeamId: string;
  isCrossDepartment?: boolean;
}> {
  const res = await fetchWithAuth(`${API_BASE_URL}/organization-chart/move-member`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Chuyển nhóm cho nhân viên thất bại');
  }

  return res.json();
}

export async function changeOrgChartLeader(payload: ChangeLeaderPayload): Promise<{
  message: string;
  teamId: string;
  newLeaderEmployeeId: string;
  newLeaderMembershipId: string;
}> {
  const res = await fetchWithAuth(`${API_BASE_URL}/organization-chart/change-leader`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Đổi trưởng nhóm thất bại');
  }

  return res.json();
}
