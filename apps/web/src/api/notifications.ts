import { fetchWithAuth, buildApiUrl } from './auth';

export interface NotificationItem {
  id: string;
  employee_id: string;
  event_type: string;
  title: string;
  content: string;
  deep_link_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface GetNotificationsParams {
  unread_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  total: number;
  unreadCount: number;
}

export async function getNotificationsApi(
  params?: GetNotificationsParams,
): Promise<NotificationListResponse> {
  const query = new URLSearchParams();
  if (params?.unread_only) {
    query.set('unread_only', 'true');
  }
  if (params?.limit) {
    query.set('limit', String(params.limit));
  }
  if (params?.offset) {
    query.set('offset', String(params.offset));
  }

  const qs = query.toString();
  const url = buildApiUrl(`/notifications${qs ? `?${qs}` : ''}`);
  const res = await fetchWithAuth(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải danh sách thông báo');
  }
  const json = await res.json();
  return {
    data: Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [],
    total: typeof json?.total === 'number' ? json.total : 0,
    unreadCount: typeof json?.unreadCount === 'number' ? json.unreadCount : 0,
  };
}

export async function getUnreadCountApi(): Promise<{ unreadCount: number }> {
  const res = await fetchWithAuth(buildApiUrl('/notifications/unread-count'));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể tải số thông báo chưa đọc');
  }
  return res.json();
}

export async function markNotificationReadApi(id: string): Promise<NotificationItem> {
  const res = await fetchWithAuth(buildApiUrl(`/notifications/${id}/read`), {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Không thể đánh dấu đã đọc thông báo #${id}`);
  }
  return res.json();
}

export async function markAllNotificationsReadApi(): Promise<{ updatedCount: number }> {
  const res = await fetchWithAuth(buildApiUrl('/notifications/read-all'), {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể đánh dấu đã đọc tất cả thông báo');
  }
  return res.json();
}

export async function sendTestNotificationApi(payload?: {
  title?: string;
  content?: string;
}): Promise<{ success: boolean; message: string; notification: NotificationItem }> {
  const res = await fetchWithAuth(buildApiUrl('/notifications/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Không thể gửi thông báo thử nghiệm');
  }
  return res.json();
}

