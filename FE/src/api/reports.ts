import { apiRequest } from './client';
import {
  asArray,
  asEnum,
  asNumber,
  asRecord,
  asString,
  isRecord,
  parsePagination,
  toQuery,
} from './json';
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
  generation_snapshot: ReportSnapshot | null;
}

/** AI 보고서 생성 시 집계에 쓰인 값. 화면에서 확인 항목을 만들 때 참고한다. */
export interface ReportSnapshot {
  periodFrom: string | null;
  periodTo: string | null;
  productionRecordCount: number;
  inspectedCount: number;
  goodCount: number;
  defectCount: number;
  defectRatePercent: number | null;
  defectTypes: string[];
  includesDemo: boolean;
  targetCount: number;
  equipmentCount: number;
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

// 집계 스냅샷은 생성 이후 형식이 바뀔 수 있다. 필요한 값이 없으면 확인 항목 생성에서
// 제외하고 상세 조회 자체는 실패시키지 않는다.
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readIdCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function parseReportSnapshot(value: unknown): ReportSnapshot | null {
  if (!isRecord(value)) return null;
  const summary = isRecord(value.summary) ? value.summary : {};
  const period = isRecord(value.period) ? value.period : {};
  const targets = isRecord(value.requested_targets) ? value.requested_targets : {};
  return {
    periodFrom: readString(period.from),
    periodTo: readString(period.to),
    productionRecordCount: readNumber(summary.production_record_count) ?? 0,
    inspectedCount: readNumber(summary.inspected_count) ?? 0,
    goodCount: readNumber(summary.good_count) ?? 0,
    defectCount: readNumber(summary.defect_count) ?? 0,
    defectRatePercent: readNumber(summary.defect_rate_percent),
    defectTypes: Array.isArray(summary.defect_types)
      ? summary.defect_types.filter((item): item is string => typeof item === 'string')
      : [],
    includesDemo: summary.includes_demo === true,
    targetCount:
      readIdCount(targets.department_ids) +
      readIdCount(targets.production_line_ids) +
      readIdCount(targets.equipment_ids),
    equipmentCount: readIdCount(value.resolved_equipment),
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
    generation_snapshot: parseReportSnapshot(item.generation_snapshot),
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
