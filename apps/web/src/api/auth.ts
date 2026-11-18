import { useAuthStore, UserProfile } from '../store/authStore';
import { API_BASE_URL, buildApiUrl } from './config';

export { API_BASE_URL, buildApiUrl };

export interface LoginResponse {
  user: UserProfile;
  accessToken: string;
}

let refreshPromise: Promise<LoginResponse> | null = null;

export async function loginApi(identifier: string, password: string): Promise<LoginResponse> {
  const response = await fetch(buildApiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(errorData.message || 'Invalid credentials');
  }

  const data = await response.json();
  try {
    localStorage.setItem('crm_has_session', 'true');
  } catch {}
  useAuthStore.getState().setAuth(data.user, data.accessToken);
  return data;
}

export async function refreshApi(): Promise<LoginResponse> {
  // If an in-flight refresh request is already running, reuse it to prevent concurrent token rotation conflicts
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // NOTE: Fastify returns 400 Bad Request if Content-Type: application/json is sent with an empty body.
      // Therefore, do NOT set Content-Type header on empty POST requests.
      const response = await fetch(buildApiUrl('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        try {
          localStorage.removeItem('crm_has_session');
        } catch {}
        useAuthStore.getState().clearAuth();
        throw new Error('Refresh failed');
      }

      const data = await response.json();
      try {
        localStorage.setItem('crm_has_session', 'true');
      } catch {}
      useAuthStore.getState().setAuth(data.user, data.accessToken);
      return data;
    } catch (err) {
      try {
        localStorage.removeItem('crm_has_session');
      } catch {}
      useAuthStore.getState().clearAuth();
      throw err;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function logoutApi(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  try {
    localStorage.removeItem('crm_has_session');
  } catch {}
  await fetch(buildApiUrl('/auth/logout'), {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  }).catch(() => {});

  useAuthStore.getState().clearAuth();
}

export function isTokenExpiringSoon(token: string | null, bufferSeconds = 60): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const parsed = JSON.parse(jsonPayload);
    if (typeof parsed.exp !== 'number') return false;
    const now = Math.floor(Date.now() / 1000);
    return parsed.exp - now <= bufferSeconds;
  } catch {
    return true;
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const targetUrl = buildApiUrl(url);
  const hasSession = typeof window !== 'undefined' && localStorage.getItem('crm_has_session') === 'true';
  let token = useAuthStore.getState().accessToken;

  // Proactive token refresh if user has session but token is missing or expiring within 60s
  if (hasSession && isTokenExpiringSoon(token, 60)) {
    try {
      const refreshed = await refreshApi();
      token = refreshed.accessToken;
    } catch {
      token = useAuthStore.getState().accessToken;
    }
  }

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(targetUrl, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Reactive fallback: Handle 401 Unauthorized if token was revoked server-side
  if (response.status === 401 && hasSession) {
    try {
      const refreshed = await refreshApi();
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      response = await fetch(targetUrl, {
        ...options,
        headers,
        credentials: 'include',
      });
    } catch {
      useAuthStore.getState().clearAuth();
    }
  }

  return response;
}

export async function changePasswordApi(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetchWithAuth(buildApiUrl('/auth/change-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Đổi mật khẩu thất bại' }));
    throw new Error(errorData.message || 'Đổi mật khẩu thất bại');
  }

  // Update mustChangePassword in store after successful change
  const currentUser = useAuthStore.getState().user;
  const currentToken = useAuthStore.getState().accessToken;
  if (currentUser && currentToken) {
    useAuthStore.getState().setAuth(
      {
        ...currentUser,
        mustChangePassword: false,
      },
      currentToken,
    );
  }

  return response.json();
}
