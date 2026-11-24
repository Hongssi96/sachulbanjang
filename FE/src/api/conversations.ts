import { ApiError, apiRequest } from './client';

export type ChatJobState =
  'accepted' | 'querying' | 'writing' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';

export interface ChatEvidence {
  report_id: number | null;
  process_record_id: number | null;
  inspection_record_id: number | null;
  product_id: number | null;
  source_version: number | null;
  source_time: string | null;
}

export interface ChatTurnJob {
  job_id: number;
  state: ChatJobState;
  accepted_at: string;
  data_cutoff_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  safe_error_message: string | null;
}

export interface ChatTurn {
  turn_id: number;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  data_cutoff_at: string | null;
  is_demo: boolean | null;
  job: ChatTurnJob | null;
  evidence: ChatEvidence[];
}

export interface ConversationSummary {
  conversation_id: number;
  title: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  turns: ChatTurn[];
}

export interface ConversationList {
  items: ConversationSummary[];
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
}

export interface AcceptedChatTurn {
  conversation_id: number;
  turn_id: number;
  job_id: number;
  state: ChatJobState;
  accepted_at: string;
  data_cutoff_at: string | null;
}

const jobStates: ChatJobState[] = [
  'accepted',
  'querying',
  'writing',
  'succeeded',
  'failed',
  'interrupted',
  'cancelled',
];

function invalid(): never {
  throw new ApiError('대화 서버 응답 형식이 올바르지 않습니다.', {
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

function nullableInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean') invalid();
  return value;
}

function state(value: unknown): ChatJobState {
  const result = string(value);
  if (!jobStates.includes(result as ChatJobState)) invalid();
  return result as ChatJobState;
}

function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) invalid();
  return value.map(parse);
}

function parseEvidence(value: unknown): ChatEvidence {
  const data = record(value);
  return {
    report_id: nullableInteger(data.report_id),
    process_record_id: nullableInteger(data.process_record_id),
    inspection_record_id: nullableInteger(data.inspection_record_id),
    product_id: nullableInteger(data.product_id),
    source_version: nullableInteger(data.source_version),
    source_time: nullableString(data.source_time),
  };
}

function parseJob(value: unknown): ChatTurnJob | null {
  if (value === null || value === undefined) return null;
  const data = record(value);
  return {
    job_id: integer(data.job_id),
    state: state(data.state),
    accepted_at: string(data.accepted_at),
    data_cutoff_at: nullableString(data.data_cutoff_at),
    finished_at: nullableString(data.finished_at),
    error_code: nullableString(data.error_code),
    safe_error_message: nullableString(data.safe_error_message),
  };
}

function parseTurn(value: unknown): ChatTurn {
  const data = record(value);
  return {
    turn_id: integer(data.turn_id),
    question: string(data.question),
    answer: nullableString(data.answer),
    answered_at: nullableString(data.answered_at),
    created_at: string(data.created_at),
    data_cutoff_at: nullableString(data.data_cutoff_at),
    is_demo: nullableBoolean(data.is_demo),
    job: parseJob(data.job),
    evidence: array(data.evidence, parseEvidence),
  };
}

function parseSummary(value: unknown): ConversationSummary {
  const data = record(value);
  return {
    conversation_id: integer(data.conversation_id),
    title: string(data.title),
    turn_count: integer(data.turn_count),
    created_at: string(data.created_at),
    updated_at: string(data.updated_at),
  };
}

function parseDetail(value: unknown): ConversationDetail {
  const data = record(value);
  return { ...parseSummary(data), turns: array(data.turns, parseTurn) };
}

function parseList(value: unknown): ConversationList {
  const data = record(value);
  const pagination = record(data.pagination);
  return {
    items: array(data.items, parseSummary),
    pagination: {
      page: integer(pagination.page),
      page_size: integer(pagination.page_size),
      total_items: integer(pagination.total_items),
      total_pages: integer(pagination.total_pages),
    },
  };
}

function parseAccepted(value: unknown): AcceptedChatTurn {
  const data = record(value);
  return {
    conversation_id: integer(data.conversation_id),
    turn_id: integer(data.turn_id),
    job_id: integer(data.job_id),
    state: state(data.state),
    accepted_at: string(data.accepted_at),
    data_cutoff_at: nullableString(data.data_cutoff_at),
  };
}

function requestKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function listConversations(search: string) {
  const params = new URLSearchParams({ page: '1', page_size: '100' });
  const query = search.trim().slice(0, 100);
  if (query) params.set('q', query);
  const payload = await apiRequest<unknown>(`/conversations?${params.toString()}`);
  return parseList(payload);
}

export async function getConversation(id: number) {
  const payload = await apiRequest<unknown>(`/conversations/${id}`);
  return parseDetail(payload);
}

export async function createConversation(title: string) {
  const payload = await apiRequest<unknown>('/conversations', {
    method: 'POST',
    body: { title: title.trim().slice(0, 200) || '새 대화' },
    csrf: true,
  });
  return parseDetail(payload);
}

export async function submitChatTurn(conversationId: number, question: string) {
  const payload = await apiRequest<unknown>(`/conversations/${conversationId}/turns`, {
    method: 'POST',
    body: { question, client_request_key: requestKey() },
    csrf: true,
  });
  return parseAccepted(payload);
}

export async function retryChatTurn(conversationId: number, turnId: number) {
  const payload = await apiRequest<unknown>(
    `/conversations/${conversationId}/turns/${turnId}/retry`,
    { method: 'POST', body: { client_request_key: requestKey() }, csrf: true },
  );
  return parseAccepted(payload);
}

export async function refreshChatTurn(conversationId: number, turnId: number) {
  const payload = await apiRequest<unknown>(
    `/conversations/${conversationId}/turns/${turnId}/refresh`,
    { method: 'POST', body: { client_request_key: requestKey() }, csrf: true },
  );
  return parseAccepted(payload);
}

export async function deleteConversation(id: number) {
  await apiRequest<void>(`/conversations/${id}`, { method: 'DELETE', csrf: true });
}
