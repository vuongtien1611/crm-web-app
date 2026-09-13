import { useAuthStore, UserProfile } from '../store/authStore';

const API_BASE_URL = '/api';

export interface LoginResponse {
  user: UserProfile;
  accessToken: string;
}

let refreshPromise: Promise<LoginResponse> | null = null;

export async function loginApi(identifier: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
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
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
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
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  }).catch(() => {});

  useAuthStore.getState().clearAuth();
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = useAuthStore.getState().accessToken;

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 Unauthorized -> Attempt token refresh
  if (response.status === 401) {
    try {
      const refreshed = await refreshApi();
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      response = await fetch(url, {
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
  const response = await fetchWithAuth(`${API_BASE_URL}/auth/change-password`, {
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
