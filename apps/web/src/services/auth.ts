import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from '@hr-blockbot/contracts';

/**
 * Public API origin. MUST stay overridable at build time: the Render deployment
 * sets `VITE_API_BASE` to the public API origin. The localhost fallback is for
 * local development only and would break every request in production if the
 * hardcoded value came back.
 */
const FALLBACK_API_BASE = 'http://localhost:3001/api';

export const API_BASE = import.meta.env.VITE_API_BASE ?? FALLBACK_API_BASE;

/**
 * In-memory Access Token storage ONLY.
 * TUYỆT ĐỐI KHÔNG lưu vào localStorage hoặc sessionStorage.
 */
let inMemoryAccessToken: string | null = null;
let inMemoryUser: AuthUser | null = null;

type AuthChangeListener = (user: AuthUser | null, token: string | null) => void;
type AuthFailureListener = () => void;

const authChangeListeners = new Set<AuthChangeListener>();
const authFailureListeners = new Set<AuthFailureListener>();

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function getAuthUser(): AuthUser | null {
  return inMemoryUser;
}

export function setAuthState(token: string | null, user: AuthUser | null): void {
  inMemoryAccessToken = token;
  inMemoryUser = user;
  authChangeListeners.forEach((listener) => listener(user, token));
}

export function clearAuthState(): void {
  inMemoryAccessToken = null;
  inMemoryUser = null;
  authChangeListeners.forEach((listener) => listener(null, null));
}

export function onAuthStateChange(listener: AuthChangeListener): () => void {
  authChangeListeners.add(listener);
  return () => {
    authChangeListeners.delete(listener);
  };
}

export function onAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

function notifyAuthFailure(): void {
  clearAuthState();
  authFailureListeners.forEach((listener) => listener());
}

/**
 * Single-flight refresh token lock / promise.
 * Nếu có nhiều request đồng thời gặp 401, tất cả cùng chia sẻ 1 promise refresh duy nhất.
 */
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Truyền HttpOnly Refresh Token cookie
      });

      if (!res.ok) {
        throw new Error(`Refresh failed with HTTP ${res.status}`);
      }

      const data: RefreshResponse = await res.json();
      if (!data?.accessToken) {
        throw new Error('Refresh response missing accessToken');
      }

      inMemoryAccessToken = data.accessToken;
      authChangeListeners.forEach((l) => l(inMemoryUser, inMemoryAccessToken));
      return data.accessToken;
    } catch {
      notifyAuthFailure();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    let errMsg = `Đăng nhập thất bại (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMsg = errJson.error.message;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }

  const data: LoginResponse = await res.json();
  setAuthState(data.accessToken, data.user);
  return data;
}

export async function logout(): Promise<void> {
  const token = inMemoryAccessToken;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });
  } catch {
    // ignore network errors on logout
  } finally {
    clearAuthState();
  }
}

/**
 * Authenticated Fetch Interceptor:
 * - Luôn tự động gắn `credentials: "include"` (để truyền refresh cookie).
 * - Luôn đính kèm `Authorization: Bearer <token>` nếu có token trong bộ nhớ.
 * - Khi gặp 401 UNAUTHENTICATED:
 *     + Gọi refreshAccessToken() một lần duy nhất (single-flight).
 *     + Nếu refresh thành công -> retry lại request ban đầu một lần.
 *     + Nếu refresh thất bại -> xóa sạch state và điều hướng về trang đăng nhập.
 */
export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
  isRetry = false
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const config: RequestInit = {
    ...init,
    headers,
    credentials: 'include',
  };

  const response = await fetch(input, config);

  if (response.status === 401) {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const isAuthEndpoint =
      urlStr.includes('/auth/login') || urlStr.includes('/auth/refresh');

    if (isAuthEndpoint || isRetry) {
      if (!isAuthEndpoint) {
        notifyAuthFailure();
      }
      return response;
    }

    // Single-flight refresh
    const newToken = await refreshAccessToken();
    if (newToken) {
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return apiFetch(input, { ...init, headers: retryHeaders }, true);
    } else {
      notifyAuthFailure();
      return response;
    }
  }

  return response;
}
