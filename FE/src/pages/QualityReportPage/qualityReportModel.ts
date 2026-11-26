import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import type { QualitySummary } from '../../api/quality';
import type { InspectionRecord } from '../../api/records';
import { formatDateTime, shiftDateISO, todayISO } from '../../utils/dateFormat';

export const NA = '—';
export const inspectionThreshold = 3;

export interface QualityFilters {
  from: string;
  to: string;
  product: string;
  equipment: string;
}

export interface TrendPoint {
  date: string;
  rate: number;
  inspected: number;
  defective: number;
}

export interface ProductQualitySummary {
  key: string;
  productId: number | null;
  label: string;
  inspected: number;
  defective: number;
  rate: number | null;
}

export function defaultQualityFilters(): QualityFilters {
  const today = todayISO();
  return { from: shiftDateISO(today, -6), to: today, product: '', equipment: '' };
}

export function validQualityDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function qualityRangeError(filters: QualityFilters) {
  if (!validQualityDate(filters.from) || !validQualityDate(filters.to))
    return '조회 시작일과 종료일을 올바르게 선택해 주세요.';
  if (filters.from > filters.to) return '종료일은 시작일보다 같거나 늦어야 합니다.';
  return '';
}

export function previousQualityPeriod(
  filters: QualityFilters,
): { from: string; to: string } | null {
  if (qualityRangeError(filters)) return null;
  const day = 86400000;
  const start = Date.parse(`${filters.from}T00:00:00Z`);
  const end = Date.parse(`${filters.to}T00:00:00Z`);
  const duration = end - start + day;
  return {
    from: new Date(start - duration).toISOString().slice(0, 10),
    to: new Date(start - day).toISOString().slice(0, 10),
  };
}

export const qualityDateLabel = (date: string) => date.replaceAll('-', '.');

export const formatRate = (value: number | null) =>
  value === null ? NA : `${formatDecimal(value)}%`;

export const percentage = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : null;

export const positiveInt = (value: string) => {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
};

export const qualityVerdict = (record: InspectionRecord) =>
  record.verdict === 'good' ? '양품' : '불량';

export function seoulDateTime(value: string): { date: string; time: string } {
  const formatted = formatDateTime(value);
  if (formatted === NA) return { date: NA, time: NA };
  const [date, time] = formatted.split(' ');
  return { date: date ?? NA, time: time ?? NA };
}

export function seoulDateISO(value: string) {
  const { date } = seoulDateTime(value);
  return date === NA ? '' : date.replaceAll('.', '-');
}

export function recordProductLabel(record: InspectionRecord) {
  return record.product_name ?? record.product_code ?? '제품 미지정';
}

export function recordEquipmentLabel(record: InspectionRecord) {
  if (!record.equipment_name) return record.equipment_code;
  return `${record.equipment_code} · ${record.equipment_name}`;
}

export function recordSearchText(record: InspectionRecord) {
  return [
    record.record_id,
    record.product_name,
    record.product_code,
    record.equipment_name,
    record.equipment_code,
  ]
    .filter((value): value is string | number => value !== null)
    .join(' ')
    .toLowerCase();
}

export function summarizeRecords(records: InspectionRecord[]) {
  const inspected = records.length;
  const defective = records.filter((record) => record.verdict === 'defect').length;
  return { inspected, defective, rate: percentage(defective, inspected) };
}

export function groupRecordsByDay(records: InspectionRecord[]): TrendPoint[] {
  const groups = new Map<string, { inspected: number; defective: number }>();
  for (const record of records) {
    const date = seoulDateISO(record.inspected_at);
    if (!date) continue;
    const group = groups.get(date) ?? { inspected: 0, defective: 0 };
    group.inspected += 1;
    if (record.verdict === 'defect') group.defective += 1;
    groups.set(date, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, group]) => ({
      date,
      inspected: group.inspected,
      defective: group.defective,
      rate: percentage(group.defective, group.inspected) ?? 0,
    }));
}

export function summarizeByProduct(records: InspectionRecord[]): ProductQualitySummary[] {
  const groups = new Map<
    string,
    { productId: number | null; label: string; inspected: number; defective: number }
  >();
  for (const record of records) {
    const label = recordProductLabel(record);
    const key = record.product_id === null ? `name:${label}` : `id:${record.product_id}`;
    const group = groups.get(key) ?? {
      productId: record.product_id,
      label,
      inspected: 0,
      defective: 0,
    };
    group.inspected += 1;
    if (record.verdict === 'defect') group.defective += 1;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      ...group,
      rate: percentage(group.defective, group.inspected),
    }))
    .sort(
      (left, right) => right.defective - left.defective || left.label.localeCompare(right.label),
    );
}

export function focusProducts(products: ProductQualitySummary[]) {
  return products
    .filter((product) => (product.rate ?? 0) > inspectionThreshold)
    .sort((left, right) => (right.rate ?? 0) - (left.rate ?? 0));
}

export function qualityReportLabel(filters: QualityFilters) {
  if (filters.from === filters.to) return '일간';
  if (filters.from.endsWith('-01') && filters.from.slice(0, 7) === filters.to.slice(0, 7))
    return '월간';
  const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1;
  return days === 7 ? '주간' : '기간';
}

interface ReportTextInput {
  filters: QualityFilters;
  summary: QualitySummary | null;
  products: ProductQualitySummary[];
  focus: ProductQualitySummary[];
  productLabel: string;
  equipmentLabel: string;
}

export function buildQualityReportText({
  filters,
  summary,
  products,
  focus,
  productLabel,
  equipmentLabel,
}: ReportTextInput) {
  const defectTypes = summary?.defect_types.length
    ? summary.defect_types.map((item) => `${item.type ?? '미분류'} ${item.count}건`).join(', ')
    : '기록 없음';
  return `${qualityReportLabel(filters)} 품질 리포트 · 사출반장

조회 기간: ${filters.from} ~ ${filters.to}
제품: ${productLabel} / 설비: ${equipmentLabel}

검사 건수: ${summary ? `${formatNumber(summary.inspected_count)}건` : NA}
양품: ${summary ? `${formatNumber(summary.good_count)}건` : NA}
불량: ${summary ? `${formatNumber(summary.defect_count)}건` : NA}
검사 불량률: ${summary ? formatRate(summary.defect_rate) : NA}
생산 기록: ${summary ? `${formatNumber(summary.production_record_count)}건` : NA}

불량 유형
${defectTypes}

제품별 현황 (최근 100건 기준)
${products.length ? products.map((product) => `${product.label}: 검사 ${formatNumber(product.inspected)}건 / 불량 ${product.defective}건 / ${formatRate(product.rate)}`).join('\n') : '기록 없음'}

확인할 품목
${focus.length ? focus.map((product) => `${product.label}: 검사 불량률 ${formatRate(product.rate)}로 점검 기준 ${inspectionThreshold}%를 초과합니다. 해당 기간의 검사 기록과 공정 조건·현장 조치 이력을 함께 확인해 주세요.`).join('\n') : products.length ? '선택 범위에 점검 기준을 초과한 품목이 없습니다.' : '기록 없음'}

데이터 기준
모든 수치는 검사 기록 API 조회 결과 기준입니다. 검사 수량·불량 수량·담당자처럼 API가 제공하지 않는 값은 —로 표시합니다. 제품별 현황은 최근 100건 조회 기준입니다. 검사 불량률 = 불량 건수 ÷ 검사 건수 × 100.
`;
}
