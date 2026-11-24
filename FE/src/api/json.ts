import { ApiError } from './client';
import type { Pagination } from './types';

export type JsonObject = Record<string, unknown>;

const INVALID_RESPONSE_MESSAGE = '서버 응답 형식이 올바르지 않습니다.';

function invalid(field: string): never {
  throw new ApiError(`${INVALID_RESPONSE_MESSAGE} (${field})`, {
    status: 500,
    code: 'INVALID_RESPONSE',
  });
}

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown, field: string): JsonObject {
  if (!isRecord(value)) invalid(field);
  return value;
}

export function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(field);
  return value;
}

export function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(field);
  return value;
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(field);
  return value;
}

export function asNullableString(value: unknown, field: string): string | null {
  return value === null ? null : asString(value, field);
}

export function asNullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : asNumber(value, field);
}

export function asEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    invalid(field);
  }
  return value as T;
}

export function asNullableEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | null {
  return value === null ? null : asEnum(value, field, allowed);
}

/**
 * 서버가 Decimal을 JSON 문자열 또는 숫자로 보낼 수 있는 필드를 숫자로 읽는다.
 * 값이 없으면 null을 반환한다.
 */
export function asDecimal(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalid(field);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  invalid(field);
}

export function parsePagination(payload: unknown, field: string): Pagination {
  const record = asRecord(payload, field);
  const pagination = asRecord(record.pagination, `${field}.pagination`);
  return {
    page: asNumber(pagination.page, `${field}.pagination.page`),
    page_size: asNumber(pagination.page_size, `${field}.pagination.page_size`),
    total_items: asNumber(pagination.total_items, `${field}.pagination.total_items`),
    total_pages: asNumber(pagination.total_pages, `${field}.pagination.total_pages`),
  };
}

export function toQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
