import { fetchWithAuth } from './auth';

export interface ProjectAssignment {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  assignment_type: 'PRIMARY' | 'SUPPORT';
  is_active: boolean;
  assigned_at: string;
  unassigned_at?: string;
  replacement_reason?: string;
}

export interface ProjectTask {
  id: string;
  milestone_id: string;
  assigned_to_employee_id?: string;
  assigned_employee_name?: string;
  title: string;
  weight: number;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  blocked_reason?: string;
  blocked_since?: string;
  completed_at?: string;
  created_at: string;
}

export interface ProjectAcceptance {
  id: string;
  project_id: string;
  customer_contact_id: string;
  customer_contact_name?: string;
  accepted_by_name: string;
  accepted_at: string;
  evidence_document: string;
  recorded_by_name?: string;
  created_at: string;
}

export interface ProjectDependency {
  id: string;
  prerequisite_item_id: string;
  prerequisite_service_name: string;
  required_prerequisite_delivery_status: string;
  required_prerequisite_payment_status: string;
  current_prerequisite_delivery_status: string;
  current_prerequisite_payment_status: string;
  is_unlocked: boolean;
}

export interface ProjectListItem {
  id: string;
  order_item_id: string;
  project_name: string;
  status: string;
  materialized_progress_percent: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  order_code: string;
  company_name: string;
  service_name: string;
  primaryAssignees: ProjectAssignment[];
  supportAssignees: ProjectAssignment[];
}

export interface ProjectMilestone {
  id: string;
  project_id: string;
  title: string;
  weight: number;
  is_completed: boolean;
  completed_at?: string;
  sort_order: number;
  created_at: string;
}

export interface ProjectAttachment {
  id: string;
  project_id: string;
  file_title: string;
  file_url: string;
  uploaded_at: string;
  uploaded_by_name?: string;
}

export interface ProjectDetail extends ProjectListItem {
  order_id: string;
  account_id: string;
  service_id: string;
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  net_service_value: number;
  order_item_delivery_status: string;
  order_item_payment_status: string;
  assignments: ProjectAssignment[];
  milestones?: ProjectMilestone[];
  tasks: ProjectTask[];
  acceptance?: ProjectAcceptance;
  dependencies: ProjectDependency[];
  attachments?: ProjectAttachment[];
  auditLogs?: any[];
}

export async function fetchProjectsApi(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.q) query.set('q', params.q);
  if (params.status && params.status !== 'ALL') query.set('status', params.status);

  const res = await fetchWithAuth(`/api/projects?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function fetchProjectByIdApi(id: string): Promise<ProjectDetail> {
  const res = await fetchWithAuth(`/api/projects/${id}`);
  if (!res.ok) throw new Error('Failed to fetch project detail');
  return res.json();
}

export async function assignProjectApi(orderItemId: string, data: { employeeId: string; assignmentType: 'PRIMARY' | 'SUPPORT' }) {
  const res = await fetchWithAuth(`/api/order-items/${orderItemId}/assign-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to assign project');
  }
  return res.json();
}

export async function addAssignmentApi(projectId: string, data: { employeeId: string; assignmentType: 'PRIMARY' | 'SUPPORT' }) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to add assignment');
  }
  return res.json();
}

export async function replaceAssigneeApi(projectId: string, data: { oldEmployeeId: string; newEmployeeId: string; replacementReason: string }) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/replace-assignee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to replace assignee');
  }
  return res.json();
}

export async function markReadyToStartApi(projectId: string) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/ready`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to mark ready');
  }
  return res.json();
}

export async function startProjectApi(projectId: string) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/start`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to start project');
  }
  return res.json();
}

export async function updateProjectStatusApi(projectId: string, action: string, reason?: string) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update project status');
  }
  return res.json();
}

export async function recordAcceptanceApi(
  projectId: string,
  data: {
    customerContactId?: string;
    contactId?: string;
    acceptedByName?: string;
    representativeName?: string;
    evidenceDocument?: string;
    acceptanceEvidenceUrl?: string;
  },
) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/request-acceptance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to record acceptance');
  }
  return res.json();
}

export async function cancelProjectApi(projectId: string) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to cancel project');
  }
  return res.json();
}

export async function createTaskApi(projectId: string, data: { title: string; weight?: number; assignedToEmployeeId?: string }) {
  const res = await fetchWithAuth(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create task');
  }
  return res.json();
}

export async function startTaskApi(taskId: string) {
  const res = await fetchWithAuth(`/api/tasks/${taskId}/start`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to start task');
  }
  return res.json();
}

export async function blockTaskApi(taskId: string, reason: string) {
  const res = await fetchWithAuth(`/api/tasks/${taskId}/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to block task');
  }
  return res.json();
}

export async function completeTaskApi(taskId: string) {
  const res = await fetchWithAuth(`/api/tasks/${taskId}/complete`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to complete task');
  }
  return res.json();
}
