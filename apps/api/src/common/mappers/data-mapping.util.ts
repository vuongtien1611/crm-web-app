/**
 * Centralized data mapping utilities.
 * Handles dual camelCase and snake_case API payload normalization
 * without altering database schema columns or breaking existing frontend JSON contracts.
 */

export interface NormalizedDailyReportItem {
  id?: number | null;
  projectId: number | null;
  workTitle: string;
  workDetail: string;
  link: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  progressPercent: number;
  note: string | null;
  sortOrder: number;
}

export function normalizeDailyReportItem(
  item: any,
  defaultIndex = 0,
): NormalizedDailyReportItem {
  const rawId = item.id !== undefined && item.id !== null ? Number(item.id) : null;
  const rawProjectId = item.projectId ?? item.project_id ?? null;
  const projectId = rawProjectId !== null && rawProjectId !== undefined ? Number(rawProjectId) : null;

  const workTitle = String(item.workTitle ?? item.work_title ?? '').trim();
  const workDetail = String(item.workDetail ?? item.work_detail ?? '').trim();
  const link = item.link ? String(item.link).trim() : null;
  const status = item.status || 'TODO';

  const rawProgress = item.progressPercent !== undefined ? item.progressPercent : item.progress_percent;
  const progressPercent = typeof rawProgress === 'number' && !isNaN(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;

  const note = item.note ? String(item.note).trim() : null;
  const rawSort = item.sortOrder !== undefined ? item.sortOrder : item.sort_order;
  const sortOrder = typeof rawSort === 'number' && !isNaN(rawSort) ? rawSort : defaultIndex;

  return {
    id: rawId,
    projectId: isNaN(projectId as number) ? null : projectId,
    workTitle,
    workDetail,
    link,
    status,
    progressPercent,
    note,
    sortOrder,
  };
}

