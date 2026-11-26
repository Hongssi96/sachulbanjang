import { usePageEntryReady } from '../../components/PageEntry/PageEntryContext';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  History,
  Layers,
  Package,
  Pencil,
  Search,
  X,
} from 'lucide-react';
import ApiErrorState from '../../components/ApiErrorState';
import MissingValue from '../../components/MissingValue';
import DatePicker from '../../components/DatePicker';
import FilterSelect from '../../components/FilterSelect';
import LoadingState from '../../components/LoadingState';
import Modal from '../../components/Modal';
import QueryFilterCard from '../../components/QueryFilterCard';
import SegmentedControl from '../../components/SegmentedControl';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { ApiError } from '../../api/client';
import { fetchEquipment, fetchProducts } from '../../api/masterData';
import { fetchQualitySummary } from '../../api/quality';
import {
  fetchInspectionRecord,
  fetchInspectionRecordChanges,
  fetchInspectionRecords,
  fetchProcessRecord,
  fetchProcessRecordChanges,
  fetchProcessRecords,
  updateInspectionRecord,
  updateProcessRecord,
} from '../../api/records';
import type {
  InspectionRecord,
  InspectionRecordUpdate,
  ProcessRecord,
  ProcessRecordDetail,
  ProcessRecordUpdate,
  RecordListParams,
} from '../../api/records';
import { formatDateTime, shiftDateISO, todayISO } from '../../utils/dateFormat';
import './RecordsPage.css';

const PAGE_SIZE = 10;
const NA = '—';
const DEFECT_TYPE_LABELS = ['가스', '찍힘', '휘어짐', '미성형'] as const;
const PRESET_OPTIONS = [
  { value: 'today', label: '오늘' },
  { value: 'week', label: '최근 7일' },
  { value: 'all', label: '전체 기간' },
] as const;
type PresetKey = (typeof PRESET_OPTIONS)[number]['value'];
type RecordView = 'inspection' | 'production';

type ListRow =
  { kind: 'production'; record: ProcessRecord } | { kind: 'inspection'; record: InspectionRecord };

const number = (value: number) => value.toLocaleString('ko-KR');
const rateText = (value: number | null) => (value === null ? null : `${value.toFixed(2)}%`);
const dateLabel = (value: string) => value.replaceAll('-', '.');
const positiveInt = (value: string) => (/^\d+$/.test(value) ? Number(value) : undefined);
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const readView = (value: string | null): RecordView =>
  value === 'production' ? 'production' : 'inspection';

function splitDateTime(value: string | null): [string, string] {
  if (!value) return [NA, NA];
  const formatted = formatDateTime(value);
  if (formatted === NA) return [NA, NA];
  const [date, time] = formatted.split(' ');
  return [date ?? NA, time ?? NA];
}

function rowSearchText(row: ListRow) {
  const record = row.record;
  const parts: (string | null | undefined)[] = [
    record.product_name,
    record.product_code,
    record.equipment_name,
    record.equipment_code,
    String(record.record_id),
  ];
  if (row.kind === 'inspection') {
    parts.push(row.record.verdict, row.record.defect_type, row.record.reason);
  }
  return parts
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}

function viewQuery(params: URLSearchParams, view: RecordView) {
  const next = new URLSearchParams(params);
  next.set('view', view);
  return `?${next}`;
}

function toSeoulInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

function toOffsetIso(value: string) {
  return `${value.length === 16 ? `${value}:00` : value}+09:00`;
}

function changeSummary(value: Record<string, unknown> | null) {
  if (!value) return NA;
  const entries = Object.entries(value);
  if (!entries.length) return NA;
  return entries
    .map(([key, item]) => `${key}: ${item === null || item === undefined ? NA : String(item)}`)
    .join(' · ');
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function NotAvailable() {
  return <MissingValue />;
}

function VerdictPill({ row }: { row: ListRow }) {
  if (row.kind === 'production') return <span className="rd-pill neutral">{NA}</span>;
  return (
    <span className={`rd-pill ${row.record.verdict === 'defect' ? 'defect' : 'good'}`}>
      {row.record.verdict === 'good' ? '양품' : '불량'}
    </span>
  );
}

function listCsv(rows: ListRow[], production: boolean) {
  const header = production
    ? [
        '생산 완료',
        '제품',
        '생산 배치',
        '설비',
        '목표 수량',
        '생산 수량',
        '달성률',
        '검사 결과',
        '담당자',
        '사이클 타임(초)',
        '시연 여부',
        '기록 번호',
      ]
    : [
        '검사 완료',
        '제품',
        '검사 번호',
        '설비',
        '검사 수량',
        '불량 수량',
        '불량률',
        '검사 결과',
        '담당자',
        '불량 유형',
        '사유',
        '시연 여부',
        '기록 번호',
      ];
  const body = rows.map((row) => {
    const [date, time] = splitDateTime(
      row.kind === 'production' ? row.record.occurred_at : row.record.inspected_at,
    );
    const common = [
      `${date} ${time}`,
      row.record.product_name ?? row.record.product_code ?? NA,
      row.kind === 'production' ? NA : String(row.record.record_id),
      row.record.equipment_name || row.record.equipment_code,
      NA,
      NA,
      NA,
      row.kind === 'inspection' ? (row.record.verdict === 'good' ? '양품' : '불량') : NA,
      NA,
    ];
    if (row.kind === 'production') {
      common.push(
        row.record.cycle_time_seconds === null ? NA : String(row.record.cycle_time_seconds),
        row.record.is_demo ? '예' : '아니요',
        String(row.record.record_id),
      );
    } else {
      common.push(
        row.record.defect_type ?? NA,
        row.record.reason ?? NA,
        row.record.is_demo ? '예' : '아니요',
        String(row.record.record_id),
      );
    }
    return common;
  });
  return `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

function downloadCsv(rows: ListRow[], production: boolean) {
  const url = URL.createObjectURL(
    new Blob([listCsv(rows, production)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = '사출반장_생산검사이력.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RecordsPage() {
  const [params, rawSetParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const setParams = useCallback(
    (...args: Parameters<typeof rawSetParams>) => startTransition(() => rawSetParams(...args)),
    [rawSetParams, startTransition],
  );

  const today = todayISO();
  const defaultFrom = shiftDateISO(today, -6);
  const allPeriod = params.get('period') === 'all';
  const from = allPeriod ? '' : (params.get('from') ?? defaultFrom);
  const to = allPeriod ? '' : (params.get('to') ?? today);
  const product = positiveInt(params.get('product') ?? '');
  const equipment = positiveInt(params.get('equipment') ?? '');
  const query = params.get('q') ?? '';
  const result = params.get('result') ?? '';
  const order = params.get('order') === 'oldest' ? 'oldest' : 'latest';
  const production = params.get('view') === 'production';

  const update = (values: Record<string, string>) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(values).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      next.delete('page');
      return next;
    });
  const {
    input: queryInput,
    setInput: setQueryInput,
    compositionHandlers,
  } = useDebouncedSearch({
    value: query,
    onSearch: (value) => update({ q: value }),
  });

  const rangeError =
    allPeriod || (validDate(from) && validDate(to) && from <= to)
      ? ''
      : from > to
        ? '종료일은 시작일보다 같거나 늦어야 합니다.'
        : '조회 시작일과 종료일을 올바르게 선택해 주세요.';

  const requested = Number(params.get('page'));
  const requestedPage = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const verdictFilter = result === 'pass' ? 'good' : result === 'defect' ? 'defect' : undefined;
  const recordParams: RecordListParams = {
    equipmentId: equipment,
    productId: product,
    from: from || undefined,
    to: to || undefined,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  };

  const equipmentQuery = useApiQuery('records:equipment', () => fetchEquipment());
  const productsQuery = useApiQuery('records:products', () => fetchProducts());
  const summaryQuery = useApiQuery(
    `records:summary:${from}:${to}:${product ?? ''}:${equipment ?? ''}`,
    () =>
      fetchQualitySummary({
        from: from || undefined,
        to: to || undefined,
        equipmentId: equipment,
        productId: product,
      }),
    { enabled: !rangeError },
  );
  const processQuery = useApiQuery(
    `records:process:${from}:${to}:${product ?? ''}:${equipment ?? ''}:${requestedPage}`,
    () => fetchProcessRecords(recordParams),
    { enabled: production && !rangeError },
  );
  const inspectionQuery = useApiQuery(
    `records:inspection:${from}:${to}:${product ?? ''}:${equipment ?? ''}:${verdictFilter ?? ''}:${requestedPage}`,
    () => fetchInspectionRecords({ ...recordParams, verdict: verdictFilter }),
    { enabled: !production && !rangeError },
  );

  const activeData = production ? processQuery.data : inspectionQuery.data;
  const activeError = production ? processQuery.error : inspectionQuery.error;
  const activeLoading = production ? processQuery.loading : inspectionQuery.loading;
  usePageEntryReady(
    !equipmentQuery.loading &&
      !productsQuery.loading &&
      (Boolean(rangeError) || (!summaryQuery.loading && !activeLoading)),
  );
  const activeReload = production ? processQuery.reload : inspectionQuery.reload;
  const totalItems = activeData?.pagination.total_items ?? 0;
  const totalPages = activeData?.pagination.total_pages ?? 0;
  const page = Math.min(requestedPage, Math.max(1, totalPages));

  useEffect(() => {
    if (totalPages > 0 && requestedPage > totalPages) {
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        next.set('page', String(totalPages));
        return next;
      });
    }
  }, [requestedPage, totalPages, setParams]);

  const rows: ListRow[] = production
    ? (processQuery.data?.items ?? []).map((record): ListRow => ({ kind: 'production', record }))
    : (inspectionQuery.data?.items ?? []).map((record): ListRow => ({
        kind: 'inspection',
        record,
      }));
  const searched = query.trim()
    ? rows.filter((row) => rowSearchText(row).includes(query.trim().toLowerCase()))
    : rows;
  const visibleRows = order === 'oldest' ? [...searched].reverse() : searched;

  const summary = summaryQuery.data;
  const cards = [
    {
      label: '생산 배치',
      value: summary ? number(summary.production_record_count) : null,
      unit: '건',
      note: '조회 조건의 생산 기록 건수',
      icon: Layers,
    },
    {
      label: '생산 수량',
      value: null,
      unit: '',
      note: 'API에서 제공하지 않아요',
      icon: Package,
    },
    {
      label: '검사 수량',
      value: summary ? number(summary.inspected_count) : null,
      unit: '건',
      note: summary ? `양품 ${number(summary.good_count)}건 · 검사 기록 기준` : NA,
      icon: ClipboardCheck,
    },
    {
      label: '검사 불량률',
      value: summary ? rateText(summary.defect_rate) : null,
      unit: '',
      note: summary ? `검사 불량 ${number(summary.defect_count)}건` : NA,
      icon: Activity,
    },
  ];

  const presets: Record<PresetKey, { from: string; to: string }> = {
    today: { from: today, to: today },
    week: { from: defaultFrom, to: today },
    all: { from: '', to: '' },
  };
  const presetKey: PresetKey | 'custom' = allPeriod
    ? 'all'
    : from === today && to === today
      ? 'today'
      : from === defaultFrom && to === today
        ? 'week'
        : 'custom';

  const listNotes: string[] = [];
  if (query.trim()) listNotes.push('검색은 현재 페이지 안에서만 적용됩니다.');
  if (order === 'oldest') listNotes.push('정렬은 현재 페이지 안에서만 적용됩니다.');
  if (result === 'above') listNotes.push('‘기준 초과’는 검사 수량 정보가 없어 적용되지 않습니다.');
  if (production && result) listNotes.push('생산 이력에는 검사 결과 필터가 적용되지 않습니다.');
  const listCaption = listNotes.join(' ');
  const filterCaption =
    equipmentQuery.error || productsQuery.error ? ' · 설비·품목 목록을 불러오지 못했습니다.' : '';
  const firstRow = visibleRows[0] ?? rows[0];

  return (
    <section className="records-page" aria-busy={isPending}>
      <h1 className="sr-only">생산·검사 이력</h1>
      <QueryFilterCard
        presets={
          <SegmentedControl
            label="빠른 기간 선택"
            value={presetKey}
            options={PRESET_OPTIONS}
            onChange={(value) => {
              if (value === 'custom') return;
              const range = presets[value];
              update({ period: value === 'all' ? 'all' : '', from: range.from, to: range.to });
            }}
          />
        }
        onReset={() => setParams({})}
        error={rangeError}
        caption={
          <>
            {allPeriod
              ? '전체 기간을 조회합니다. (한국 시간 기준)'
              : `조회 기간 ${dateLabel(from)}–${dateLabel(to)} (한국 시간 기준)`}
            {filterCaption}
          </>
        }
      >
        <fieldset>
          <legend>조회 기간</legend>
          <div className="query-date-range">
            <DatePicker
              aria-label="조회 시작일"
              value={from}
              onChange={(e) => update({ period: '', from: e.target.value })}
            />
            <span aria-hidden="true">—</span>
            <DatePicker
              aria-label="조회 종료일"
              value={to}
              onChange={(e) => update({ period: '', to: e.target.value })}
            />
          </div>
        </fieldset>
        <div className="query-field">
          <span>제품</span>
          <FilterSelect
            label="제품 선택"
            value={product === undefined ? '' : String(product)}
            onChange={(value) => update({ product: value })}
            options={[
              { value: '', label: '전체 제품' },
              ...(productsQuery.data ?? []).map((item) => ({
                value: String(item.product_id),
                label: item.name,
              })),
            ]}
          />
        </div>
        <div className="query-field">
          <span>설비</span>
          <FilterSelect
            label="설비 선택"
            value={equipment === undefined ? '' : String(equipment)}
            onChange={(value) => update({ equipment: value })}
            options={[
              { value: '', label: '전체 설비' },
              ...(equipmentQuery.data ?? []).map((item) => ({
                value: String(item.equipment_id),
                label: item.name || item.equipment_code,
              })),
            ]}
          />
        </div>
      </QueryFilterCard>
      {summaryQuery.error && (
        <ApiErrorState compact error={summaryQuery.error} onRetry={summaryQuery.reload} />
      )}
      {summary?.includes_demo && (
        <p className="rd-demo">
          <span aria-hidden="true" />
          조회 결과에 시연 데이터가 포함되어 있어요.
        </p>
      )}
      <div className="rd-summary" aria-busy={summaryQuery.loading}>
        {cards.map(({ label, value, unit, note, icon: Icon }) => (
          <div
            className={label === '검사 불량률' ? 'rd-panel rd-stat-rate' : 'rd-panel'}
            key={label}
          >
            <span className="rd-stat-label">
              {label}
              <Icon size={17} />
            </span>
            <strong>
              {value === null ? <MissingValue size="lg" /> : value}
              {unit && <small>{unit}</small>}
            </strong>
            {note && <p>{note}</p>}
          </div>
        ))}
      </div>
      <div className="rd-panel rd-list">
        <div className="rd-list-heading">
          <div>
            <h2>
              생산·검사 기록 <span>{totalItems}</span>
            </h2>
          </div>
          <div className="rd-heading-actions">
            <button
              className="rd-button button-sm"
              disabled={!visibleRows.length}
              onClick={() => downloadCsv(visibleRows, production)}
            >
              <Download size={16} /> 이력 다운로드
            </button>
            {firstRow ? (
              <Link
                className="rd-button rd-primary button-sm"
                to={`/records/${firstRow.record.record_id}/precision-inspection${viewQuery(params, firstRow.kind)}`}
              >
                정밀기계검사 <ArrowUpRight size={16} />
              </Link>
            ) : (
              <History size={22} />
            )}
          </div>
        </div>
        <div className="rd-tabs" aria-label="이력 종류">
          <button
            aria-pressed={!production}
            className={!production ? 'active' : ''}
            onClick={() => update({ view: '' })}
          >
            검사 이력
          </button>
          <button
            aria-pressed={production}
            className={production ? 'active' : ''}
            onClick={() => update({ view: 'production' })}
          >
            생산 이력
          </button>
        </div>
        <div className="rd-toolbar">
          <label className="rd-search">
            <Search size={17} />
            <input
              aria-label="이력 검색"
              placeholder="제품명, 기록 번호, 설비 검색"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              {...compositionHandlers}
            />
          </label>
          <FilterSelect
            label="검사 담당자"
            value=""
            onChange={() => undefined}
            options={[{ value: '', label: '전체 담당자' }]}
          />
          <FilterSelect
            label="검사 결과"
            value={result}
            onChange={(value) => update({ result: value })}
            options={[
              { value: '', label: '전체 검사 결과' },
              { value: 'pass', label: '양품' },
              { value: 'defect', label: '불량 포함' },
              { value: 'above', label: '기준 초과 (3%)' },
            ]}
          />
          <FilterSelect
            label="정렬"
            value={order}
            onChange={(value) => update({ order: value === 'oldest' ? 'oldest' : '' })}
            options={[
              { value: 'latest', label: '최신순' },
              { value: 'oldest', label: '오래된순' },
            ]}
          />
        </div>
        {listCaption && <p className="rd-table-caption">{listCaption}</p>}
        {activeError ? (
          <ApiErrorState compact error={activeError} onRetry={activeReload} />
        ) : (
          <>
            <div className="rd-table-wrap">
              <table>
                <caption className="sr-only">{production ? '생산' : '검사'} 이력 목록</caption>
                <thead>
                  <tr>
                    <th>{production ? '생산 완료' : '검사 완료'}</th>
                    <th>제품 / {production ? '생산 배치' : '검사 번호'}</th>
                    <th>설비</th>
                    <th>{production ? '목표 / 생산 수량' : '검사 수량'}</th>
                    <th>{production ? '달성률' : '불량 수량 / 불량률'}</th>
                    <th>검사 결과</th>
                    <th>담당자</th>
                    <th>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const [date, time] = splitDateTime(
                      row.kind === 'production' ? row.record.occurred_at : row.record.inspected_at,
                    );
                    const productLabel = row.record.product_name ?? row.record.product_code ?? NA;
                    return (
                      <tr key={`${row.kind}-${row.record.record_id}`}>
                        <td className="rd-completed-at">
                          <span>{date}</span>
                          <small>{time}</small>
                        </td>
                        <td>
                          <strong>{productLabel}</strong>
                          <small>
                            {row.kind === 'production' ? NA : String(row.record.record_id)}
                            {row.record.is_demo ? ' · 시연' : ''}
                          </small>
                        </td>
                        <td>
                          <span className="rd-equipment">
                            {row.record.equipment_name || row.record.equipment_code}
                          </span>
                        </td>
                        <td>
                          {row.kind === 'production' ? (
                            <>
                              <NotAvailable /> / <NotAvailable />
                            </>
                          ) : (
                            <NotAvailable />
                          )}
                        </td>
                        <td>
                          {row.kind === 'production' ? (
                            <NotAvailable />
                          ) : (
                            <>
                              <NotAvailable /> / <NotAvailable />
                            </>
                          )}
                        </td>
                        <td>
                          <VerdictPill row={row} />
                        </td>
                        <td>
                          <NotAvailable />
                        </td>
                        <td>
                          <Link
                            className="rd-detail-link"
                            aria-label={`${row.record.record_id} 상세 보기`}
                            to={`/records/${row.record.record_id}${viewQuery(params, row.kind)}`}
                          >
                            상세 보기 <ArrowUpRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!activeLoading && !visibleRows.length && (
              <div className="rd-empty">
                <Search size={30} />
                <h3>
                  {rangeError
                    ? '조회 기간을 확인해 주세요'
                    : query.trim()
                      ? '현재 페이지에 검색 결과가 없어요'
                      : '조건에 맞는 이력이 없어요'}
                </h3>
                <p>조회 기간이나 검색 조건을 변경해 보세요.</p>
                <button className="rd-button button-sm" onClick={() => setParams({})}>
                  조회 조건 초기화
                </button>
              </div>
            )}
          </>
        )}
        <div className="rd-pagination">
          <span>
            총 {number(totalItems)}건
            {visibleRows.length > 0 &&
              ` 중 ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length}건`}
          </span>
          <div>
            <button
              aria-label="이전 페이지"
              disabled={page === 1}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('page', String(page - 1));
                  return next;
                })
              }
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {page} / {Math.max(1, totalPages)}
            </span>
            <button
              aria-label="다음 페이지"
              disabled={page >= totalPages}
              onClick={() =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set('page', String(page + 1));
                  return next;
                })
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RecordDetailPage() {
  const { recordId } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const view = readView(params.get('view'));
  const recordIdNumber = Number(recordId);
  const validId = Number.isInteger(recordIdNumber) && recordIdNumber > 0;

  const inspectionDetail = useApiQuery(
    `record:inspection:${recordId}`,
    () => fetchInspectionRecord(recordIdNumber),
    { enabled: validId && view === 'inspection' },
  );
  const processDetail = useApiQuery(
    `record:process:${recordId}`,
    () => fetchProcessRecord(recordIdNumber),
    { enabled: validId && view === 'production' },
  );
  const active = view === 'inspection' ? inspectionDetail : processDetail;
  usePageEntryReady(!validId || !active.loading);
  const inspectionRecord = view === 'inspection' ? inspectionDetail.data : null;
  const processRecord = view === 'production' ? processDetail.data : null;
  const record: InspectionRecord | ProcessRecordDetail | null = inspectionRecord ?? processRecord;
  const changesQuery = useApiQuery(
    `record-changes:${view}:${recordId}`,
    () =>
      view === 'production'
        ? fetchProcessRecordChanges(recordIdNumber)
        : fetchInspectionRecordChanges(recordIdNumber),
    { enabled: isAdmin && validId },
  );

  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [inspectionDraft, setInspectionDraft] = useState({
    inspectedAt: '',
    verdict: 'good' as 'good' | 'defect',
    defectType: '',
    reason: '',
  });
  const [processDraft, setProcessDraft] = useState({ occurredAt: '', cycleTime: '' });

  const back = params.size ? `/records?${params}` : '/records';
  const notFound = (
    <section className="records-page">
      <Link className="rd-back" to={back}>
        <ArrowLeft size={17} /> 목록으로
      </Link>
      <div className="rd-panel rd-empty">
        <h1>이력을 찾을 수 없어요</h1>
        <p>기록 번호를 확인하거나 목록에서 다시 선택해 주세요.</p>
      </div>
    </section>
  );

  if (!validId) return notFound;
  if (active.loading && !record) {
    return (
      <section className="records-page">
        <Link className="rd-back" to={back}>
          <ArrowLeft size={17} /> 목록으로
        </Link>
        <LoadingState label="기록을 불러오는 중이에요" />
      </section>
    );
  }
  if (active.error) {
    if (active.error instanceof ApiError && active.error.status === 404) return notFound;
    return (
      <section className="records-page">
        <Link className="rd-back" to={back}>
          <ArrowLeft size={17} /> 목록으로
        </Link>
        <ApiErrorState error={active.error} onRetry={active.reload} />
      </section>
    );
  }
  if (!record) return notFound;

  const productLabel = record.product_name ?? record.product_code ?? NA;
  const equipmentLabel = record.equipment_name || record.equipment_code;
  const occurredAt = inspectionRecord?.inspected_at ?? processRecord?.occurred_at ?? null;
  const inspectionVerdict = inspectionRecord?.verdict ?? null;
  const recordDate = occurredAt ? occurredAt.slice(0, 10) : '';
  const detailParams = viewQuery(params, view);

  const openCorrection = () => {
    setSubmitError('');
    setChangeReason('');
    if (inspectionRecord) {
      setInspectionDraft({
        inspectedAt: toSeoulInput(inspectionRecord.inspected_at),
        verdict: inspectionRecord.verdict,
        defectType: inspectionRecord.defect_type ?? '',
        reason: inspectionRecord.reason ?? '',
      });
    } else if (processRecord) {
      setProcessDraft({
        occurredAt: toSeoulInput(processRecord.occurred_at),
        cycleTime:
          processRecord.cycle_time_seconds === null ? '' : String(processRecord.cycle_time_seconds),
      });
    }
    setEditing(true);
  };

  const submitCorrection = async () => {
    const reason = changeReason.trim();
    if (!reason) {
      setSubmitError('변경 사유를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      if (inspectionRecord) {
        const input: InspectionRecordUpdate = {
          version: inspectionRecord.version,
          changeReason: reason,
        };
        let changed = false;
        if (inspectionDraft.inspectedAt !== toSeoulInput(inspectionRecord.inspected_at)) {
          if (!inspectionDraft.inspectedAt) throw new Error('검사 일시를 입력해 주세요.');
          input.inspectedAt = toOffsetIso(inspectionDraft.inspectedAt);
          changed = true;
        }
        if (inspectionDraft.verdict !== inspectionRecord.verdict) {
          input.verdict = inspectionDraft.verdict;
          changed = true;
        }
        const defectType = inspectionDraft.defectType.trim() || null;
        if (defectType !== inspectionRecord.defect_type) {
          input.defectType = defectType;
          changed = true;
        }
        const nextReason = inspectionDraft.reason.trim() || null;
        if (nextReason !== inspectionRecord.reason) {
          input.reason = nextReason;
          changed = true;
        }
        if (!changed) throw new Error('변경된 값이 없습니다.');
        await updateInspectionRecord(recordIdNumber, input);
      } else if (processRecord) {
        const input: ProcessRecordUpdate = {
          version: processRecord.version,
          changeReason: reason,
        };
        let changed = false;
        if (processDraft.occurredAt !== toSeoulInput(processRecord.occurred_at)) {
          if (!processDraft.occurredAt) throw new Error('생산 일시를 입력해 주세요.');
          input.occurredAt = toOffsetIso(processDraft.occurredAt);
          changed = true;
        }
        const cycleText = processDraft.cycleTime.trim();
        if (!cycleText) {
          if (processRecord.cycle_time_seconds !== null) {
            throw new Error('사이클 타임을 입력해 주세요.');
          }
        } else {
          const cycle = Number(cycleText);
          if (!Number.isFinite(cycle) || cycle < 0) {
            throw new Error('사이클 타임은 0 이상의 숫자로 입력해 주세요.');
          }
          if (cycle !== processRecord.cycle_time_seconds) {
            input.cycleTimeSeconds = cycle;
            changed = true;
          }
        }
        if (!changed) throw new Error('변경된 값이 없습니다.');
        await updateProcessRecord(recordIdNumber, input);
      } else {
        throw new Error('정정할 기록을 찾을 수 없습니다.');
      }
      setFeedback('기록을 정정했어요.');
      setEditing(false);
      active.reload();
      if (isAdmin) changesQuery.reload();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '기록을 정정하지 못했어요.';
      if (caught instanceof ApiError && caught.code === 'VERSION_CONFLICT') {
        setSubmitError(`${message} 최신 기록을 다시 불러왔어요.`);
        active.reload();
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const downloadRecord = () => {
    const rows: string[][] = [];
    if (inspectionRecord) {
      rows.push(
        ['구분', '검사'],
        ['기록 번호', String(inspectionRecord.record_id)],
        ['제품', productLabel],
        ['설비', equipmentLabel],
        ['검사 일시', formatDateTime(inspectionRecord.inspected_at)],
        ['판정', inspectionRecord.verdict === 'good' ? '양품' : '불량'],
        ['불량 유형', inspectionRecord.defect_type ?? NA],
        ['사유', inspectionRecord.reason ?? NA],
        ['시연 여부', inspectionRecord.is_demo ? '예' : '아니요'],
        ['버전', String(inspectionRecord.version)],
      );
    } else if (processRecord) {
      rows.push(
        ['구분', '생산'],
        ['기록 번호', String(processRecord.record_id)],
        ['제품', productLabel],
        ['설비', equipmentLabel],
        ['생산 일시', formatDateTime(processRecord.occurred_at)],
        ['가용 일시', processRecord.available_at ? formatDateTime(processRecord.available_at) : NA],
        [
          '사이클 타임(초)',
          processRecord.cycle_time_seconds === null ? NA : String(processRecord.cycle_time_seconds),
        ],
        ['시연 여부', processRecord.is_demo ? '예' : '아니요'],
        ['버전', String(processRecord.version)],
      );
    } else {
      return;
    }
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '사출반장_생산검사이력.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const summaryCards = [
    { label: '생산 수량', value: null, unit: '', note: 'API에서 제공하지 않아요' },
    { label: '검사 수량', value: null, unit: '', note: '검사 수량 정보가 없어요' },
    { label: '검사 양품', value: null, unit: '', note: '검사 수량 정보가 없어요' },
    {
      label: '검사 불량률',
      value: null,
      unit: '',
      note: inspectionVerdict
        ? `판정 ${inspectionVerdict === 'good' ? '양품' : '불량'}`
        : '검사 판정이 없어요',
    },
  ];

  const cycleLabel =
    processRecord !== null && processRecord.cycle_time_seconds !== null
      ? `${processRecord.cycle_time_seconds}초`
      : NA;

  const infoRows: [string, string][] = [
    ['생산 배치', NA],
    ['생산 기록 번호', processRecord ? String(processRecord.record_id) : NA],
    ['검사 번호', inspectionRecord ? String(inspectionRecord.record_id) : NA],
    ['제품', productLabel],
    ['설비', equipmentLabel],
    ['생산 목표', NA],
    ['목표 달성률', NA],
    ['검사 담당자', NA],
    ['표본 검사 비율', NA],
    ['사이클 타임', cycleLabel],
    ['불량 유형', inspectionRecord?.defect_type ?? NA],
    ['시연 데이터', record.is_demo ? '예' : '아니요'],
    ['기록 버전', String(record.version)],
  ];

  const timeline: [string, string | null][] = [
    ['생산 시작', null],
    ['생산 완료', processRecord?.occurred_at ?? null],
    ['표본 검사 완료', inspectionRecord?.inspected_at ?? null],
    ['이력 저장', record.available_at],
  ];

  const qualityQuery = recordDate
    ? `?from=${recordDate}&to=${recordDate}&product=${encodeURIComponent(
        record.product_name ?? '',
      )}&equipment=${encodeURIComponent(record.equipment_code)}`
    : '';

  return (
    <section className="records-page">
      <Link className="rd-back" to={back}>
        <ArrowLeft size={17} /> 생산·검사 기록으로 돌아가기
      </Link>
      {feedback && (
        <div className="rd-feedback" role="status">
          <Check size={18} />
          <span>{feedback}</span>
          <button
            className="icon-button"
            aria-label="정정 알림 닫기"
            onClick={() => setFeedback('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="rd-heading">
        <div>
          <h1>
            {productLabel}{' '}
            {inspectionVerdict ? (
              <span className={`rd-pill ${inspectionVerdict === 'defect' ? 'defect' : 'good'}`}>
                {inspectionVerdict === 'good' ? '양품' : '불량'}
              </span>
            ) : (
              <span className="rd-pill neutral">{NA}</span>
            )}
          </h1>
          <p>
            {NA} · {equipmentLabel} · {occurredAt ? formatDateTime(occurredAt) : NA}
            {record.is_demo ? ' · 시연 데이터' : ''}
          </p>
        </div>
        <div className="rd-heading-actions">
          <Link
            className="rd-button button-sm"
            to={`/records/${record.record_id}/precision-inspection${detailParams}`}
          >
            정밀기계검사 <ArrowUpRight size={16} />
          </Link>
          <button className="rd-button button-sm" onClick={downloadRecord}>
            <Download size={16} /> 이력 다운로드
          </button>
          {isAdmin && (
            <button className="rd-button button-sm" onClick={openCorrection}>
              <Pencil size={16} /> 기록 정정
            </button>
          )}
        </div>
      </div>
      <div className="rd-summary">
        {summaryCards.map(({ label, value, unit, note }) => (
          <div
            className={label === '검사 불량률' ? 'rd-panel rd-stat-rate' : 'rd-panel'}
            key={label}
          >
            <span className="rd-stat-label">{label}</span>
            <strong>
              {value === null ? <MissingValue size="lg" /> : value}
              {unit && <small>{unit}</small>}
            </strong>
            <p>{note}</p>
          </div>
        ))}
      </div>
      <div className="rd-detail-grid">
        <div>
          <article className="rd-panel rd-detail-card">
            <h2>생산·검사 정보</h2>
            <dl>
              {infoRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className="rd-panel rd-detail-card">
            <h2>검사 결과</h2>
            <div className="rd-result-top">
              <strong>
                판정 {inspectionVerdict === 'good' ? '양품' : inspectionVerdict ? '불량' : NA}
              </strong>
              <span>불량 유형 {inspectionRecord?.defect_type ?? NA}</span>
            </div>
            <div
              className="rd-result-bar"
              aria-label={
                inspectionVerdict === 'good'
                  ? '검사 판정 양품'
                  : inspectionVerdict === 'defect'
                    ? '검사 판정 불량'
                    : '검사 판정 정보 없음'
              }
            >
              <span style={{ width: inspectionVerdict === 'good' ? '100%' : '0%' }} />
            </div>
            <div className="rd-defect-grid">
              {DEFECT_TYPE_LABELS.map((type) => (
                <div key={type}>
                  <span>{type}</span>
                  <strong>
                    <MissingValue />
                  </strong>
                </div>
              ))}
            </div>
            <p className="rd-footnote">
              건별 검사 수량이 제공되지 않아 수량 기준 비율은 표시하지 않습니다. 불량 사유:{' '}
              {inspectionRecord?.reason ?? NA}
            </p>
          </article>
        </div>
        <aside>
          <article className="rd-panel rd-detail-card">
            <h2>배치 처리 흐름</h2>
            <ol className="rd-timeline">
              {timeline.map(([label, time]) => (
                <li key={label}>
                  <strong>{label}</strong>
                  <time>{time ? formatDateTime(time) : NA}</time>
                </li>
              ))}
            </ol>
          </article>
          {isAdmin && (
            <article className="rd-panel rd-detail-card">
              <h2>정정 이력</h2>
              {changesQuery.loading ? (
                <LoadingState compact label="정정 이력을 불러오는 중이에요" />
              ) : changesQuery.error ? (
                <ApiErrorState compact error={changesQuery.error} onRetry={changesQuery.reload} />
              ) : changesQuery.data?.length ? (
                <ul className="rd-change-list">
                  {changesQuery.data.map((change) => (
                    <li key={change.change_id}>
                      <div>
                        <strong>{change.actor_display_name}</strong>
                        <time>{formatDateTime(change.occurred_at)}</time>
                      </div>
                      <p>{change.reason}</p>
                      <small>
                        v{change.version} · {change.operation} · {changeSummary(change.after_value)}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rd-footnote">정정 이력이 없어요.</p>
              )}
            </article>
          )}
          <article className="rd-panel rd-detail-card rd-related">
            <ClipboardCheck size={24} />
            <h2>품질 흐름도 확인해 보세요</h2>
            <p>같은 제품·설비의 검사 결과를 품질 리포트에서 확인할 수 있어요.</p>
            <Link className="rd-button" to={`/quality-reports${qualityQuery}`}>
              품질 리포트 보기 <ArrowUpRight size={16} />
            </Link>
          </article>
        </aside>
      </div>
      {editing && (
        <Modal
          title="기록 정정"
          onClose={() => {
            if (!submitting) setEditing(false);
          }}
        >
          <form
            className="rd-correct-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCorrection();
            }}
          >
            {inspectionRecord ? (
              <>
                <label>
                  <span>검사 일시</span>
                  <input
                    type="datetime-local"
                    required
                    step="1"
                    value={inspectionDraft.inspectedAt}
                    onChange={(event) =>
                      setInspectionDraft((draft) => ({
                        ...draft,
                        inspectedAt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>판정</span>
                  <select
                    value={inspectionDraft.verdict}
                    onChange={(event) =>
                      setInspectionDraft((draft) => ({
                        ...draft,
                        verdict: event.target.value === 'defect' ? 'defect' : 'good',
                      }))
                    }
                  >
                    <option value="good">양품</option>
                    <option value="defect">불량</option>
                  </select>
                </label>
                <label>
                  <span>불량 유형</span>
                  <input
                    type="text"
                    maxLength={100}
                    value={inspectionDraft.defectType}
                    onChange={(event) =>
                      setInspectionDraft((draft) => ({
                        ...draft,
                        defectType: event.target.value,
                      }))
                    }
                    placeholder="불량인 경우 입력"
                  />
                </label>
                <label>
                  <span>사유</span>
                  <input
                    type="text"
                    maxLength={500}
                    value={inspectionDraft.reason}
                    onChange={(event) =>
                      setInspectionDraft((draft) => ({ ...draft, reason: event.target.value }))
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>생산 일시</span>
                  <input
                    type="datetime-local"
                    required
                    step="1"
                    value={processDraft.occurredAt}
                    onChange={(event) =>
                      setProcessDraft((draft) => ({ ...draft, occurredAt: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>사이클 타임(초)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={processDraft.cycleTime}
                    onChange={(event) =>
                      setProcessDraft((draft) => ({ ...draft, cycleTime: event.target.value }))
                    }
                  />
                </label>
              </>
            )}
            <label>
              <span>변경 사유</span>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="정정 사유를 입력해 주세요"
              />
            </label>
            {submitError && (
              <p className="rd-form-error" role="alert">
                {submitError}
              </p>
            )}
            <div className="rd-form-actions">
              <button
                type="button"
                className="rd-button"
                disabled={submitting}
                onClick={() => setEditing(false)}
              >
                취소
              </button>
              <button type="submit" className="rd-button rd-primary" disabled={submitting}>
                {submitting ? '저장 중…' : '정정 저장'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
