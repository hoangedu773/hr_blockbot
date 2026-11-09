import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from '@hr-blockbot/contracts';
import { LoginResponseSchema, MeResponseSchema, RefreshResponseSchema } from '@hr-blockbot/contracts';

/**
 * Public API origin. MUST stay overridable at build time: the Render deployment
 * sets `VITE_API_BASE` to the public API origin. The localhost fallback is for
 * local development only and would break every request in production if the
 * hardcoded value came back.
 */
const FALLBACK_API_BASE = 'http://localhost:3001/api';

const ENV: Record<string, string | undefined> | undefined = import.meta.env;

export const API_BASE = ENV?.VITE_API_BASE ?? FALLBACK_API_BASE;

/**
 * In-memory Access Token storage ONLY.
 * TUYỆT ĐỐI KHÔNG lưu vào localStorage hoặc sessionStorage.
 */
let inMemoryAccessToken: string | null = null;
let inMemoryUser: AuthUser | null = null;
// In-flight requests from an older session must never restore a logged-out user.
let authRevision = 0;

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
  authRevision += 1;
  inMemoryAccessToken = token;
  inMemoryUser = user;
  authChangeListeners.forEach((listener) => listener(user, token));
}

export function clearAuthState(): void {
  authRevision += 1;
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
let logoutPromise: Promise<void> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const revision = authRevision;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Truyền HttpOnly Refresh Token cookie
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`Refresh failed with HTTP ${res.status}`);
      }

      const data: RefreshResponse = RefreshResponseSchema.parse(await res.json());
      if (!data?.accessToken) {
        throw new Error('Refresh response missing accessToken');
      }

      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
      if (!meResponse.ok) throw new Error('Không thể khôi phục thông tin tài khoản.');
      const me = MeResponseSchema.parse(await meResponse.json());
      if (revision !== authRevision) return null;

      inMemoryAccessToken = data.accessToken;
      inMemoryUser = {
        id: me.userId,
        role: me.role,
        username: me.username,
        mustChangePassword: me.mustChangePassword,
        authorization: me.authorization,
      };
      authChangeListeners.forEach((listener) => listener(inMemoryUser, inMemoryAccessToken));
      return data.accessToken;
    } catch {
      if (revision === authRevision) notifyAuthFailure();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  // A previous logout must finish clearing its cookie before a new login sets one.
  await logoutPromise;
  const revision = ++authRevision;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      username: credentials.username.trim().toLowerCase(),
      password: credentials.password,
    }),
  }).catch(() => {
    throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại.');
  });

  if (!res.ok) {
    throw new Error(res.status === 401
      ? 'Tên đăng nhập hoặc mật khẩu không đúng.'
      : res.status === 429
      ? 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.'
      : 'Chưa thể đăng nhập lúc này. Vui lòng thử lại.');
  }

  const parsed = LoginResponseSchema.safeParse(await res.json());
  if (!parsed.success || !parsed.data.accessToken) {
    throw new Error('Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.');
  }
  const data = parsed.data;
  if (revision !== authRevision) throw new Error('Yêu cầu đăng nhập đã bị hủy.');
  setAuthState(data.accessToken, data.user);
  return data;
}

/**
 * Đổi mật khẩu (bắt buộc ở lần đăng nhập đầu với mật khẩu tạm do quản lý phát).
 * Server thu hồi cả phiên access/refresh cũ. Đăng nhập lại bằng mật khẩu mới.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  }).catch(() => {
    throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại.');
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Mật khẩu hiện tại không đúng.');
    if (res.status === 400) {
      throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự và khác mật khẩu hiện tại.');
    }
    throw new Error('Chưa đổi được mật khẩu. Vui lòng thử lại.');
  }

  clearAuthState();
}

type PasswordOtp = { challengeId: string; destination: string; expiresInSeconds: number };

async function passwordOtpRequest(path: string, body: Record<string, string>): Promise<Response> {
  const res = await apiFetch(`${API_BASE}/auth/change-password${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) throw new Error('Mật khẩu hiện tại không đúng hoặc phiên đã hết hạn.');
    throw new Error(data?.error?.message ?? 'Chưa đổi được mật khẩu. Vui lòng thử lại.');
  }
  return res;
}

export async function sendPasswordOtp(currentPassword: string): Promise<PasswordOtp> {
  return (await passwordOtpRequest('/otp', { currentPassword })).json();
}

export async function confirmPasswordOtp(currentPassword: string, newPassword: string, challengeId: string, otp: string): Promise<void> {
  await passwordOtpRequest('', { currentPassword, newPassword, challengeId, otp });
  clearAuthState();
}

export function logout(): Promise<void> {
  if (logoutPromise) return logoutPromise;
  const token = inMemoryAccessToken;
  // Clear the UI immediately. Wait for any rotating cookie before revoking it.
  clearAuthState();
  logoutPromise = (async () => {
    await refreshPromise;
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      // The local session is already cleared if the server is unavailable.
    }
  })().finally(() => { logoutPromise = null; });
  return logoutPromise;
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
// ponytail: giới hạn đến response headers; nếu body thường có thể treo, chuyển deadline vào lớp đọc body.
export const API_DEADLINE_MS = 25_000;

export class ApiTimeoutError extends Error {
  readonly status = 0;
  readonly outcomeKnown: boolean;
  readonly code: string;

  constructor(target?: boolean | RequestInit | Request) {
    let isMutation = false;
    if (typeof target === 'boolean') {
      isMutation = target;
    } else if (target && typeof target === 'object') {
      const method = ('method' in target && target.method ? target.method : 'GET').toUpperCase();
      isMutation = method !== 'GET' && method !== 'HEAD';
    }
    super(
      isMutation
        ? 'Hết thời gian chờ. Kết quả thao tác chưa được xác nhận — vui lòng kiểm tra lại trước khi thử lần nữa.'
        : 'Máy chủ không phản hồi đúng thời hạn. Vui lòng thử lại.'
    );
    this.name = 'ApiTimeoutError';
    this.outcomeKnown = !isMutation;
    this.code = isMutation ? 'TIMEOUT_OUTCOME_UNKNOWN' : 'TIMEOUT';
  }
}

export async function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
  isRetry = false
): Promise<Response> {
  const revision = authRevision;
  const requestToken = inMemoryAccessToken;
  const headers = new Headers(
    init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined)
  );

  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const method = (
    init?.method ??
    (typeof input === 'object' && 'method' in input && input.method ? input.method : 'GET')
  ).toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';

  const callerSignal =
    init?.signal ??
    (typeof input === 'object' && 'signal' in input ? input.signal : undefined);

  const timeoutController = new AbortController();
  let timer: number | undefined;

  if (!callerSignal?.aborted) {
    timer = setTimeout(() => {
      timeoutController.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, API_DEADLINE_MS);
  }

  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  const config: RequestInit = {
    ...init,
    headers,
    credentials: 'include',
    signal,
  };

  let response: Response;
  try {
    response = await fetch(input, config);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError' && callerSignal?.aborted !== true) {
      throw new ApiTimeoutError(isMutation);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && revision === authRevision) {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const isAuthEndpoint =
      urlStr.includes('/auth/login') ||
      urlStr.includes('/auth/refresh') ||
      // 401 ở đây nghĩa là "mật khẩu hiện tại sai", không phải phiên hết hạn.
      urlStr.includes('/auth/change-password');

    if (isAuthEndpoint || isRetry) {
      if (!isAuthEndpoint) {
        notifyAuthFailure();
      }
      return response;
    }

    // Single-flight refresh
    const newToken = inMemoryAccessToken !== requestToken && inMemoryAccessToken
      ? inMemoryAccessToken
      : await refreshAccessToken();
    if (revision !== authRevision) return response;
    if (callerSignal?.aborted) return response;

    if (newToken) {
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return apiFetch(input, { ...init, headers: retryHeaders }, true);
    } else {
      notifyAuthFailure();
      return response;
    }
  }

  return response;
}
