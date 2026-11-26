import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import FilterSelect from '../../components/FilterSelect';
import LoadingState from '../../components/LoadingState';
import QueryFilterCard from '../../components/QueryFilterCard';
import SegmentedControl from '../../components/SegmentedControl';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import DatePicker from '../../components/DatePicker';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileChartColumn,
  FilterX,
  LoaderCircle,
  PackageSearch,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import ApiErrorState from '../../components/ApiErrorState';
import MissingValue from '../../components/MissingValue';
import Modal from '../../components/Modal';
import QualityTrendChart from './QualityTrendChart';
import DefectBreakdown from './DefectBreakdown';
import { InspectionDetailDialog } from './InspectionDetail';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fetchEquipment, fetchProducts } from '../../api/masterData';
import { fetchQualitySummary } from '../../api/quality';
import { fetchInspectionRecords } from '../../api/records';
import { shiftDateISO, todayISO } from '../../utils/dateFormat';
import {
  NA,
  buildQualityReportText,
  defaultQualityFilters,
  focusProducts,
  formatRate,
  groupRecordsByDay,
  inspectionThreshold,
  positiveInt,
  previousQualityPeriod,
  qualityDateLabel,
  qualityRangeError,
  qualityReportLabel,
  qualityVerdict,
  recordEquipmentLabel,
  recordProductLabel,
  recordSearchText,
  seoulDateTime,
  summarizeByProduct,
} from './qualityReportModel';
import type { QualityFilters } from './qualityReportModel';
import './QualityReportPage.css';

const PAGE_SIZE = 10;
const SAMPLE_SIZE = 100;
const PERIOD_OPTIONS = [
  { value: 'day', label: '일간' },
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
] as const;
type PeriodKey = (typeof PERIOD_OPTIONS)[number]['value'];

type QualityDialog =
  { kind: 'inspection'; recordId: number } | { kind: 'preview' } | { kind: 'basis' } | null;
function saveFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export default function QualityReportPage() {
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = useCallback(
    (...args: Parameters<typeof rawSetParams>) => startTransition(() => rawSetParams(...args)),
    [rawSetParams, startTransition],
  );
  const [dialog, setDialog] = useState<QualityDialog>(null);
  const [feedback, setFeedback] = useState('');
  const defaults = defaultQualityFilters();
  const filters: QualityFilters = {
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    product: params.get('product') ?? '',
    equipment: params.get('equipment') ?? '',
  };
  const productId = positiveInt(filters.product);
  const equipmentId = positiveInt(filters.equipment);
  const rangeError = qualityRangeError(filters);
  const today = todayISO();
  const periods: Record<PeriodKey, { from: string; to: string }> = {
    day: { from: today, to: today },
    week: { from: shiftDateISO(today, -6), to: today },
    month: { from: `${today.slice(0, 7)}-01`, to: today },
  };
  const periodKey: PeriodKey | 'custom' =
    filters.from === periods.day.from && filters.to === periods.day.to
      ? 'day'
      : filters.from === periods.week.from && filters.to === periods.week.to
        ? 'week'
        : filters.from === periods.month.from && filters.to === periods.month.to
          ? 'month'
          : 'custom';

  const productsQuery = useApiQuery('quality:products', () => fetchProducts());
  const equipmentQuery = useApiQuery('quality:equipment', () => fetchEquipment());
  const masterError = productsQuery.error ?? equipmentQuery.error;

  const summaryQuery = useApiQuery(
    `quality:summary:${filters.from}:${filters.to}:${productId ?? ''}:${equipmentId ?? ''}`,
    () =>
      fetchQualitySummary({
        from: filters.from,
        to: filters.to,
        productId,
        equipmentId,
      }),
    { enabled: !rangeError },
  );
  const previousRange = previousQualityPeriod(filters);
  const previousQuery = useApiQuery(
    `quality:summary:previous:${previousRange?.from ?? ''}:${previousRange?.to ?? ''}:${
      productId ?? ''
    }:${equipmentId ?? ''}`,
    () =>
      fetchQualitySummary({
        from: previousRange?.from,
        to: previousRange?.to,
        productId,
        equipmentId,
      }),
    { enabled: !rangeError && previousRange !== null },
  );
  const sampleQuery = useApiQuery(
    `quality:sample:${filters.from}:${filters.to}:${productId ?? ''}:${equipmentId ?? ''}`,
    () =>
      fetchInspectionRecords({
        from: filters.from,
        to: filters.to,
        productId,
        equipmentId,
        page: 1,
        pageSize: SAMPLE_SIZE,
      }),
    { enabled: !rangeError },
  );

  const summary = rangeError ? null : summaryQuery.data;
  const previousSummary = rangeError ? null : previousQuery.data;
  const difference =
    summary?.defect_rate !== null &&
    summary?.defect_rate !== undefined &&
    previousSummary?.defect_rate !== null &&
    previousSummary?.defect_rate !== undefined
      ? summary.defect_rate - previousSummary.defect_rate
      : null;

  const sampleItems = rangeError ? [] : (sampleQuery.data?.items ?? []);
  const productSummaries = summarizeByProduct(sampleItems);
  const focusItems = focusProducts(productSummaries);
  const focus = focusItems[0];
  const trend = groupRecordsByDay(sampleItems);
  const distribution = (summary?.defect_types ?? []).map((item) => ({
    type: item.type ?? '미분류',
    count: item.count,
  }));

  const query = params.get('q') ?? '';
  const verdict = params.get('result') ?? '';
  const verdictFilter = verdict === 'pass' ? 'good' : verdict === 'defect' ? 'defect' : undefined;
  const requestedPage = positiveInt(params.get('page') ?? '') ?? 1;
  const recordsQuery = useApiQuery(
    `quality:records:${filters.from}:${filters.to}:${productId ?? ''}:${equipmentId ?? ''}:${
      verdictFilter ?? ''
    }:${requestedPage}`,
    () =>
      fetchInspectionRecords({
        from: filters.from,
        to: filters.to,
        productId,
        equipmentId,
        verdict: verdictFilter,
        page: requestedPage,
        pageSize: PAGE_SIZE,
      }),
    { enabled: !rangeError },
  );
  usePageEntryReady(
    [productsQuery, equipmentQuery, summaryQuery, previousQuery, sampleQuery, recordsQuery].every(
      (query) => !query.loading,
    ),
  );
  const totalItems = rangeError ? 0 : (recordsQuery.data?.pagination.total_items ?? 0);
  const totalPages = rangeError ? 0 : (recordsQuery.data?.pagination.total_pages ?? 0);
  const pageCount = Math.max(1, totalPages);
  const page = Math.min(requestedPage, pageCount);
  useEffect(() => {
    if (totalPages > 0 && requestedPage > totalPages) {
      setParams((previousParams) => {
        const next = new URLSearchParams(previousParams);
        next.set('page', String(totalPages));
        return next;
      });
    }
  }, [requestedPage, totalPages, setParams]);

  const searchTerm = query.trim().toLowerCase();
  const pageRows = rangeError ? [] : (recordsQuery.data?.items ?? []);
  const rows = searchTerm
    ? pageRows.filter((record) => recordSearchText(record).includes(searchTerm))
    : pageRows;
  const historyCount =
    rangeError || (recordsQuery.loading && !recordsQuery.data) ? NA : totalItems.toLocaleString();
  const listNotes: string[] = [];
  if (searchTerm) listNotes.push('검색은 현재 페이지 안에서만 적용됩니다.');
  if (verdict === 'above') listNotes.push('‘기준 초과’는 검사 수량 정보가 없어 적용되지 않습니다.');

  const selectedProduct = productsQuery.data?.find(
    (item) => productId !== undefined && item.product_id === productId,
  );
  const selectedEquipment = equipmentQuery.data?.find(
    (item) => equipmentId !== undefined && item.equipment_id === equipmentId,
  );
  const productLabel = productId === undefined ? '전체 제품' : (selectedProduct?.name ?? NA);
  const equipmentLabel =
    equipmentId === undefined
      ? '전체 설비'
      : selectedEquipment
        ? `${selectedEquipment.equipment_code} · ${selectedEquipment.name}`
        : NA;
  const filterCaption = rangeError
    ? '조회 가능 기간 확인 필요'
    : sampleQuery.loading && !sampleQuery.data
      ? '조회 가능 기간 확인 중'
      : trend.length
        ? `조회 가능 기간 ${qualityDateLabel(trend[0].date)}–${qualityDateLabel(
            trend[trend.length - 1].date,
          )} · 최근 ${SAMPLE_SIZE}건 기준`
        : '조회 가능 기간 기록 없음';

  const setFilter = (key: string, value: string) => {
    setParams(
      (previousParams) => {
        const next = new URLSearchParams(previousParams);
        if (value !== '' || key === 'from' || key === 'to') next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: key !== 'page' },
    );
  };
  const {
    input: queryInput,
    setInput: setQueryInput,
    searchNow: clearQuery,
    compositionHandlers,
  } = useDebouncedSearch({
    value: query,
    onSearch: (value) => setFilter('q', value),
  });
  const setPeriod = (from: string, to: string) => {
    setParams(
      (previousParams) => {
        const next = new URLSearchParams(previousParams);
        next.set('from', from);
        next.set('to', to);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  const downloadCsv = () => {
    const content = [
      [
        '검사 배치',
        '검사일',
        '검사시각',
        '제품',
        '설비',
        '검사 수량',
        '불량 수량',
        '검사 불량률',
        '결과',
        '담당자',
      ],
      ...rows.map((record) => {
        const { date, time } = seoulDateTime(record.inspected_at);
        return [
          String(record.record_id),
          date,
          time,
          recordProductLabel(record),
          recordEquipmentLabel(record),
          NA,
          NA,
          NA,
          qualityVerdict(record),
          NA,
        ];
      }),
    ]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\r\n');
    saveFile(
      `사출반장_검사이력_${filters.from}_${filters.to}.csv`,
      '\uFEFF' + content,
      'text/csv;charset=utf-8',
    );
    setFeedback(`표의 조회 결과 ${rows.length}건을 CSV로 내려받았어요.`);
  };
  const metric = (value: number | null | undefined) =>
    rangeError || value === null || value === undefined ? NA : value.toLocaleString();
  const focusValue =
    rangeError || sampleQuery.error || (sampleQuery.loading && !sampleQuery.data)
      ? NA
      : focusItems.length.toLocaleString();
  const focusPill =
    rangeError || sampleQuery.error
      ? '조회 실패'
      : sampleQuery.loading && !sampleQuery.data
        ? '조회 중'
        : !sampleItems.length
          ? '기록 없음'
          : focusItems.length
            ? '확인 필요'
            : '기준 이하';
  const observationTitle = rangeError
    ? '조회 조건을 확인해 주세요.'
    : sampleQuery.loading && !sampleQuery.data
      ? '검사 기록을 조회하는 중이에요.'
      : focus
        ? `${focus.label} 검사 이력을 먼저 확인해 보세요.`
        : sampleItems.length
          ? '선택 범위에 기준을 초과한 품목이 없어요.'
          : '조회 조건에 맞는 검사 기록이 없어요.';
  const observationBody = rangeError
    ? '조회 기간을 확인한 뒤 다시 시도해 주세요.'
    : sampleQuery.loading && !sampleQuery.data
      ? '선택한 조건의 검사 기록을 불러오고 있어요.'
      : focus
        ? `검사 ${focus.inspected.toLocaleString()}건 중 불량 ${focus.defective}건(${formatRate(
            focus.rate,
          )})가 기록됐어요. 해당 기간의 공정 조건과 조치 이력을 함께 살펴보세요. 최근 ${SAMPLE_SIZE}건 기준입니다.`
        : sampleItems.length
          ? '검사 결과는 선택한 기간과 조건에 한정됩니다. 이후 검사 결과도 함께 확인해 주세요.'
          : '다른 조회 기간이나 제품·설비를 선택해 확인해 주세요.';

  return (
    <div className="quality-report-page" aria-busy={isPending}>
      <h1 className="sr-only">품질 리포트</h1>

      {feedback && (
        <div className="qr-feedback" role="status">
          <Check size={18} />
          <span>{feedback}</span>
          <button
            className="icon-button"
            aria-label="품질 알림 닫기"
            onClick={() => setFeedback('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <QueryFilterCard
        presets={
          <SegmentedControl
            label="품질 조회 기간"
            value={periodKey}
            options={PERIOD_OPTIONS}
            onChange={(value) => {
              if (value !== 'custom') {
                const range = periods[value];
                setPeriod(range.from, range.to);
              }
            }}
          />
        }
        onReset={() => setParams({})}
        error={rangeError}
        caption={filterCaption}
      >
        <fieldset>
          <legend>조회 기간</legend>
          <div className="query-date-range">
            <DatePicker
              aria-label="품질 조회 시작일"
              value={filters.from}
              onChange={(event) => setFilter('from', event.target.value)}
            />
            <span aria-hidden="true">—</span>
            <DatePicker
              aria-label="품질 조회 종료일"
              value={filters.to}
              onChange={(event) => setFilter('to', event.target.value)}
            />
          </div>
        </fieldset>
        <div className="query-field">
          <span>제품</span>
          <FilterSelect
            label="품질 제품 필터"
            value={productId === undefined ? '' : String(productId)}
            onChange={(value) => setFilter('product', value)}
            options={[
              { value: '', label: '전체 제품' },
              ...(productsQuery.data ?? []).map((product) => ({
                value: String(product.product_id),
                label: product.name,
              })),
            ]}
          />
        </div>
        <div className="query-field">
          <span>설비</span>
          <FilterSelect
            label="품질 설비 필터"
            value={equipmentId === undefined ? '' : String(equipmentId)}
            onChange={(value) => setFilter('equipment', value)}
            options={[
              { value: '', label: '전체 설비' },
              ...(equipmentQuery.data ?? []).map((equipment) => ({
                value: String(equipment.equipment_id),
                label: `${equipment.equipment_code} · ${equipment.name}`,
              })),
            ]}
          />
        </div>
      </QueryFilterCard>
      {masterError && (
        <ApiErrorState
          compact
          error={masterError}
          onRetry={() => {
            productsQuery.reload();
            equipmentQuery.reload();
          }}
        />
      )}
      <section aria-labelledby="quality-summary-heading">
        <div className="section-top">
          <h2 id="quality-summary-heading">선택 기간 품질 요약</h2>
          <div className="qr-summary-actions">
            <span className="muted">
              {rangeError
                ? '조회 기간 확인 필요'
                : `${qualityDateLabel(filters.from)}–${qualityDateLabel(filters.to)}`}
            </span>
            <div className="qr-intro-actions">
              <button
                className="button button-white button-sm"
                onClick={downloadCsv}
                disabled={!rows.length || !!rangeError}
              >
                <Download size={18} />
                CSV 다운로드
              </button>
              <button
                className="button button-primary button-sm"
                onClick={() => setDialog({ kind: 'preview' })}
                disabled={!sampleItems.length || !!rangeError}
              >
                <FileChartColumn size={18} />
                리포트 미리보기
              </button>
            </div>
          </div>
        </div>
        {summaryQuery.error && (
          <ApiErrorState compact error={summaryQuery.error} onRetry={summaryQuery.reload} />
        )}
        <div className="kpi-grid">
          <article className="kpi">
            <div className="kpi-label">
              검사 수량
              <ClipboardCheck size={19} />
            </div>
            <div className="kpi-value">
              {summary?.inspected_count === null || summary?.inspected_count === undefined ? (
                <MissingValue size="lg" />
              ) : (
                metric(summary.inspected_count)
              )}
              <span className="unit-lift">건</span>
            </div>
            <div className="kpi-bottom">
              <span>생산 기록 {metric(summary?.production_record_count)}건</span>
              <span className="positive">선택 조건 기준</span>
            </div>
            <div className="mini-progress">
              <span style={{ width: summary?.inspected_count ? '100%' : '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              검사 불량률
              <ShieldCheck size={19} />
            </div>
            <div className="kpi-value">
              {summary?.defect_rate === null || summary?.defect_rate === undefined ? (
                <MissingValue size="lg" />
              ) : (
                summary.defect_rate.toFixed(2)
              )}
              <span>%</span>
            </div>
            <div className="kpi-bottom">
              {difference === null ? (
                <span>
                  {rangeError
                    ? '조회 조건 확인 필요'
                    : summaryQuery.loading || previousQuery.loading
                      ? '비교 중'
                      : previousQuery.error
                        ? `${NA} 직전 기간 조회 실패`
                        : summary?.defect_rate === null || summary?.defect_rate === undefined
                          ? `${NA} 검사 기록 없음`
                          : `${NA} 직전 기간 기록 없음`}
                </span>
              ) : (
                <span className={difference <= 0 ? 'positive' : 'qr-negative'}>
                  {difference < 0 ? (
                    <ArrowDownRight size={14} />
                  ) : difference > 0 ? (
                    <ArrowUpRight size={14} />
                  ) : null}
                  {difference === 0
                    ? '직전 기간과 동일'
                    : `직전 기간 대비 ${Math.abs(difference).toFixed(2)}%p`}
                </span>
              )}
            </div>
            <div className="kpi-caption">불량 건수 ÷ 검사 건수</div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              불량 수량
              <TriangleAlert size={19} />
            </div>
            <div className="kpi-value qr-defective-value">
              {summary?.defect_count === null || summary?.defect_count === undefined ? (
                <MissingValue size="lg" />
              ) : (
                metric(summary.defect_count)
              )}
              <span className="unit-lift">건</span>
            </div>
            <div className="kpi-bottom">
              <span>양품 {metric(summary?.good_count)}건</span>
              <span>검사 결과 기준</span>
            </div>
            <div className="mini-progress qr-defect-progress">
              <span style={{ width: `${summary?.defect_rate ?? 0}%` }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              중점 확인 품목
              <Search size={19} />
            </div>
            <div className="kpi-value">
              {focusValue}
              <span>개 품목</span>
              <span className={`pill ${focusItems.length ? 'pill-amber' : 'pill-neutral'}`}>
                {focusPill}
              </span>
            </div>
            <div className="kpi-bottom">
              <span>제품별 검사 불량률 {inspectionThreshold}% 초과</span>
            </div>
            <div className="kpi-caption">불량 원인 확정 아님 · 최근 {SAMPLE_SIZE}건 기준</div>
          </article>
        </div>
      </section>
      <div className="qr-analysis-grid">
        <section className="card qr-trend-card">
          <div className="card-heading">
            <div>
              <h2>품질 추이</h2>
              <p>날짜별 검사 불량률의 변화를 확인하세요.</p>
            </div>
            <div className="qr-chart-legend">
              <span>
                <i />
                검사 불량률
              </span>
              <span>
                <i />
                점검 기준 {inspectionThreshold}%
              </span>
            </div>
          </div>
          {sampleQuery.error ? (
            <ApiErrorState compact error={sampleQuery.error} onRetry={sampleQuery.reload} />
          ) : sampleQuery.loading && !sampleQuery.data ? (
            <div className="qr-card-loading">
              <LoadingState compact label="품질 추이를 조회하는 중이에요" />
            </div>
          ) : trend.length ? (
            <>
              <div className="qr-chart-summary">
                <strong>{formatRate(summary?.defect_rate ?? null)}</strong>
                <span>기간 전체 검사 불량률</span>
              </div>
              <QualityTrendChart points={trend} />
              <div className="qr-chart-footnote">
                <span>검사 기록이 있는 날짜만 표시</span>
                <span>기간 비율은 검사 건수를 합산해 계산합니다.</span>
                <span>최대 {SAMPLE_SIZE}건 집계</span>
              </div>
            </>
          ) : (
            <div className="qr-empty">
              <PackageSearch size={36} />
              <strong>표시할 검사 기록이 없어요</strong>
              <p>조회 기간이나 제품·설비 조건을 확인해 주세요.</p>
            </div>
          )}
        </section>
        <section className="card qr-distribution-card">
          <div className="card-heading">
            <div>
              <h2>불량 유형 분포</h2>
              <p>
                {summary?.inspected_count
                  ? `불량 ${summary.defect_count.toLocaleString()}건 기준`
                  : '선택 기간 검사 기록 기준'}
              </p>
            </div>
            <span className="pill pill-neutral">
              {distribution.filter((item) => item.count > 0).length}유형
            </span>
          </div>
          {summaryQuery.error ? (
            <ApiErrorState compact error={summaryQuery.error} onRetry={summaryQuery.reload} />
          ) : summaryQuery.loading && !summaryQuery.data ? (
            <div className="qr-card-loading">
              <LoadingState compact label="불량 유형을 조회하는 중이에요" />
            </div>
          ) : distribution.length ? (
            <DefectBreakdown items={distribution} />
          ) : (
            <div className="qr-empty">
              <PackageSearch size={36} />
              <strong>
                {summary?.defect_count ? '불량 유형 기록이 없어요' : '검사 기록이 없어요'}
              </strong>
              <p>불량 유형을 집계할 데이터가 없습니다.</p>
            </div>
          )}
        </section>
      </div>
      <section className="qr-observation">
        <div className="qr-observation-icon">
          <Sparkles size={23} />
        </div>
        <div>
          <span className="qr-observation-label">이번 기간 품질 체크</span>
          <h2>{observationTitle}</h2>
          <p>{observationBody}</p>
        </div>
        <button
          className="button button-white"
          disabled={!sampleItems.length}
          onClick={() => setDialog({ kind: 'basis' })}
        >
          분석 근거 확인
          <ArrowUpRight size={17} />
        </button>
      </section>
      <section className="card qr-history-card" aria-labelledby="quality-history-heading">
        <div className="qr-history-header">
          <div className="heading-inline">
            <h2 id="quality-history-heading">최근 검사 이력</h2>
            <span className="pill pill-neutral">{historyCount}건</span>
          </div>
          <span>검사 기록 단위</span>
        </div>
        <div className="qr-table-toolbar">
          <label className="qr-search">
            <Search size={18} />
            <input
              aria-label="검사 기록 검색"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="검사 번호 또는 제품명 검색"
              {...compositionHandlers}
            />
            {queryInput && (
              <button aria-label="검사 검색어 지우기" onClick={() => clearQuery('')}>
                <X size={15} />
              </button>
            )}
          </label>
          <div className="qr-select">
            <FilterSelect
              label="검사 결과 필터"
              value={['pass', 'defect', 'above'].includes(verdict) ? verdict : ''}
              onChange={(value) => setFilter('result', value)}
              options={[
                { value: '', label: '전체 검사 결과' },
                { value: 'pass', label: '양품 배치' },
                { value: 'defect', label: '불량 포함 배치' },
                { value: 'above', label: '기준 초과 배치' },
              ]}
            />
          </div>
          {listNotes.length > 0 && <span>{listNotes.join(' ')}</span>}
        </div>
        {recordsQuery.error && !rangeError && (
          <ApiErrorState compact error={recordsQuery.error} onRetry={recordsQuery.reload} />
        )}
        <div className="qr-table-scroll" role="region" tabIndex={0} aria-label="최근 검사 이력 표">
          <table className="qr-history-table">
            <caption className="sr-only">
              검사 기록별 판정과 불량 유형. 검사 수량·담당자는 API에서 제공하지 않아 —로 표시합니다.
            </caption>
            <thead>
              <tr>
                <th scope="col">검사 일시</th>
                <th scope="col">제품 / 검사 번호</th>
                <th scope="col">설비</th>
                <th scope="col" className="qr-number">
                  검사 수량
                </th>
                <th scope="col" className="qr-number">
                  불량 수량
                </th>
                <th scope="col" className="qr-number">
                  검사 불량률
                </th>
                <th scope="col">검사 결과</th>
                <th scope="col">담당자</th>
                <th scope="col">상세</th>
              </tr>
            </thead>
            <tbody>
              {recordsQuery.loading && !recordsQuery.data && (
                <tr>
                  <td colSpan={9}>
                    <div className="qr-table-loading" role="status" aria-live="polite">
                      <LoaderCircle size={22} />
                      <span>검사 이력을 조회하는 중이에요</span>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((record) => {
                const { date, time } = seoulDateTime(record.inspected_at);
                const good = record.verdict === 'good';
                return (
                  <tr key={record.record_id}>
                    <td className="qr-time-cell">
                      <strong>{date}</strong>
                      <small>{time}</small>
                    </td>
                    <td>
                      <button
                        className="qr-product-cell"
                        onClick={() =>
                          setDialog({ kind: 'inspection', recordId: record.record_id })
                        }
                      >
                        <strong>{recordProductLabel(record)}</strong>
                        <small>#{record.record_id}</small>
                      </button>
                    </td>
                    <td className="qr-equipment-cell">{recordEquipmentLabel(record)}</td>
                    <td className="qr-number">
                      <MissingValue />
                    </td>
                    <td className="qr-number">
                      <MissingValue />
                    </td>
                    <td className="qr-number">
                      <MissingValue />
                    </td>
                    <td>
                      <span className={`pill ${good ? 'pill-green' : 'qr-pill-danger'}`}>
                        {good ? <Check size={12} /> : <TriangleAlert size={12} />}
                        {qualityVerdict(record)}
                      </span>
                    </td>
                    <td className="qr-inspector">
                      <MissingValue />
                    </td>
                    <td>
                      <button
                        className="qr-detail-link"
                        aria-label={`${record.record_id} 상세 보기`}
                        onClick={() =>
                          setDialog({ kind: 'inspection', recordId: record.record_id })
                        }
                      >
                        상세 보기 <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && !recordsQuery.loading && !recordsQuery.error && (
            <div className="qr-empty qr-table-empty">
              <PackageSearch size={36} />
              <strong>조건에 맞는 검사 이력이 없어요</strong>
              <p>
                {rangeError ||
                  (searchTerm
                    ? '현재 페이지에 검색 결과가 없어요.'
                    : '조회 조건이나 검색어를 바꿔 다시 확인해 주세요.')}
              </p>
              <button className="button button-white button-sm" onClick={() => setParams({})}>
                <FilterX size={16} />
                조회 조건 초기화
              </button>
            </div>
          )}
        </div>
        <div className="qr-table-footer">
          <span>
            전체 <strong>{totalItems}건</strong>
            {totalItems > 0 &&
              ` 중 ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItems)}건`}
          </span>
          <div className="qr-pagination">
            <button
              className="icon-button"
              aria-label="검사 이력 이전 페이지"
              disabled={page === 1}
              onClick={() => setFilter('page', String(page - 1))}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              {page} <small>/ {pageCount}</small>
            </span>
            <button
              className="icon-button"
              aria-label="검사 이력 다음 페이지"
              disabled={page === pageCount}
              onClick={() => setFilter('page', String(page + 1))}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <footer className="page-footer qr-page-footer">
        <span>
          검사 불량률은 검사 기록 판정 기준이며 전체 생산 불량률과 다릅니다. 검사 수량·담당자 등
          API에 없는 값은 —로 표시합니다.
        </span>
      </footer>
      {dialog && (
        <Modal
          title={
            dialog.kind === 'inspection'
              ? '검사 상세'
              : dialog.kind === 'preview'
                ? `${qualityReportLabel(filters)} 품질 리포트`
                : '품질 체크 · 분석 근거'
          }
          onClose={() => setDialog(null)}
          wide={dialog.kind === 'preview'}
        >
          {dialog.kind === 'inspection' && <InspectionDetailDialog recordId={dialog.recordId} />}
          {dialog.kind === 'preview' && (
            <div className="qr-report-preview">
              <div className="qr-preview-brand">
                <FileChartColumn size={24} />
                <strong>
                  사출반장 <span>QUALITY REPORT</span>
                </strong>
              </div>
              <h3>{qualityReportLabel(filters)} 품질 리포트</h3>
              <p className="qr-preview-scope">
                {qualityDateLabel(filters.from)}–{qualityDateLabel(filters.to)}
                <br />
                {productLabel} · {equipmentLabel}
              </p>
              <div className="qr-detail-values">
                <div>
                  <span>검사 수량</span>
                  <strong>
                    {metric(summary?.inspected_count)}
                    {summary && <small>건</small>}
                  </strong>
                </div>
                <div>
                  <span>불량 수량</span>
                  <strong>
                    {metric(summary?.defect_count)}
                    {summary && <small>건</small>}
                  </strong>
                </div>
                <div>
                  <span>검사 불량률</span>
                  <strong>{formatRate(summary?.defect_rate ?? null)}</strong>
                </div>
              </div>
              <h4>제품별 검사 요약</h4>
              {productSummaries.length ? (
                <div className="qr-preview-products">
                  {productSummaries.map((product) => (
                    <div key={product.key}>
                      <strong>{product.label}</strong>
                      <span>
                        검사 {product.inspected.toLocaleString()}건 · 불량 {product.defective}건
                      </span>
                      <b>{formatRate(product.rate)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">기록 없음</p>
              )}
              <h4>주요 확인 사항</h4>
              <p className="qr-preview-body">
                {focus
                  ? `${focus.label}의 검사 불량률이 ${formatRate(focus.rate)}로 점검 기준 ${inspectionThreshold}%를 초과했습니다. 해당 기간의 공정 조건 및 조치 이력을 우선 확인해 주세요.`
                  : sampleItems.length
                    ? '선택한 검사 범위에서는 점검 기준을 초과한 제품이 없습니다.'
                    : '기록 없음'}
              </p>
              <p className="qr-preview-note">
                이 리포트는 선택한 검사 기록 데이터에 기반합니다. 불량 원인이나 전체 생산 품질을
                확정하지 않습니다. 제품별 요약은 최근 {SAMPLE_SIZE}건 조회 기준입니다.
              </p>
              <button
                className="button button-primary qr-report-save"
                onClick={() => {
                  saveFile(
                    `사출반장_${qualityReportLabel(filters)}품질리포트_${filters.to}.txt`,
                    buildQualityReportText({
                      filters,
                      summary,
                      products: productSummaries,
                      focus: focusItems,
                      productLabel,
                      equipmentLabel,
                    }),
                    'text/plain;charset=utf-8',
                  );
                  setFeedback('선택 조건의 품질 리포트를 텍스트로 내려받았어요.');
                }}
              >
                <Download size={18} />
                텍스트 리포트 저장
              </button>
            </div>
          )}
          {dialog.kind === 'basis' && (
            <div className="qr-basis">
              <CircleHelp size={30} />
              <h3>어떤 기준으로 확인하나요?</h3>
              <p>
                상단 조회 조건에 해당하는 검사 기록을 제품별로 합산하고, 검사 불량률이{' '}
                {inspectionThreshold}%를 초과하는 품목을 중점 확인 대상으로 표시합니다.
              </p>
              <div className="modal-callout">
                <strong>검사 불량률 = 불량 건수 ÷ 검사 건수 × 100</strong>
                <p>
                  날짜별 불량률의 단순 평균을 사용하지 않습니다. 이전 기간 비교는 같은 길이의 바로
                  앞 기간을 사용하며, 같은 제품·설비 조건으로 계산합니다.
                </p>
              </div>
              {focusItems.map((product) => (
                <div className="qr-basis-product" key={product.key}>
                  <strong>{product.label}</strong>
                  <p>
                    검사 {product.inspected.toLocaleString()}건 · 불량 {product.defective}건 ·{' '}
                    {formatRate(product.rate)}
                  </p>
                  <button
                    className="text-link"
                    disabled={product.productId === null}
                    onClick={() => {
                      if (product.productId === null) return;
                      setFilter('product', String(product.productId));
                      setDialog(null);
                      document
                        .getElementById('quality-history-heading')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    해당 제품 검사 보기
                    <ArrowRight size={15} />
                  </button>
                </div>
              ))}
              {!focusItems.length && (
                <p className="empty-text">
                  {sampleItems.length ? '점검 기준을 초과한 품목이 없어요.' : '기록 없음'}
                </p>
              )}
              <p className="qr-preview-note">
                관찰된 차이는 불량 원인을 증명하지 않으며, 공정 조건과 현장 조치를 함께 검토해야
                합니다.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
