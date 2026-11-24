import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asEnum,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { ListResponse } from './types';
import type { JobState } from './reportJobs';

export type AnswerStatus = 'available' | 'hidden_permission' | 'available_with_deleted_evidence';

export const ANSWER_STATUSES: readonly AnswerStatus[] = [
  'available',
  'hidden_permission',
  'available_with_deleted_evidence',
];

export interface ChatTurnJob {
  job_id: number;
  state: JobState;
  accepted_at: string;
  data_cutoff_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  safe_error_message: string | null;
}

export interface AnswerEvidence {
  report_id: number | null;
  process_record_id: number | null;
  inspection_record_id: number | null;
  product_id: number | null;
  source_version: number | null;
  source_time: string | null;
}

export interface ChatTurn {
  turn_id: number;
  question: string;
  answer: string | null;
  answer_status: AnswerStatus;
  answered_at: string | null;
  created_at: string;
  data_cutoff_at: string | null;
  is_demo: boolean | null;
  job: ChatTurnJob | null;
  evidence: AnswerEvidence[];
}

export interface ConversationListItem {
  conversation_id: number;
  title: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationListItem {
  turns: ChatTurn[];
}

export interface ConversationListParams {
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ChatTurnAccepted {
  conversation_id: number;
  turn_id: number;
  job_id: number;
  state: JobState;
  accepted_at: string;
  data_cutoff_at: string | null;
}

function parseJob(value: unknown, field: string): ChatTurnJob | null {
  if (value === null || value === undefined) return null;
  const item = asRecord(value, field);
  return {
    job_id: asNumber(item.job_id, `${field}.job_id`),
    state: asEnum(item.state, `${field}.state`, [
      'accepted',
      'querying',
      'writing',
      'succeeded',
      'failed',
      'interrupted',
      'cancelled',
    ] as const),
    accepted_at: asString(item.accepted_at, `${field}.accepted_at`),
    data_cutoff_at: asNullableString(item.data_cutoff_at, `${field}.data_cutoff_at`),
    finished_at: asNullableString(item.finished_at, `${field}.finished_at`),
    error_code: asNullableString(item.error_code, `${field}.error_code`),
    safe_error_message: asNullableString(item.safe_error_message, `${field}.safe_error_message`),
  };
}

function parseEvidence(value: unknown, field: string): AnswerEvidence {
  const item = asRecord(value, field);
  return {
    report_id: asNullableNumber(item.report_id, `${field}.report_id`),
    process_record_id: asNullableNumber(item.process_record_id, `${field}.process_record_id`),
    inspection_record_id: asNullableNumber(
      item.inspection_record_id,
      `${field}.inspection_record_id`,
    ),
    product_id: asNullableNumber(item.product_id, `${field}.product_id`),
    source_version: asNullableNumber(item.source_version, `${field}.source_version`),
    source_time: asNullableString(item.source_time, `${field}.source_time`),
  };
}

function parseTurn(value: unknown, field: string): ChatTurn {
  const item = asRecord(value, field);
  return {
    turn_id: asNumber(item.turn_id, `${field}.turn_id`),
    question: asString(item.question, `${field}.question`),
    answer: asNullableString(item.answer, `${field}.answer`),
    answer_status: asEnum(item.answer_status, `${field}.answer_status`, ANSWER_STATUSES),
    answered_at: asNullableString(item.answered_at, `${field}.answered_at`),
    created_at: asString(item.created_at, `${field}.created_at`),
    data_cutoff_at: asNullableString(item.data_cutoff_at, `${field}.data_cutoff_at`),
    is_demo:
      item.is_demo === null || item.is_demo === undefined
        ? null
        : asBoolean(item.is_demo, `${field}.is_demo`),
    job: parseJob(item.job, `${field}.job`),
    evidence: asArray(item.evidence, `${field}.evidence`).map((entry, index) =>
      parseEvidence(entry, `${field}.evidence[${index}]`),
    ),
  };
}

function parseListItem(value: unknown, field: string): ConversationListItem {
  const item = asRecord(value, field);
  return {
    conversation_id: asNumber(item.conversation_id, `${field}.conversation_id`),
    title: asString(item.title, `${field}.title`),
    turn_count: asNumber(item.turn_count, `${field}.turn_count`),
    created_at: asString(item.created_at, `${field}.created_at`),
    updated_at: asString(item.updated_at, `${field}.updated_at`),
  };
}

export async function fetchConversations(
  params: ConversationListParams = {},
): Promise<ListResponse<ConversationListItem>> {
  const payload = await apiRequest<unknown>(
    `/conversations${toQuery({
      q: params.q,
      from: params.from,
      to: params.to,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseListItem(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchConversation(conversationId: number): Promise<ConversationDetail> {
  const item = asRecord(
    await apiRequest<unknown>(`/conversations/${conversationId}`),
    'conversation',
  );
  return {
    ...parseListItem(item, 'conversation'),
    turns: asArray(item.turns, 'conversation.turns').map((turn, index) =>
      parseTurn(turn, `conversation.turns[${index}]`),
    ),
  };
}

export async function createConversation(title: string): Promise<ConversationDetail> {
  const item = asRecord(
    await apiRequest<unknown>('/conversations', {
      method: 'POST',
      csrf: true,
      body: { title },
    }),
    'conversation',
  );
  return {
    ...parseListItem(item, 'conversation'),
    turns: asArray(item.turns, 'conversation.turns').map((turn, index) =>
      parseTurn(turn, `conversation.turns[${index}]`),
    ),
  };
}

export async function deleteConversation(conversationId: number): Promise<void> {
  await apiRequest<void>(`/conversations/${conversationId}`, { method: 'DELETE', csrf: true });
}

function parseAccepted(payload: unknown): ChatTurnAccepted {
  const item = asRecord(payload, 'turn');
  return {
    conversation_id: asNumber(item.conversation_id, 'turn.conversation_id'),
    turn_id: asNumber(item.turn_id, 'turn.turn_id'),
    job_id: asNumber(item.job_id, 'turn.job_id'),
    state: asEnum(item.state, 'turn.state', [
      'accepted',
      'querying',
      'writing',
      'succeeded',
      'failed',
      'interrupted',
      'cancelled',
    ] as const),
    accepted_at: asString(item.accepted_at, 'turn.accepted_at'),
    data_cutoff_at: asNullableString(item.data_cutoff_at, 'turn.data_cutoff_at'),
  };
}

export async function submitTurn(
  conversationId: number,
  input: { question: string; clientRequestKey: string },
): Promise<ChatTurnAccepted> {
  return parseAccepted(
    await apiRequest<unknown>(`/conversations/${conversationId}/turns`, {
      method: 'POST',
      csrf: true,
      body: { question: input.question, client_request_key: input.clientRequestKey },
    }),
  );
}

export async function refreshTurn(
  conversationId: number,
  turnId: number,
  clientRequestKey: string,
): Promise<ChatTurnAccepted> {
  return parseAccepted(
    await apiRequest<unknown>(`/conversations/${conversationId}/turns/${turnId}/refresh`, {
      method: 'POST',
      csrf: true,
      body: { client_request_key: clientRequestKey },
    }),
  );
}

export async function retryTurn(
  conversationId: number,
  turnId: number,
  clientRequestKey: string,
): Promise<ChatTurnAccepted> {
  return parseAccepted(
    await apiRequest<unknown>(`/conversations/${conversationId}/turns/${turnId}/retry`, {
      method: 'POST',
      csrf: true,
      body: { client_request_key: clientRequestKey },
    }),
  );
}
