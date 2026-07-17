const API_URL = import.meta.env.DEV
  ? `${window.location.origin}/api/v1`
  : (import.meta.env.VITE_API_URL ?? `${window.location.origin}/api/v1`);

interface AuthCallbacks {
  onAccessToken: (token: string) => void;
  onUnauthorized: () => void;
}

let authCallbacks: AuthCallbacks | null = null;
let refreshPromise: Promise<string> | null = null;

export function configureApiAuth(callbacks: AuthCallbacks) {
  authCallbacks = callbacks;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

interface RequestOptions extends Omit<RequestInit, 'body'> { body?: unknown; token?: string | null }

export function leaveCallKeepalive(roomId: string, token: string) {
  return fetch(`${API_URL}/calls/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }).then(async (response) => {
    if (response.status === 401 || response.status === 403) throw new ApiError(response.status, 'Your session has expired', 'SESSION_EXPIRED');
    if (!response.ok) throw new ApiError(response.status, 'NOVA is reconnecting. Please try again.', 'AUTH_TEMPORARILY_UNAVAILABLE');
    const payload = await response.json() as { data: { accessToken: string } };
    authCallbacks?.onAccessToken(payload.data.accessToken);
    return payload.data.accessToken;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export async function api<T>(path: string, options: RequestOptions = {}, allowRetry = true): Promise<T> {
  const { body, token, headers, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: { ...(!isFormData ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
  if (response.status === 401 && token && allowRetry) {
    try {
      const renewedToken = await refreshAccessToken();
      return api<T>(path, { ...options, token: renewedToken }, false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SESSION_EXPIRED') authCallbacks?.onUnauthorized();
      throw error;
    }
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.error?.message ?? 'Request failed', payload.error?.code);
  return payload.data as T;
}
