const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
const CSRF_COOKIE_NAME = 'imleader_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrf?: boolean;
}

interface ApiErrorOptions {
  status: number;
  code: string;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds?: number;

  constructor(message: string, options: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(prefix)) return decodeURIComponent(cookie.slice(prefix.length));
  }
  return null;
}

function parseErrorDetail(payload: unknown): { code: string; message: string } {
  if (isRecord(payload)) {
    if (isRecord(payload.detail)) {
      const code = typeof payload.detail.code === 'string' ? payload.detail.code : 'REQUEST_FAILED';
      const message =
        typeof payload.detail.message === 'string'
          ? payload.detail.message
          : '요청을 처리하지 못했습니다.';
      return { code, message };
    }
    if (typeof payload.detail === 'string') {
      return { code: 'REQUEST_FAILED', message: payload.detail };
    }
    if (typeof payload.code === 'string' && typeof payload.message === 'string') {
      return { code: payload.code, message: payload.message };
    }
  }
  return { code: 'REQUEST_FAILED', message: '요청을 처리하지 못했습니다.' };
}

function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<unknown> | null = null;
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  retry = true,
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.csrf) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (
    response.status === 401 &&
    retry &&
    (!path.startsWith('/auth/') || path === '/auth/password')
  ) {
    try {
      refreshInFlight ??= apiRequest(
        '/auth/refresh',
        { method: 'POST', csrf: true },
        false,
      ).finally(() => {
        refreshInFlight = null;
      });
      await refreshInFlight;
      return apiRequest<T>(path, options, false);
    } catch {
      window.dispatchEvent(new Event('imleader-session-expired'));
    }
  }
  if (!response.ok) {
    const detail = parseErrorDetail(await readJson(response));
    throw new ApiError(detail.message, {
      status: response.status,
      code: detail.code,
      retryAfterSeconds: parseRetryAfter(response),
    });
  }

  if (response.status === 204) return undefined as T;
  return (await readJson(response)) as T;
}
