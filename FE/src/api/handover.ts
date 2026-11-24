import { apiRequest } from './client';
import {
  asArray,
  asEnum,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { ListResponse } from './types';

export type HandoverTargetKind = 'department' | 'production_line' | 'equipment';

export interface HandoverTarget {
  kind: HandoverTargetKind;
  target_id: number;
  code: string | null;
  name: string;
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

export interface HandoverNoteDetail extends HandoverNote {
  confirmations: HandoverConfirmation[];
}

export interface HandoverTargetInput {
  kind: HandoverTargetKind;
  id: number;
}

export interface HandoverListParams {
  q?: string;
  departmentId?: number;
  productionLineId?: number;
  equipmentId?: number;
  includeAll?: boolean;
  page?: number;
  pageSize?: number;
}

function parseTarget(value: unknown, field: string): HandoverTarget {
  const item = asRecord(value, field);
  return {
    kind: asEnum(item.kind, `${field}.kind`, [
      'department',
      'production_line',
      'equipment',
    ] as const),
    target_id: asNumber(item.target_id, `${field}.target_id`),
    code: asNullableString(item.code, `${field}.code`),
    name: asString(item.name, `${field}.name`),
  };
}

function parseNote(value: unknown, field: string): HandoverNote {
  const item = asRecord(value, field);
  return {
    note_id: asNumber(item.note_id, `${field}.note_id`),
    author_id: asNumber(item.author_id, `${field}.author_id`),
    author_display_name: asString(item.author_display_name, `${field}.author_display_name`),
    body: asString(item.body, `${field}.body`),
    version: asNumber(item.version, `${field}.version`),
    created_at: asString(item.created_at, `${field}.created_at`),
    updated_at: asString(item.updated_at, `${field}.updated_at`),
    targets: asArray(item.targets, `${field}.targets`).map((target, index) =>
      parseTarget(target, `${field}.targets[${index}]`),
    ),
    confirmed_count: asNumber(item.confirmed_count, `${field}.confirmed_count`),
    my_confirmed_at: asNullableString(item.my_confirmed_at, `${field}.my_confirmed_at`),
  };
}

function targetBody(targets: HandoverTargetInput[] | undefined) {
  return targets === undefined
    ? {}
    : { targets: targets.map((target) => ({ kind: target.kind, id: target.id })) };
}

export async function fetchHandoverNotes(
  params: HandoverListParams = {},
): Promise<ListResponse<HandoverNote>> {
  const payload = await apiRequest<unknown>(
    `/handover-notes${toQuery({
      q: params.q,
      department_id: params.departmentId,
      production_line_id: params.productionLineId,
      equipment_id: params.equipmentId,
      include_all: params.includeAll ? 'true' : undefined,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseNote(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchHandoverNote(noteId: number): Promise<HandoverNoteDetail> {
  const item = asRecord(await apiRequest<unknown>(`/handover-notes/${noteId}`), 'note');
  return {
    ...parseNote(item, 'note'),
    confirmations: asArray(item.confirmations, 'note.confirmations').map((value, index) => {
      const confirmation = asRecord(value, `note.confirmations[${index}]`);
      return {
        user_id: asNumber(confirmation.user_id, `note.confirmations[${index}].user_id`),
        display_name: asString(
          confirmation.display_name,
          `note.confirmations[${index}].display_name`,
        ),
        confirmed_at: asString(
          confirmation.confirmed_at,
          `note.confirmations[${index}].confirmed_at`,
        ),
      };
    }),
  };
}

export async function createHandoverNote(input: {
  body: string;
  targets?: HandoverTargetInput[];
}): Promise<HandoverNoteDetail> {
  const payload = await apiRequest<unknown>('/handover-notes', {
    method: 'POST',
    csrf: true,
    body: { body: input.body, ...targetBody(input.targets) },
  });
  return fetchHandoverNote(asNumber(asRecord(payload, 'note').note_id, 'note.note_id'));
}

export async function updateHandoverNote(
  noteId: number,
  input: { version: number; body?: string; targets?: HandoverTargetInput[] },
): Promise<HandoverNoteDetail> {
  await apiRequest<unknown>(`/handover-notes/${noteId}`, {
    method: 'PATCH',
    csrf: true,
    body: {
      version: input.version,
      ...(input.body === undefined ? {} : { body: input.body }),
      ...targetBody(input.targets),
    },
  });
  return fetchHandoverNote(noteId);
}

export async function deleteHandoverNote(noteId: number, expectedVersion: number): Promise<void> {
  await apiRequest<void>(
    `/handover-notes/${noteId}${toQuery({ expected_version: expectedVersion })}`,
    { method: 'DELETE', csrf: true },
  );
}

export async function confirmHandoverNote(noteId: number): Promise<{
  note_id: number;
  user_id: number;
  confirmed_at: string;
}> {
  const payload = asRecord(
    await apiRequest<unknown>(`/handover-notes/${noteId}/confirmation`, {
      method: 'PUT',
      csrf: true,
    }),
    'confirmation',
  );
  return {
    note_id: asNumber(payload.note_id, 'confirmation.note_id'),
    user_id: asNumber(payload.user_id, 'confirmation.user_id'),
    confirmed_at: asString(payload.confirmed_at, 'confirmation.confirmed_at'),
  };
}
