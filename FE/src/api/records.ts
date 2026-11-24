import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asDecimal,
  asEnum,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { Pagination } from './types';

export type Verdict = 'good' | 'defect';

export interface ProcessRecord {
  record_id: number;
  equipment_id: number;
  equipment_code: string;
  equipment_name: string;
  product_id: number | null;
  product_code: string | null;
  product_name: string | null;
  occurred_at: string;
  available_at: string | null;
  cycle_time_seconds: number | null;
  is_demo: boolean;
  version: number;
}

export interface ProcessRecordDetail extends ProcessRecord {
  source_import_id: number;
  source_row_number: number;
}

export interface InspectionRecord {
  record_id: number;
  equipment_id: number;
  equipment_code: string;
  equipment_name: string;
  product_id: number | null;
  product_code: string | null;
  product_name: string | null;
  process_record_id: number | null;
  inspected_at: string;
  available_at: string | null;
  verdict: Verdict;
  defect_type: string | null;
  reason: string | null;
  is_demo: boolean;
  version: number;
}

export interface RecordList<T> {
  items: T[];
  pagination: Pagination;
}

export interface RecordListParams {
  equipmentId?: number;
  productId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  verdict?: Verdict;
}

export interface ProcessRecordUpdate {
  version: number;
  changeReason: string;
  occurredAt?: string;
  cycleTimeSeconds?: number;
  productId?: number;
  equipmentId?: number;
}

export interface InspectionRecordUpdate {
  version: number;
  changeReason: string;
  inspectedAt?: string;
  productId?: number | null;
  processRecordId?: number | null;
  verdict?: Verdict;
  defectType?: string | null;
  reason?: string | null;
}

export interface RecordChange {
  change_id: number;
  operation: string;
  actor_id: number;
  actor_display_name: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string;
  version: number;
  occurred_at: string;
}

function parseProcessRecord(value: unknown, field: string): ProcessRecord {
  const item = asRecord(value, field);
  return {
    record_id: asNumber(item.record_id, `${field}.record_id`),
    equipment_id: asNumber(item.equipment_id, `${field}.equipment_id`),
    equipment_code: asString(item.equipment_code, `${field}.equipment_code`),
    equipment_name: asString(item.equipment_name, `${field}.equipment_name`),
    product_id: asNullableNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    product_name: asNullableString(item.product_name, `${field}.product_name`),
    occurred_at: asString(item.occurred_at, `${field}.occurred_at`),
    available_at: asNullableString(item.available_at, `${field}.available_at`),
    cycle_time_seconds: asDecimal(item.cycle_time_seconds, `${field}.cycle_time_seconds`),
    is_demo: asBoolean(item.is_demo, `${field}.is_demo`),
    version: asNumber(item.version, `${field}.version`),
  };
}

function parseInspectionRecord(value: unknown, field: string): InspectionRecord {
  const item = asRecord(value, field);
  return {
    record_id: asNumber(item.record_id, `${field}.record_id`),
    equipment_id: asNumber(item.equipment_id, `${field}.equipment_id`),
    equipment_code: asString(item.equipment_code, `${field}.equipment_code`),
    equipment_name: asString(item.equipment_name, `${field}.equipment_name`),
    product_id: asNullableNumber(item.product_id, `${field}.product_id`),
    product_code: asNullableString(item.product_code, `${field}.product_code`),
    product_name: asNullableString(item.product_name, `${field}.product_name`),
    process_record_id: asNullableNumber(item.process_record_id, `${field}.process_record_id`),
    inspected_at: asString(item.inspected_at, `${field}.inspected_at`),
    available_at: asNullableString(item.available_at, `${field}.available_at`),
    verdict: asEnum(item.verdict, `${field}.verdict`, ['good', 'defect'] as const),
    defect_type: asNullableString(item.defect_type, `${field}.defect_type`),
    reason: asNullableString(item.reason, `${field}.reason`),
    is_demo: asBoolean(item.is_demo, `${field}.is_demo`),
    version: asNumber(item.version, `${field}.version`),
  };
}

function recordQuery(params: RecordListParams, includeVerdict: boolean) {
  return toQuery({
    equipment_id: params.equipmentId,
    product_id: params.productId,
    from: params.from,
    to: params.to,
    page: params.page,
    page_size: params.pageSize,
    verdict: includeVerdict ? params.verdict : undefined,
  });
}

export async function fetchProcessRecords(
  params: RecordListParams = {},
): Promise<RecordList<ProcessRecord>> {
  const payload = await apiRequest<unknown>(`/process-records${recordQuery(params, false)}`);
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseProcessRecord(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchProcessRecord(recordId: number): Promise<ProcessRecordDetail> {
  const item = asRecord(await apiRequest<unknown>(`/process-records/${recordId}`), 'record');
  return {
    ...parseProcessRecord(item, 'record'),
    source_import_id: asNumber(item.source_import_id, 'record.source_import_id'),
    source_row_number: asNumber(item.source_row_number, 'record.source_row_number'),
  };
}

export async function fetchInspectionRecords(
  params: RecordListParams = {},
): Promise<RecordList<InspectionRecord>> {
  const payload = await apiRequest<unknown>(`/inspection-records${recordQuery(params, true)}`);
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseInspectionRecord(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchInspectionRecord(recordId: number): Promise<InspectionRecord> {
  return parseInspectionRecord(
    await apiRequest<unknown>(`/inspection-records/${recordId}`),
    'record',
  );
}

export async function updateProcessRecord(
  recordId: number,
  input: ProcessRecordUpdate,
): Promise<ProcessRecord> {
  return parseProcessRecord(
    await apiRequest<unknown>(`/process-records/${recordId}`, {
      method: 'PATCH',
      csrf: true,
      body: {
        version: input.version,
        change_reason: input.changeReason,
        ...(input.occurredAt === undefined ? {} : { occurred_at: input.occurredAt }),
        ...(input.cycleTimeSeconds === undefined
          ? {}
          : { cycle_time_seconds: input.cycleTimeSeconds }),
        ...(input.productId === undefined ? {} : { product_id: input.productId }),
        ...(input.equipmentId === undefined ? {} : { equipment_id: input.equipmentId }),
      },
    }),
    'record',
  );
}

export async function updateInspectionRecord(
  recordId: number,
  input: InspectionRecordUpdate,
): Promise<InspectionRecord> {
  return parseInspectionRecord(
    await apiRequest<unknown>(`/inspection-records/${recordId}`, {
      method: 'PATCH',
      csrf: true,
      body: {
        version: input.version,
        change_reason: input.changeReason,
        ...(input.inspectedAt === undefined ? {} : { inspected_at: input.inspectedAt }),
        ...(input.productId === undefined ? {} : { product_id: input.productId }),
        ...(input.processRecordId === undefined
          ? {}
          : { process_record_id: input.processRecordId }),
        ...(input.verdict === undefined ? {} : { verdict: input.verdict }),
        ...(input.defectType === undefined ? {} : { defect_type: input.defectType }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      },
    }),
    'record',
  );
}

function parseChange(value: unknown, field: string): RecordChange {
  const item = asRecord(value, field);
  return {
    change_id: asNumber(item.change_id, `${field}.change_id`),
    operation: asString(item.operation, `${field}.operation`),
    actor_id: asNumber(item.actor_id, `${field}.actor_id`),
    actor_display_name: asString(item.actor_display_name, `${field}.actor_display_name`),
    before_value: item.before_value === null ? null : asRecord(item.before_value, field),
    after_value: item.after_value === null ? null : asRecord(item.after_value, field),
    reason: asString(item.reason, `${field}.reason`),
    version: asNumber(item.version, `${field}.version`),
    occurred_at: asString(item.occurred_at, `${field}.occurred_at`),
  };
}

async function fetchChanges(path: string): Promise<RecordChange[]> {
  const payload = await apiRequest<unknown>(path);
  return asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
    parseChange(item, `items[${index}]`),
  );
}

export function fetchProcessRecordChanges(recordId: number): Promise<RecordChange[]> {
  return fetchChanges(`/process-records/${recordId}/changes`);
}

export function fetchInspectionRecordChanges(recordId: number): Promise<RecordChange[]> {
  return fetchChanges(`/inspection-records/${recordId}/changes`);
}
