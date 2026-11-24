const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
const CSRF_COOKIE_NAME = 'imleader_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  csrf?: boolean;
  /** 액세스 만료(401) 시 자동 갱신 후 한 번 재시도한다. 인증 경로는 기본적으로 제외한다. */
  retryAuth?: boolean;
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function sendRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.csrf) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);
  }

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
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
}

async function parseResponseError(response: Response): Promise<ApiError> {
  const detail = parseErrorDetail(await readJson(response));
  return new ApiError(detail.message, {
    status: response.status,
    code: detail.code,
    retryAfterSeconds: parseRetryAfter(response),
  });
}

let refreshRequest: Promise<void> | null = null;

async function requestRefresh(): Promise<void> {
  const headers = new Headers({ Accept: 'application/json' });
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  if (csrfToken) headers.set(CSRF_HEADER_NAME, csrfToken);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.', {
      status: 0,
      code: 'NETWORK_ERROR',
    });
  }

  if (response.ok) return;

  const error = await parseResponseError(response);
  if (error.code === 'REFRESH_IN_PROGRESS') {
    await delay(Math.max(1, error.retryAfterSeconds ?? 1) * 1000);
    const retry = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
    if (retry.ok) return;
    throw await parseResponseError(retry);
  }
  throw error;
}

/** 여러 요청이 동시에 401을 받아도 갱신 요청은 한 번만 보낸다. */
function refreshAccessToken(): Promise<void> {
  refreshRequest ??= requestRefresh().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

/** 액세스 만료(401)면 한 번 갱신하고 같은 요청을 재시도한다. */
async function sendWithAuthRetry(path: string, options: RequestOptions): Promise<Response> {
  let response = await sendRequest(path, options);

  if (response.status === 401 && options.retryAuth !== false && !path.startsWith('/auth/')) {
    const error = await parseResponseError(response);
    if (error.code === 'AUTHENTICATION_REQUIRED') {
      try {
        await refreshAccessToken();
      } catch {
        window.dispatchEvent(new Event('imleader:session-expired'));
        throw error;
      }
      response = await sendRequest(path, options);
    } else {
      throw error;
    }
  }

  if (!response.ok) throw await parseResponseError(response);
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendWithAuthRetry(path, options);
  if (response.status === 204) return undefined as T;
  return (await readJson(response)) as T;
}

/** PDF·이미지 등 JSON이 아닌 응답을 그대로 받는다. */
export async function apiRequestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await sendWithAuthRetry(path, options);
  return await response.blob();
}
