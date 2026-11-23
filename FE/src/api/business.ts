import { ApiError, apiRequest } from './client';

export type Row = Record<string, unknown>;
export interface Page {
  items: Row[];
  total: number;
  pages: number;
}
export function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError('서버 응답 형식이 올바르지 않습니다.', {
      status: 500,
      code: 'INVALID_RESPONSE',
    });
  return value as Row;
}
export function text(value: unknown): string {
  return value === null || value === undefined
    ? '—'
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : typeof value === 'boolean'
        ? value
          ? '예'
          : '아니요'
        : '—';
}
export function number(value: unknown): number {
  const result = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(result)) throw new Error('서버 숫자 응답을 확인해 주세요.');
  return result;
}
export function items(value: unknown): Row[] {
  const data = object(value);
  if (!Array.isArray(data.items)) throw new Error('서버 목록 응답을 확인해 주세요.');
  return data.items.map(object);
}
export async function read(path: string) {
  return object(await apiRequest<unknown>(path));
}
export async function list(path: string): Promise<Page> {
  const data = await read(path);
  const pagination = data.pagination === undefined ? null : object(data.pagination);
  const rows = items(data);
  return {
    items: rows,
    total: pagination ? number(pagination.total_items) : rows.length,
    pages: pagination ? number(pagination.total_pages) : 1,
  };
}
export async function write(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
) {
  return apiRequest<unknown>(path, { method, body, csrf: true });
}
export function query(path: string, values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return `${path}?${params}`;
}
export function date(value: unknown) {
  if (typeof value !== 'string') return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '.');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(parsed);
}
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

export function formText(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

export function localDateTime(value: unknown) {
  if (typeof value !== 'string') return '';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
