import { apiRequest } from './client';
import {
  asArray,
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
import type { ReportCategory, ReportKind } from './reports';

export type JobState =
  'accepted' | 'querying' | 'writing' | 'succeeded' | 'failed' | 'interrupted' | 'cancelled';

export const JOB_STATES: readonly JobState[] = [
  'accepted',
  'querying',
  'writing',
  'succeeded',
  'failed',
  'interrupted',
  'cancelled',
];

export interface ReportJob {
  job_id: number;
  kind: 'report' | 'chat';
  state: JobState;
  client_request_key: string;
  accepted_at: string;
  data_cutoff_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  safe_error_message: string | null;
  retry_of_id: number | null;
  attempt_count: number;
  report_id: number | null;
}

export interface ReportJobDetail extends ReportJob {
  request_payload: Record<string, unknown>;
  claimed_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
}

export interface ReportJobCreateInput {
  clientRequestKey: string;
  reportKind?: ReportKind;
  category: ReportCategory;
  from?: string;
  to?: string;
  departmentIds?: number[];
  productionLineIds?: number[];
  equipmentIds?: number[];
}

export interface ReportJobAccepted {
  job_id: number;
  state: JobState;
  accepted_at: string;
  data_cutoff_at: string | null;
}

function parseJob(value: unknown, field: string): ReportJob {
  const item = asRecord(value, field);
  return {
    job_id: asNumber(item.job_id, `${field}.job_id`),
    kind: asEnum(item.kind, `${field}.kind`, ['report', 'chat'] as const),
    state: asEnum(item.state, `${field}.state`, JOB_STATES),
    client_request_key: asString(item.client_request_key, `${field}.client_request_key`),
    accepted_at: asString(item.accepted_at, `${field}.accepted_at`),
    data_cutoff_at: asNullableString(item.data_cutoff_at, `${field}.data_cutoff_at`),
    finished_at: asNullableString(item.finished_at, `${field}.finished_at`),
    error_code: asNullableString(item.error_code, `${field}.error_code`),
    safe_error_message: asNullableString(item.safe_error_message, `${field}.safe_error_message`),
    retry_of_id: asNullableNumber(item.retry_of_id, `${field}.retry_of_id`),
    attempt_count: asNumber(item.attempt_count, `${field}.attempt_count`),
    report_id: asNullableNumber(item.report_id, `${field}.report_id`),
  };
}

export async function submitReportJob(input: ReportJobCreateInput): Promise<ReportJobAccepted> {
  const payload = asRecord(
    await apiRequest<unknown>('/report-jobs', {
      method: 'POST',
      csrf: true,
      body: {
        client_request_key: input.clientRequestKey,
        report_kind: input.reportKind ?? 'general',
        category: input.category,
        period: { from: input.from ?? null, to: input.to ?? null },
        targets: {
          department_ids: input.departmentIds ?? [],
          production_line_ids: input.productionLineIds ?? [],
          equipment_ids: input.equipmentIds ?? [],
        },
      },
    }),
    'reportJob',
  );
  return {
    job_id: asNumber(payload.job_id, 'reportJob.job_id'),
    state: asEnum(payload.state, 'reportJob.state', JOB_STATES),
    accepted_at: asString(payload.accepted_at, 'reportJob.accepted_at'),
    data_cutoff_at: asNullableString(payload.data_cutoff_at, 'reportJob.data_cutoff_at'),
  };
}

export async function fetchReportJobs(
  params: { kind?: 'report' | 'chat'; state?: JobState; page?: number; pageSize?: number } = {},
): Promise<ListResponse<ReportJob>> {
  const payload = await apiRequest<unknown>(
    `/jobs${toQuery({
      kind: params.kind,
      state: params.state,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseJob(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchReportJob(jobId: number): Promise<ReportJobDetail> {
  const item = asRecord(await apiRequest<unknown>(`/jobs/${jobId}`), 'job');
  return {
    ...parseJob(item, 'job'),
    request_payload: asRecord(item.request_payload, 'job.request_payload'),
    claimed_at: asNullableString(item.claimed_at, 'job.claimed_at'),
    heartbeat_at: asNullableString(item.heartbeat_at, 'job.heartbeat_at'),
    lease_expires_at: asNullableString(item.lease_expires_at, 'job.lease_expires_at'),
  };
}

export async function cancelReportJob(jobId: number): Promise<void> {
  await apiRequest<void>(`/jobs/${jobId}/cancel`, { method: 'POST', csrf: true });
}

export async function retryReportJob(
  jobId: number,
  clientRequestKey: string,
): Promise<ReportJobAccepted> {
  const payload = asRecord(
    await apiRequest<unknown>(`/jobs/${jobId}/retry`, {
      method: 'POST',
      csrf: true,
      body: { client_request_key: clientRequestKey },
    }),
    'reportJob',
  );
  return {
    job_id: asNumber(payload.job_id, 'reportJob.job_id'),
    state: asEnum(payload.state, 'reportJob.state', JOB_STATES),
    accepted_at: asString(payload.accepted_at, 'reportJob.accepted_at'),
    data_cutoff_at: asNullableString(payload.data_cutoff_at, 'reportJob.data_cutoff_at'),
  };
}
