import { apiRequest } from './client';
import { asArray, asEnum, asNumber, asRecord, asString, parsePagination, toQuery } from './json';
import type { ListResponse } from './types';

export type ReportCategory =
  | 'equipment_issue'
  | 'quality_report'
  | 'inspection_done'
  | 'periodic_weekly'
  | 'periodic_monthly'
  | 'other';
export type ReportKind = 'general' | 'weekly' | 'monthly';
export type ReportStatus = 'pending' | 'in_progress' | 'completed';

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  'equipment_issue',
  'quality_report',
  'inspection_done',
  'periodic_weekly',
  'periodic_monthly',
  'other',
];
export const REPORT_STATUSES: readonly ReportStatus[] = ['pending', 'in_progress', 'completed'];

export interface ReportListItem {
  report_id: number;
  title: string;
  category: ReportCategory;
  report_kind: ReportKind;
  business_status: ReportStatus;
  author_id: number;
  author_display_name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReportDetail extends ReportListItem {
  body_markdown: string;
  last_editor_id: number | null;
  last_editor_display_name: string | null;
}

export interface ReportListParams {
  q?: string;
  category?: ReportCategory;
  businessStatus?: ReportStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportInput {
  title: string;
  bodyMarkdown: string;
  category: ReportCategory;
  reportKind?: ReportKind;
}

export interface ReportRevision {
  version: number;
  title: string;
  body_markdown: string;
  editor_id: number;
  editor_display_name: string;
  created_at: string;
}

export interface ReportStatusEvent {
  event_id: number;
  before_status: ReportStatus;
  after_status: ReportStatus;
  actor_id: number;
  actor_display_name: string;
  created_at: string;
}

function parseReportItem(value: unknown, field: string): ReportListItem {
  const item = asRecord(value, field);
  return {
    report_id: asNumber(item.report_id, `${field}.report_id`),
    title: asString(item.title, `${field}.title`),
    category: asEnum(item.category, `${field}.category`, REPORT_CATEGORIES),
    report_kind: asEnum(item.report_kind, `${field}.report_kind`, [
      'general',
      'weekly',
      'monthly',
    ] as const),
    business_status: asEnum(item.business_status, `${field}.business_status`, REPORT_STATUSES),
    author_id: asNumber(item.author_id, `${field}.author_id`),
    author_display_name: asString(item.author_display_name, `${field}.author_display_name`),
    version: asNumber(item.version, `${field}.version`),
    created_at: asString(item.created_at, `${field}.created_at`),
    updated_at: asString(item.updated_at, `${field}.updated_at`),
  };
}

function parseReportDetail(value: unknown): ReportDetail {
  const item = asRecord(value, 'report');
  return {
    ...parseReportItem(item, 'report'),
    body_markdown: asString(item.body_markdown, 'report.body_markdown'),
    last_editor_id:
      item.last_editor_id === null ? null : asNumber(item.last_editor_id, 'report.last_editor_id'),
    last_editor_display_name:
      item.last_editor_display_name === null
        ? null
        : asString(item.last_editor_display_name, 'report.last_editor_display_name'),
  };
}

export async function fetchReports(
  params: ReportListParams = {},
): Promise<ListResponse<ReportListItem>> {
  const payload = await apiRequest<unknown>(
    `/reports${toQuery({
      q: params.q,
      category: params.category,
      business_status: params.businessStatus,
      from: params.from,
      to: params.to,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseReportItem(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchReport(reportId: number): Promise<ReportDetail> {
  return parseReportDetail(await apiRequest<unknown>(`/reports/${reportId}`));
}

export async function createReport(input: ReportInput): Promise<ReportDetail> {
  return parseReportDetail(
    await apiRequest<unknown>('/reports', {
      method: 'POST',
      csrf: true,
      body: {
        title: input.title,
        body_markdown: input.bodyMarkdown,
        category: input.category,
        report_kind: input.reportKind ?? 'general',
      },
    }),
  );
}

export async function updateReport(
  reportId: number,
  input: { version: number; title?: string; bodyMarkdown?: string },
): Promise<ReportDetail> {
  return parseReportDetail(
    await apiRequest<unknown>(`/reports/${reportId}`, {
      method: 'PATCH',
      csrf: true,
      body: {
        version: input.version,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.bodyMarkdown === undefined ? {} : { body_markdown: input.bodyMarkdown }),
      },
    }),
  );
}

export async function changeReportStatus(
  reportId: number,
  version: number,
  businessStatus: ReportStatus,
): Promise<ReportDetail> {
  return parseReportDetail(
    await apiRequest<unknown>(`/reports/${reportId}/status`, {
      method: 'PATCH',
      csrf: true,
      body: { version, business_status: businessStatus },
    }),
  );
}

export async function deleteReport(reportId: number, expectedVersion: number): Promise<void> {
  await apiRequest<void>(`/reports/${reportId}${toQuery({ expected_version: expectedVersion })}`, {
    method: 'DELETE',
    csrf: true,
  });
}

export async function fetchReportRevisions(reportId: number): Promise<ReportRevision[]> {
  const payload = await apiRequest<unknown>(`/reports/${reportId}/revisions`);
  return asArray(asRecord(payload, 'response').items, 'items').map((value, index) => {
    const item = asRecord(value, `items[${index}]`);
    return {
      version: asNumber(item.version, `items[${index}].version`),
      title: asString(item.title, `items[${index}].title`),
      body_markdown: asString(item.body_markdown, `items[${index}].body_markdown`),
      editor_id: asNumber(item.editor_id, `items[${index}].editor_id`),
      editor_display_name: asString(
        item.editor_display_name,
        `items[${index}].editor_display_name`,
      ),
      created_at: asString(item.created_at, `items[${index}].created_at`),
    };
  });
}

export async function fetchReportRevision(
  reportId: number,
  version: number,
): Promise<ReportRevision> {
  const item = asRecord(
    await apiRequest<unknown>(`/reports/${reportId}/revisions/${version}`),
    'revision',
  );
  return {
    version: asNumber(item.version, 'revision.version'),
    title: asString(item.title, 'revision.title'),
    body_markdown: asString(item.body_markdown, 'revision.body_markdown'),
    editor_id: asNumber(item.editor_id, 'revision.editor_id'),
    editor_display_name: asString(item.editor_display_name, 'revision.editor_display_name'),
    created_at: asString(item.created_at, 'revision.created_at'),
  };
}

export async function fetchReportStatusEvents(reportId: number): Promise<ReportStatusEvent[]> {
  const payload = await apiRequest<unknown>(`/reports/${reportId}/status-events`);
  return asArray(asRecord(payload, 'response').items, 'items').map((value, index) => {
    const item = asRecord(value, `items[${index}]`);
    return {
      event_id: asNumber(item.event_id, `items[${index}].event_id`),
      before_status: asEnum(item.before_status, `items[${index}].before_status`, REPORT_STATUSES),
      after_status: asEnum(item.after_status, `items[${index}].after_status`, REPORT_STATUSES),
      actor_id: asNumber(item.actor_id, `items[${index}].actor_id`),
      actor_display_name: asString(item.actor_display_name, `items[${index}].actor_display_name`),
      created_at: asString(item.created_at, `items[${index}].created_at`),
    };
  });
}
