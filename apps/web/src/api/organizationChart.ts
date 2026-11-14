import { fetchWithAuth, buildApiUrl } from './auth';

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
  const res = await fetchWithAuth(buildApiUrl('/organization-chart'), {
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
  const res = await fetchWithAuth(buildApiUrl('/organization-chart/move-member'), {
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
  const res = await fetchWithAuth(buildApiUrl('/organization-chart/change-leader'), {
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

export interface EmployeeWorkloadResponse {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  isLeader: boolean;
  currentTeamId: string | null;
  activeProjectsCount: number;
  activeProjects: Array<{
    id: string;
    code: string;
    name: string;
    assignmentType: string;
  }>;
  activeTasksCount: number;
  activeTasks: Array<{
    id: string;
    title: string;
    status: string;
    projectName: string;
  }>;
  activeDealsCount: number;
  activeDeals: Array<{
    id: string;
    title: string;
    status: string;
    dealValue: number;
  }>;
  hasActiveWorkload: boolean;
}

export async function fetchEmployeeWorkload(
  employeeId: string,
): Promise<EmployeeWorkloadResponse> {
  const res = await fetchWithAuth(buildApiUrl(`/organization-chart/employee-workload/${employeeId}`), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể kiểm tra khối lượng công việc của nhân sự');
  }

  return res.json();
}
