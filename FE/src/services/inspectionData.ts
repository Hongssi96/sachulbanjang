import { formatDateTime, shiftDateISO, todayISO } from '../utils/dateFormat';
export const qualityProducts = ['CN7 LH', 'CN7 RH', 'RG3 LH', 'RG3 RH'] as const;
export const qualityEquipment = ['S01', 'S02', 'S03', 'S04'] as const;
export const defectTypes = ['가스', '찍힘', '휘어짐', '미성형'] as const;
export type DefectType = (typeof defectTypes)[number];
export interface InspectionBatch {
  id: string;
  date: string;
  time: string;
  product: string;
  equipment: string;
  inspected: number;
  defects: Record<DefectType, number>;
  inspector: string;
}
export interface QualityFilters {
  from: string;
  to: string;
  product: string;
  equipment: string;
}
// 시연 데이터도 실제 오늘을 기준으로 최근 2주를 만든다.
const DATA_END = todayISO();
const DATA_START = shiftDateISO(DATA_END, -13);
export const defaultQualityFilters: QualityFilters = {
  from: shiftDateISO(DATA_END, -6),
  to: DATA_END,
  product: '',
  equipment: '',
};
export const inspectionThreshold = 3;
const currentDefects = [
  [1, 0, 1, 0, 1, 0, 1],
  [1, 1, 0, 1, 0, 1, 1],
  [1, 0, 1, 2, 1, 1, 0],
  [2, 3, 5, 9, 10, 8, 8],
];
const gasBreakdown = [
  [1, 1, 0, 0],
  [2, 1, 0, 0],
  [2, 2, 1, 0],
  [5, 2, 1, 1],
  [5, 2, 2, 1],
  [4, 2, 1, 1],
  [4, 1, 2, 1],
];
export const inspectionBatches: InspectionBatch[] = [0, 1]
  .flatMap((week) =>
    Array.from({ length: 7 }, (_, day) =>
      qualityProducts.map((product, index) => {
        const date = shiftDateISO(DATA_START, week * 7 + day);
        const inspected = index < 2 ? 100 : index === 2 ? 60 : day < 4 ? 90 : 100;
        const count =
          week === 0 && index === 3 ? [5, 6, 8, 12, 14, 12, 13][day] : currentDefects[index][day];
        let defects: Record<DefectType, number>;
        if (index === 0) defects = { 가스: 0, 찍힘: count, 휘어짐: 0, 미성형: 0 };
        else if (index === 1) defects = { 가스: 0, 찍힘: 0, 휘어짐: count, 미성형: 0 };
        else if (index === 2) defects = { 가스: 0, 찍힘: 0, 휘어짐: 0, 미성형: count };
        else {
          const split =
            week === 1
              ? gasBreakdown[day]
              : [
                  Math.floor(count * 0.5),
                  Math.floor(count * 0.25),
                  Math.floor(count * 0.15),
                  count -
                    Math.floor(count * 0.5) -
                    Math.floor(count * 0.25) -
                    Math.floor(count * 0.15),
                ];
          defects = { 가스: split[0], 찍힘: split[1], 휘어짐: split[2], 미성형: split[3] };
        }
        return {
          id: `QI-${date.replaceAll('-', '')}-${String(index + 1).padStart(2, '0')}`,
          date,
          time: ['09:30', '11:20', '14:10', '16:20'][index],
          product,
          equipment: qualityEquipment[index],
          inspected,
          defects,
          inspector: ['홍태휘', '김가을', '황지혜'][(day + index) % 3],
        };
      }),
    ),
  )
  .flat();
export const inspectionDataRange = {
  from: inspectionBatches[0].date,
  to: inspectionBatches[inspectionBatches.length - 1].date,
};
export const defectCount = (record: InspectionBatch) =>
  defectTypes.reduce((sum, type) => sum + record.defects[type], 0);
export const percentage = (part: number, total: number) =>
  total > 0 ? (part / total) * 100 : null;
export const formatRate = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);
export function summarizeQuality(records: InspectionBatch[]) {
  const inspected = records.reduce((sum, record) => sum + record.inspected, 0);
  const defective = records.reduce((sum, record) => sum + defectCount(record), 0);
  return {
    inspected,
    defective,
    passed: inspected - defective,
    batches: records.length,
    rate: percentage(defective, inspected),
  };
}
export function filterInspections(filters: QualityFilters) {
  return inspectionBatches.filter(
    (record) =>
      record.date >= filters.from &&
      record.date <= filters.to &&
      (!filters.product || record.product === filters.product) &&
      (!filters.equipment || record.equipment === filters.equipment),
  );
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
export function previousQualityPeriod(filters: QualityFilters): QualityFilters | null {
  if (qualityRangeError(filters)) return null;
  const start = Date.parse(`${filters.from}T00:00:00Z`);
  const end = Date.parse(`${filters.to}T00:00:00Z`);
  const duration = end - start + 86400000;
  return {
    ...filters,
    from: new Date(start - duration).toISOString().slice(0, 10),
    to: new Date(start - 86400000).toISOString().slice(0, 10),
  };
}
export function qualityByProduct(records: InspectionBatch[]) {
  return qualityProducts
    .map((product) => ({
      product,
      ...summarizeQuality(records.filter((record) => record.product === product)),
    }))
    .filter((row) => row.inspected > 0);
}
export function qualityTrend(records: InspectionBatch[]) {
  return [...new Set(records.map((record) => record.date))].sort().map((date) => ({
    date,
    ...summarizeQuality(records.filter((record) => record.date === date)),
  }));
}
export function defectDistribution(records: InspectionBatch[]) {
  return defectTypes
    .map((type) => ({
      type,
      count: records.reduce((sum, record) => sum + record.defects[type], 0),
    }))
    .sort((a, b) => b.count - a.count);
}
export function qualityVerdict(record: InspectionBatch) {
  if (defectCount(record) === 0) return '양품';
  return (percentage(defectCount(record), record.inspected) ?? 0) > inspectionThreshold
    ? '기준 초과'
    : '불량 포함';
}
export const qualityDateLabel = (date: string) => date.replaceAll('-', '.');
export function qualityReportLabel(filters: QualityFilters) {
  if (filters.from === filters.to) return '일간';
  if (filters.from.endsWith('-01') && filters.from.slice(0, 7) === filters.to.slice(0, 7))
    return '월간';
  const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1;
  return days === 7 ? '주간' : '기간';
}
export function qualityReportText(filters: QualityFilters, records: InspectionBatch[]) {
  const summary = summarizeQuality(records);
  const products = qualityByProduct(records);
  const focus = products.filter((product) => (product.rate ?? 0) > inspectionThreshold);
  return `${qualityReportLabel(filters)} 품질 리포트 · 사출반장\n\n조회 기간: ${filters.from} ~ ${filters.to}\n제품: ${filters.product || '전체 제품'} / 설비: ${filters.equipment || '전체 설비'}\n\n검사 수량: ${summary.inspected.toLocaleString()}개\n양품 수량: ${summary.passed.toLocaleString()}개\n불량 수량: ${summary.defective.toLocaleString()}개\n검사 불량률: ${formatRate(summary.rate)}\n검사 배치: ${summary.batches}건\n\n제품별 현황\n${products.map((product) => `${product.product}: 검사 ${product.inspected.toLocaleString()}개 / 불량 ${product.defective}개 / ${formatRate(product.rate)}`).join('\n')}\n\n확인할 품목\n${focus.length ? focus.map((product) => `${product.product}: 검사 불량률 ${formatRate(product.rate)}로 점검 기준 ${inspectionThreshold}%를 초과합니다. 해당 기간의 검사 기록과 공정 조건·현장 조치 이력을 함께 확인해 주세요.`).join('\n') : '선택 범위에 점검 기준을 초과한 품목이 없습니다.'}\n\n데이터 기준\n모든 수치는 검사 배치 데이터 기준입니다. 전체 생산 불량률이나 불량 원인을 확정하는 자료가 아닙니다. 검사 불량률 = 불량 수량 ÷ 검사 수량 × 100.\n`;
}

// Production values and event times below are linked demonstration fixtures, not live factory data.
export interface ProductionInspectionRecord extends InspectionBatch {
  lotId: string;
  produced: number;
  productionTarget: number;
  startedAt: string;
  finishedAt: string;
  inspectedAt: string;
  archivedAt: string;
}
export const productionInspectionRecords: ProductionInspectionRecord[] = inspectionBatches.map(
  (batch, index) => {
    const inspectedAt = `${batch.date}T${batch.time}:00+09:00`;
    const time = Date.parse(inspectedAt);
    const produced = batch.inspected * 5;
    return {
      ...batch,
      lotId: `LOT-${batch.date.replaceAll('-', '')}-${batch.equipment}`,
      produced,
      productionTarget: produced + ((index % 3) - 1) * 40,
      startedAt: new Date(time - 90 * 60000).toISOString(),
      finishedAt: new Date(time - 30 * 60000).toISOString(),
      inspectedAt,
      archivedAt: new Date(time + 5 * 60000).toISOString(),
    };
  },
);
export const inspectionStaff = [...new Set(inspectionBatches.map((record) => record.inspector))];
export interface RecordFilters extends QualityFilters {
  query: string;
  inspector: string;
  result: string;
  order: string;
}
export function filterProductionRecords(filters: RecordFilters) {
  if (qualityRangeError(filters)) return [];
  return productionInspectionRecords
    .filter(
      (record) =>
        record.date >= filters.from &&
        record.date <= filters.to &&
        (!filters.product || record.product === filters.product) &&
        (!filters.equipment || record.equipment === filters.equipment) &&
        (!filters.inspector || record.inspector === filters.inspector) &&
        `${record.product} ${record.id} ${record.lotId}`
          .toLowerCase()
          .includes(filters.query.trim().toLowerCase()) &&
        (filters.result === 'pass'
          ? defectCount(record) === 0
          : filters.result === 'defect'
            ? defectCount(record) > 0
            : filters.result === 'above'
              ? (percentage(defectCount(record), record.inspected) ?? 0) > inspectionThreshold
              : true),
    )
    .sort((a, b) =>
      filters.order === 'oldest'
        ? a.inspectedAt.localeCompare(b.inspectedAt)
        : b.inspectedAt.localeCompare(a.inspectedAt),
    );
}
export function productionRecordSummary(records: ProductionInspectionRecord[]) {
  const quality = summarizeQuality(records);
  const produced = records.reduce((sum, record) => sum + record.produced, 0);
  const target = records.reduce((sum, record) => sum + record.productionTarget, 0);
  return { ...quality, produced, target, coverage: percentage(quality.inspected, produced) };
}
export const formatRecordTimestamp = formatDateTime;
export function recordsCsv(records: ProductionInspectionRecord[]) {
  const rows = [
    [
      '생산 배치',
      '검사 배치',
      '제품',
      '설비',
      '생산 시작',
      '생산 종료',
      '검사 완료',
      '목표 수량',
      '생산 수량',
      '검사 수량',
      '불량 수량',
      '검사 불량률',
      '검사 결과',
      '검사 담당자',
    ],
    ...records.map((record) => [
      record.lotId,
      record.id,
      record.product,
      record.equipment,
      formatRecordTimestamp(record.startedAt),
      formatRecordTimestamp(record.finishedAt),
      formatRecordTimestamp(record.inspectedAt),
      String(record.productionTarget),
      String(record.produced),
      String(record.inspected),
      String(defectCount(record)),
      formatRate(percentage(defectCount(record), record.inspected)),
      qualityVerdict(record),
      record.inspector,
    ]),
  ];
  return (
    '\uFEFF' +
    rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n')
  );
}
