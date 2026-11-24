import { ApiError, apiRequest } from './client';

export type HandoverTargetKind = 'department' | 'production_line' | 'equipment';

export interface HandoverTarget {
  kind: HandoverTargetKind;
  target_id: number;
  code: string | null;
  name: string;
}

export interface HandoverTargetInput {
  kind: HandoverTargetKind;
  id: number;
}

export interface HandoverConfirmation {
  user_id: number;
  display_name: string;
  confirmed_at: string;
}

export interface HandoverNote {
  note_id: number;
  author_id: number;
  author_display_name: string;
  body: string;
  version: number;
  created_at: string;
  updated_at: string;
  targets: HandoverTarget[];
  confirmed_count: number;
  my_confirmed_at: string | null;
}

export interface HandoverDetail extends HandoverNote {
  confirmations: HandoverConfirmation[];
}

export interface HandoverList {
  items: HandoverNote[];
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
}

export interface HandoverListParams {
  page: number;
  query: string;
  includeAll?: boolean;
}

const targetKinds: HandoverTargetKind[] = ['department', 'production_line', 'equipment'];

function invalid(): never {
  throw new ApiError('인수인계 서버 응답 형식이 올바르지 않습니다.', {
    status: 500,
    code: 'INVALID_RESPONSE',
  });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) invalid();
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}

function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parse);
}

function targetKind(value: unknown): HandoverTargetKind {
  const result = string(value);
  if (!targetKinds.includes(result as HandoverTargetKind)) invalid();
  return result as HandoverTargetKind;
}

function parseTarget(value: unknown): HandoverTarget {
  const data = record(value);
  return {
    kind: targetKind(data.kind),
    target_id: integer(data.target_id),
    code: nullableString(data.code),
    name: string(data.name),
  };
}

function parseConfirmation(value: unknown): HandoverConfirmation {
  const data = record(value);
  return {
    user_id: integer(data.user_id),
    display_name: string(data.display_name),
    confirmed_at: string(data.confirmed_at),
  };
}

function parseNote(value: unknown): HandoverNote {
  const data = record(value);
  return {
    note_id: integer(data.note_id),
    author_id: integer(data.author_id),
    author_display_name: string(data.author_display_name),
    body: string(data.body),
    version: integer(data.version),
    created_at: string(data.created_at),
    updated_at: string(data.updated_at),
    targets: array(data.targets, parseTarget),
    confirmed_count: integer(data.confirmed_count),
    my_confirmed_at: nullableString(data.my_confirmed_at),
  };
}

function parseDetail(value: unknown): HandoverDetail {
  const data = record(value);
  return { ...parseNote(data), confirmations: array(data.confirmations, parseConfirmation) };
}

function parseList(value: unknown): HandoverList {
  const data = record(value);
  const pagination = record(data.pagination);
  return {
    items: array(data.items, parseNote),
    pagination: {
      page: integer(pagination.page),
      page_size: integer(pagination.page_size),
      total_items: integer(pagination.total_items),
      total_pages: integer(pagination.total_pages),
    },
  };
}

function parseDepartmentTarget(value: unknown): HandoverTarget {
  const data = record(value);
  return {
    kind: 'department',
    target_id: integer(data.department_id),
    code: nullableString(data.code),
    name: string(data.name),
  };
}

function parseLineTarget(value: unknown): HandoverTarget {
  const data = record(value);
  return {
    kind: 'production_line',
    target_id: integer(data.production_line_id),
    code: nullableString(data.code),
    name: string(data.name),
  };
}

function parseEquipmentTarget(value: unknown): HandoverTarget {
  const data = record(value);
  return {
    kind: 'equipment',
    target_id: integer(data.equipment_id),
    code: nullableString(data.equipment_code),
    name: string(data.name),
  };
}

export async function listHandoverNotes({
  page,
  query,
  includeAll = false,
}: HandoverListParams): Promise<HandoverList> {
  const params = new URLSearchParams({ page: String(page), page_size: '10' });
  const search = query.trim().slice(0, 200);
  if (search) params.set('q', search);
  if (includeAll) params.set('include_all', 'true');
  const payload = await apiRequest<unknown>(`/handover-notes?${params.toString()}`);
  return parseList(payload);
}

export async function getHandoverNote(noteId: number): Promise<HandoverDetail> {
  const payload = await apiRequest<unknown>(`/handover-notes/${noteId}`);
  return parseDetail(payload);
}

export async function createHandoverNote(
  body: string,
  targets?: HandoverTargetInput[],
): Promise<HandoverDetail> {
  const payload = await apiRequest<unknown>('/handover-notes', {
    method: 'POST',
    body: targets ? { body, targets } : { body },
    csrf: true,
  });
  return parseDetail(payload);
}

export async function updateHandoverNote(
  noteId: number,
  version: number,
  body: string,
  targets?: HandoverTargetInput[],
): Promise<HandoverDetail> {
  const payload = await apiRequest<unknown>(`/handover-notes/${noteId}`, {
    method: 'PATCH',
    body: targets ? { version, body, targets } : { version, body },
    csrf: true,
  });
  return parseDetail(payload);
}

export async function deleteHandoverNote(noteId: number, expectedVersion: number): Promise<void> {
  await apiRequest<void>(`/handover-notes/${noteId}?expected_version=${expectedVersion}`, {
    method: 'DELETE',
    csrf: true,
  });
}

export async function confirmHandoverNote(noteId: number): Promise<void> {
  await apiRequest<unknown>(`/handover-notes/${noteId}/confirmation`, {
    method: 'PUT',
    csrf: true,
  });
}

export async function getMyHandoverTargets(): Promise<HandoverTarget[]> {
  const payload = await apiRequest<unknown>('/assignments/me');
  const data = record(payload);
  return [
    ...array(data.departments, parseDepartmentTarget),
    ...array(data.production_lines, parseLineTarget),
    ...array(data.equipment, parseEquipmentTarget),
  ];
}
