import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import ApiErrorState from '../components/ApiErrorState';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';
import MetricTrendChart from '../components/MetricTrendChart';
import SegmentedControl from '../components/SegmentedControl';
import { fetchEquipment, fetchProducts } from '../api/masterData';
import { fetchCurrentProcess } from '../api/process';
import type { CurrentProcessItem, ReplayState } from '../api/process';
import { fetchQualitySummary } from '../api/quality';
import { useApiQuery } from '../hooks/useApiQuery';
import { formatDateTime, shiftDateISO, todayISO } from '../utils/dateFormat';

/** 설비 상태 라벨. BE에 설비 상태 API가 없어 현재는 값이 없으면 '—'로 표시한다. */
type EquipmentState = '정상' | '주의' | '고장' | '휴식';

const NA = '—';
// 점검 기준은 품질 리포트와 같은 라벨 검사 기준(%)이다.
const INSPECTION_THRESHOLD = 3;

const statePill: Record<EquipmentState, string> = {
  정상: 'pill-green',
  주의: 'pill-amber',
  고장: 'pill-red',
  휴식: 'pill-neutral',
};
const stateOrder: EquipmentState[] = ['정상', '주의', '휴식', '고장'];
const stateColor: Record<EquipmentState, string> = {
  정상: '#61E2A6',
  주의: '#F2BB69',
  고장: '#D95F70',
  휴식: '#A9AAB5',
};

const replayNotices: Record<ReplayState | 'none', string> = {
  none: '공정 데이터 재생 정보가 없어요.',
  ready: '공정 데이터 재생이 준비되어 있어요.',
  running: '공정 데이터를 실시간으로 재생하고 있어요.',
  delayed: '데이터 반영이 지연되고 있어요. 마지막 반영 시각 기준으로 표시합니다.',
  completed: '재생이 종료되어 마지막 반영 데이터를 표시하고 있어요.',
  failed: '데이터 재생에 실패했어요. 마지막 반영 데이터 기준으로 표시합니다.',
};

// 설비 상태·진행률·생산량은 현재 공정 API가 제공하지 않는다. 값이 없는 항목은
// 가짜 수치 대신 '—'로 두고, 상태가 확인되지 않은 설비는 강조 색을 쓰지 않는다.
interface MachineView {
  equipmentId: number;
  code: string;
  name: string;
  product: string | null;
  cycleSeconds: number | null;
  occurredAt: string | null;
  availableAt: string | null;
  isDemo: boolean;
  status: EquipmentState | null;
}

interface ProductQualityRow {
  productId: number;
  product: string;
  inspections: number;
  defects: number;
  rate: number | null;
  focus: boolean;
}

type DetailPanel =
  | { kind: 'machine'; machine: MachineView }
  | { kind: 'quality'; quality: ProductQualityRow }
  | { kind: 'status'; label: '정상' | '휴식' | '고장' }
  | { kind: 'production' }
  | { kind: 'defect' };

// 도넛의 "정상" 구간은 가동 중(정상·주의) 설비를 함께 세는 그룹이다.
const statusGroupMachines = (rows: MachineView[], label: '정상' | '휴식' | '고장') =>
  label === '정상'
    ? rows.filter((machine) => machine.status === '정상' || machine.status === '주의')
    : rows.filter((machine) => machine.status === label);

const signed = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

const clockLabel = (value: string | null) => {
  if (!value) return NA;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return NA;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};

const countLabel = (value: number | null) => (value === null ? NA : value.toLocaleString());
const percentLabel = (value: number | null) => (value === null ? NA : `${value.toFixed(2)}%`);
const cycleLabel = (value: number | null) =>
  value === null ? NA : `${Number.isInteger(value) ? value : value.toFixed(1)}초`;

const shiftMonthStart = (value: string, months: number) => {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

// 저번 달 비교는 같은 날짜까지만 집계한다. 말일이 짧은 달은 말일로 맞춘다.
const previousMonthRange = (today: string) => {
  const [year, month, day] = today.split('-').map(Number);
  const from = shiftMonthStart(`${year}-${String(month).padStart(2, '0')}-01`, -1);
  const [prevYear, prevMonth] = from.split('-').map(Number);
  const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const to = `${from.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return { from, to };
};

const mondayOf = (today: string) => {
  const date = new Date(`${today}T00:00:00`);
  const offset = (date.getDay() + 6) % 7;
  return shiftDateISO(today, -offset);
};

const dateList = (from: string, to: string) => {
  const days: string[] = [];
  let cursor = from;
  for (let guard = 0; guard < 62 && cursor <= to; guard += 1) {
    days.push(cursor);
    cursor = shiftDateISO(cursor, 1);
  }
  return days;
};

const DONUT_RADIUS = 46;
const DONUT_STROKE = 24;
// 각 세그먼트의 시작을 0.5% 앞당겨 경계 이음새를 덮는다. 12시 방향의 마지막
// 경계는 첫 세그먼트가 뒤에서 받아쳐 고장색이 초록 시작 위로 겹쳐 보이지 않게 한다.
const DONUT_OVERLAP = 0.5;

// 네이티브 select는 펼쳐지는 목록을 꾸밀 수 없어 목록을 직접 그리는 드롭다운을 쓴다.
function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 목록이 아래쪽 채팅창을 가릴 만큼 길면 위로 펼친다. 채팅창이 없으면 화면 아래를 기준으로 한다.
  const openMenu = () => {
    const element = rootRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      const menuHeight = Math.min(options.length * 38 + 12, 300);
      const chat = document.querySelector('.rt-ask');
      const boundary = chat ? chat.getBoundingClientRect().top : window.innerHeight;
      const spaceBelow = boundary - rect.bottom;
      setDropUp(spaceBelow < menuHeight && rect.top > spaceBelow);
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div
      className={`rt-select${open ? ' open' : ''}`}
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="rt-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        {value}
        <ChevronDown size={16} className="rt-select-chevron" />
      </button>
      {open && (
        <ul
          className={`rt-select-menu${dropUp ? ' drop-up' : ''}`}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                className={option === value ? 'selected' : ''}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RealtimePage() {
  const navigate = useNavigate();
  const [machineFilter, setMachineFilter] = useState('전체 설비');
  const [productFilter, setProductFilter] = useState('전체 제품');
  const [trend, setTrend] = useState<'daily' | 'weekly'>('daily');
  const [panel, setPanel] = useState<DetailPanel | null>(null);
  const [question, setQuestion] = useState('');

  const handleAsk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) return;
    // 질문은 과거 대화 이력+검색 화면에서 대화로 쌓인다.
    navigate('/chat', { state: { question: question.trim() } });
  };

  const activate = (action: () => void) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: action,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    },
  });

  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const yesterday = shiftDateISO(today, -1);
  const previousMonth = previousMonthRange(today);
  const thisWeekStart = mondayOf(today);
  const lastWeekStart = shiftDateISO(thisWeekStart, -7);
  const lastWeekEnd = shiftDateISO(thisWeekStart, -1);
  const productionTrendStart =
    shiftDateISO(today, -8) < monthStart ? monthStart : shiftDateISO(today, -8);

  // 공정 현황은 5초 간격으로 다시 읽는다. 나머지 집계는 기간이 고정되어 한 번만 읽는다.
  const currentQuery = useApiQuery('realtime:current', () => fetchCurrentProcess(), {
    pollMs: 5000,
  });
  const equipmentQuery = useApiQuery('realtime:equipment', () => fetchEquipment());
  const productsQuery = useApiQuery('realtime:products', () => fetchProducts());
  const monthQuery = useApiQuery(`realtime:month:${monthStart}:${today}`, () =>
    fetchQualitySummary({ from: monthStart, to: today }),
  );
  const previousMonthQuery = useApiQuery(
    `realtime:previousMonth:${previousMonth.from}:${previousMonth.to}`,
    () => fetchQualitySummary(previousMonth),
  );
  const dailyQuery = useApiQuery(`realtime:daily:${yesterday}:${today}`, async () => {
    const [yesterdaySummary, todaySummary] = await Promise.all([
      fetchQualitySummary({ from: yesterday, to: yesterday }),
      fetchQualitySummary({ from: today, to: today }),
    ]);
    return { yesterday: yesterdaySummary, today: todaySummary };
  });
  const weeklyQuery = useApiQuery(`realtime:weekly:${lastWeekStart}:${today}`, async () => {
    const [lastWeekSummary, thisWeekSummary] = await Promise.all([
      fetchQualitySummary({ from: lastWeekStart, to: lastWeekEnd }),
      fetchQualitySummary({ from: thisWeekStart, to: today }),
    ]);
    return { lastWeek: lastWeekSummary, thisWeek: thisWeekSummary };
  });

  const productIds = (productsQuery.data ?? []).map((item) => item.product_id).join(',');
  const productQualityQuery = useApiQuery(
    `realtime:productQuality:${monthStart}:${today}:${productIds}`,
    async () => {
      const rows = await Promise.all(
        (productsQuery.data ?? []).map(async (product) => ({
          product,
          summary: await fetchQualitySummary({
            from: monthStart,
            to: today,
            productId: product.product_id,
          }),
        })),
      );
      return rows;
    },
    { enabled: productsQuery.data !== null },
  );

  const currentData = currentQuery.data;
  const equipmentData = equipmentQuery.data;

  // 설비 기준 정보에 현재 공정 값을 덮어 카드 목록을 만든다. 현재 값이 없으면
  // 설비명만 보이고 나머지는 '—'로 남는다.
  const machines = useMemo<MachineView[]>(() => {
    const items = new Map<number, CurrentProcessItem>(
      (currentData?.items ?? []).map((item) => [item.equipment_id, item]),
    );
    const rows: MachineView[] = (equipmentData ?? []).map((entry) => {
      const item = items.get(entry.equipment_id);
      if (item) items.delete(entry.equipment_id);
      return {
        equipmentId: entry.equipment_id,
        code: entry.equipment_code,
        name: entry.name,
        product: item?.product_name ?? null,
        cycleSeconds: item?.cycle_time_seconds ?? null,
        occurredAt: item?.occurred_at ?? null,
        availableAt: item?.available_at ?? null,
        isDemo: item?.is_demo ?? false,
        status: null,
      };
    });
    for (const item of items.values()) {
      rows.push({
        equipmentId: item.equipment_id,
        code: item.equipment_code,
        name: item.equipment_name,
        product: item.product_name,
        cycleSeconds: item.cycle_time_seconds,
        occurredAt: item.occurred_at,
        availableAt: item.available_at,
        isDemo: item.is_demo,
        status: null,
      });
    }
    return rows;
  }, [currentData, equipmentData]);

  const productRows: ProductQualityRow[] = (productQualityQuery.data ?? []).map(
    ({ product, summary }) => ({
      productId: product.product_id,
      product: product.name,
      inspections: summary.inspected_count,
      defects: summary.defect_count,
      rate: summary.defect_rate,
      focus: summary.defect_rate !== null && summary.defect_rate > INSPECTION_THRESHOLD,
    }),
  );

  const monthSummary = monthQuery.data;
  const monthCount = monthSummary?.production_record_count ?? null;
  const monthInspections = monthSummary?.inspected_count ?? null;
  const monthDefects = monthSummary?.defect_count ?? null;
  const monthRate = monthSummary?.defect_rate ?? null;
  const previousMonthCount = previousMonthQuery.data?.production_record_count ?? null;
  const productionDelta =
    monthCount !== null && previousMonthCount !== null && previousMonthCount > 0
      ? ((monthCount - previousMonthCount) / previousMonthCount) * 100
      : null;

  const todaySummary = dailyQuery.data?.today ?? null;
  const yesterdaySummary = dailyQuery.data?.yesterday ?? null;
  const todayRate = todaySummary?.defect_rate ?? null;
  const yesterdayRate = yesterdaySummary?.defect_rate ?? null;
  const defectDelta =
    todayRate !== null && yesterdayRate !== null ? todayRate - yesterdayRate : null;

  const thisWeekSummary = weeklyQuery.data?.thisWeek ?? null;
  const lastWeekSummary = weeklyQuery.data?.lastWeek ?? null;
  const weeklyRate = thisWeekSummary?.defect_rate ?? null;

  const trendBars: { label: string; value: number | null; current: boolean }[] =
    trend === 'daily'
      ? [
          {
            label: '어제',
            value: yesterdaySummary?.production_record_count ?? null,
            current: false,
          },
          { label: '오늘', value: todaySummary?.production_record_count ?? null, current: true },
        ]
      : [
          {
            label: '지난주',
            value: lastWeekSummary?.production_record_count ?? null,
            current: false,
          },
          {
            label: '이번주',
            value: thisWeekSummary?.production_record_count ?? null,
            current: true,
          },
        ];
  const trendBarMax = Math.max(1, ...trendBars.map((bar) => bar.value ?? 0));

  const productOptions = useMemo(() => {
    const names = new Set<string>();
    for (const machine of machines) {
      if (machine.product) names.add(machine.product);
    }
    return ['전체 제품', ...names];
  }, [machines]);

  const filteredMachines = machines.filter(
    (machine) =>
      (machineFilter === '전체 설비' || machine.name === machineFilter) &&
      (productFilter === '전체 제품' || machine.product === productFilter),
  );

  const machinesError = equipmentQuery.error ?? currentQuery.error;
  const qualityError = productsQuery.error ?? productQualityQuery.error;

  // 설비 상태는 공정 API에 없어 집계할 수 없다. 값이 없을 때 0%로 단정하지 않는다.
  const statusCounts: Record<EquipmentState, number | null> = {
    정상: null,
    주의: null,
    휴식: null,
    고장: null,
  };
  const operatingRate: number | null = null;
  const statusTotal = machines.length;

  const donutSegments: {
    label: '정상' | '휴식' | '고장';
    count: number | null;
    color: string;
  }[] = [
    { label: '정상', count: statusCounts.정상, color: '#61E2A6' },
    { label: '휴식', count: statusCounts.휴식, color: '#A9AAB5' },
    { label: '고장', count: statusCounts.고장, color: '#D95F70' },
  ];
  let donutOffset = 0;
  const donutCircles = donutSegments.map((segment) => {
    const length =
      segment.count === null || statusTotal === 0 ? 0 : (segment.count / statusTotal) * 100;
    const circle = { ...segment, length, offset: donutOffset };
    donutOffset += length;
    return circle;
  });

  const productionTrendQuery = useApiQuery(
    `realtime:productionTrend:${productionTrendStart}:${today}`,
    async () => {
      const days = dateList(productionTrendStart, today);
      const summaries = await Promise.all(
        days.map((day) => fetchQualitySummary({ from: day, to: day })),
      );
      let total = 0;
      return summaries.map((summary, index) => {
        total += summary.production_record_count;
        return { label: days[index].slice(5).replace('-', '.'), value: total };
      });
    },
    { enabled: panel?.kind === 'production' && (monthCount ?? 0) > 0 },
  );

  const defectTrendQuery = useApiQuery(
    `realtime:defectTrend:${thisWeekStart}:${today}`,
    async () => {
      const days = dateList(thisWeekStart, today);
      const summaries = await Promise.all(
        days.map((day) => fetchQualitySummary({ from: day, to: day })),
      );
      return summaries.flatMap((summary, index) =>
        summary.defect_rate === null
          ? []
          : [{ label: days[index].slice(5).replace('-', '.'), value: summary.defect_rate }],
      );
    },
    { enabled: panel?.kind === 'defect' && (thisWeekSummary?.inspected_count ?? 0) > 0 },
  );

  const machineDetail = panel?.kind === 'machine' ? panel.machine : null;
  const statusPanel = panel?.kind === 'status' ? panel : null;
  const statusPanelMachines = statusPanel ? statusGroupMachines(machines, statusPanel.label) : [];
  const qualityPanel = panel?.kind === 'quality' ? panel.quality : null;
  const qualityRate = qualityPanel?.rate ?? null;
  const qualityScaleMax = Math.max(
    5,
    Math.ceil(Math.max(0, ...productRows.map((row) => row.rate ?? 0))),
  );
  const qualityShare =
    qualityPanel && monthDefects !== null && monthDefects > 0
      ? Math.round((qualityPanel.defects / monthDefects) * 100)
      : null;

  const productionTrendPoints = productionTrendQuery.data ?? [];
  const defectTrendPoints = defectTrendQuery.data ?? [];
  const todayCount = todaySummary?.production_record_count ?? null;
  const thisWeekCount = thisWeekSummary?.production_record_count ?? null;

  // 설비가 많아질 때를 대비해 목록을 좌우 스크롤 밴드로 전환한다.
  const bandRef = useRef<HTMLDivElement>(null);
  const bandDragRef = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(
    null,
  );
  const suppressBandClickRef = useRef(false);
  const [bandDragging, setBandDragging] = useState(false);
  const [bandEdges, setBandEdges] = useState({ scrollable: false, start: true, end: true });

  const syncBand = useCallback(() => {
    const el = bandRef.current;
    if (!el) return;
    setBandEdges({
      scrollable: el.scrollWidth > el.clientWidth + 1,
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    syncBand();
    window.addEventListener('resize', syncBand);
    return () => window.removeEventListener('resize', syncBand);
  }, [syncBand, filteredMachines.length]);

  const scrollBand = (direction: number) => {
    const el = bandRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const startBandDrag = (event: PointerEvent<HTMLDivElement>) => {
    suppressBandClickRef.current = false;
    if (event.pointerType !== 'mouse' || event.button !== 0 || !bandEdges.scrollable) return;
    bandDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
    };
  };

  const moveBandDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = bandDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startX;
    // 작은 손떨림은 카드 클릭으로 처리한다.
    if (!suppressBandClickRef.current && Math.abs(distance) < 5) return;
    event.preventDefault();
    if (!suppressBandClickRef.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressBandClickRef.current = true;
      setBandDragging(true);
      // React 렌더링 전에도 스냅을 해제해 첫 드래그부터 이동량을 그대로 반영한다.
      event.currentTarget.style.scrollSnapType = 'none';
    }
    event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  };

  const endBandDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (bandDragRef.current?.pointerId !== event.pointerId) return;
    bandDragRef.current = null;
    setBandDragging(false);
    event.currentTarget.style.removeProperty('scroll-snap-type');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    syncBand();
  };

  return (
    <>
      <h1 className="sr-only">실시간 공정</h1>
      <p className="rt-note">
        {currentQuery.error
          ? '공정 데이터를 불러오지 못했어요.'
          : currentQuery.loading && !currentData
            ? '공정 데이터를 불러오는 중이에요.'
            : `데이터 기준 ${formatDateTime(currentData?.data_time ?? '')} · 마지막 갱신 ${formatDateTime(
                currentData?.queried_at ?? '',
              )}`}
        <span>{replayNotices[currentData?.replay_state ?? 'none']}</span>
      </p>

      <div className="rt-summary">
        <article
          className="card rt-kpi rt-clickable"
          aria-label="월 전체 생산량 상세 보기"
          {...activate(() => setPanel({ kind: 'production' }))}
        >
          <div className="card-heading">
            <h2>월 전체 생산량</h2>
            <SegmentedControl
              label="생산 비교 기간 전환"
              value={trend}
              options={[
                { value: 'daily', label: '오늘' },
                { value: 'weekly', label: '이번주' },
              ]}
              onChange={setTrend}
            />
          </div>
          {monthQuery.error && !monthSummary ? (
            <ApiErrorState error={monthQuery.error} onRetry={monthQuery.reload} compact />
          ) : (
            <>
              <div className="kpi-value">
                {countLabel(monthCount)}
                <span>건</span>
                {productionDelta === null ? (
                  <span className="pill pill-neutral">저번 달 대비 {NA}</span>
                ) : (
                  <span className={`pill ${productionDelta >= 0 ? 'pill-green' : 'pill-red'}`}>
                    {productionDelta >= 0 ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    )}
                    저번 달 대비 {signed(productionDelta)}%
                  </span>
                )}
              </div>
              <div className="rt-bars">
                {trendBars.map((bar) => (
                  <div className="rt-bar-row" key={bar.label}>
                    <span>{bar.label}</span>
                    <div className="rt-bar">
                      <span
                        className={bar.current ? 'rt-bar-current' : 'rt-bar-previous'}
                        style={{
                          width: `${bar.value === null ? 0 : (bar.value / trendBarMax) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{bar.value === null ? NA : `${bar.value.toLocaleString()}건`}</strong>
                  </div>
                ))}
              </div>
              <div className="kpi-bottom">
                <span>이번 달 목표 {NA}</span>
                <span>현재까지 {countLabel(monthCount)}건</span>
              </div>
              <div className="mini-progress">
                <span style={{ width: '0%' }} />
              </div>
            </>
          )}
          <p className="rt-note">생산 수량이 아니라 생산 기록 건수예요. 목표는 API 미제공입니다.</p>
        </article>

        <article className="card rt-donut-card">
          <div className="card-heading">
            <h2>설비 가동률</h2>
          </div>
          {equipmentQuery.error && !equipmentData ? (
            <ApiErrorState error={equipmentQuery.error} onRetry={equipmentQuery.reload} compact />
          ) : (
            <>
              <div className="rt-donut-body">
                <div className="rt-donut">
                  <svg
                    viewBox="0 0 120 120"
                    role="img"
                    aria-label={`가동률 ${operatingRate === null ? NA : `${operatingRate}%`}`}
                  >
                    {donutCircles.map((circle) =>
                      circle.length === 0 ? null : (
                        <circle
                          key={circle.label}
                          cx="60"
                          cy="60"
                          r={DONUT_RADIUS}
                          fill="none"
                          stroke={circle.color}
                          strokeWidth={DONUT_STROKE}
                          pathLength={100}
                          strokeDasharray={`${circle.length + DONUT_OVERLAP} ${
                            100 - circle.length - DONUT_OVERLAP
                          }`}
                          strokeDashoffset={DONUT_OVERLAP - circle.offset}
                          transform="rotate(-90 60 60)"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setPanel({ kind: 'status', label: circle.label })}
                        />
                      ),
                    )}
                    <circle
                      className="rt-donut-reveal"
                      cx="60"
                      cy="60"
                      r={DONUT_RADIUS}
                      fill="none"
                      stroke="var(--surface)"
                      strokeWidth={DONUT_STROKE + 2}
                      pathLength={100}
                      strokeDasharray="100 100"
                      pointerEvents="none"
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="rt-donut-center">
                    <strong>{operatingRate === null ? NA : `${operatingRate}%`}</strong>
                    <span>가동률</span>
                  </div>
                </div>
                <ul className="rt-legend">
                  {donutCircles.map((circle) => (
                    <li key={circle.label}>
                      <button
                        type="button"
                        onClick={() => setPanel({ kind: 'status', label: circle.label })}
                      >
                        <i style={{ background: circle.color }} />
                        {circle.label} {circle.count === null ? NA : `${circle.count}대`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="rt-note">설비 상태·가동률은 API 미제공이에요.</p>
            </>
          )}
        </article>

        <article
          className="card rt-defect-card rt-clickable"
          aria-label="검사 불량률 상세 보기"
          {...activate(() => setPanel({ kind: 'defect' }))}
        >
          <div className="card-heading">
            <h2>검사 불량률</h2>
          </div>
          {dailyQuery.error && !dailyQuery.data ? (
            <ApiErrorState error={dailyQuery.error} onRetry={dailyQuery.reload} compact />
          ) : (
            <>
              <div className="kpi-value">
                {todayRate === null ? NA : todayRate.toFixed(2)}
                <span>%</span>
                {defectDelta === null ? (
                  <span className="pill pill-neutral">어제 대비 {NA}</span>
                ) : (
                  <span className={`pill ${defectDelta <= 0 ? 'pill-green' : 'pill-red'}`}>
                    {defectDelta <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                    어제 대비 {signed(defectDelta, 2)}%p
                  </span>
                )}
              </div>
              <div className="rt-bars">
                <div className="rt-bar-row">
                  <span>어제</span>
                  <div className="rt-bar">
                    <span className="rt-bar-previous" style={{ width: '100%' }} />
                  </div>
                  <strong>{yesterdayRate === null ? NA : `${yesterdayRate.toFixed(2)}%`}</strong>
                </div>
                <div className="rt-bar-row">
                  <span>오늘</span>
                  <div className="rt-bar">
                    <span
                      className="rt-bar-current"
                      style={{
                        width: `${
                          todayRate === null || yesterdayRate === null || yesterdayRate <= 0
                            ? 0
                            : (todayRate / yesterdayRate) * 100
                        }%`,
                      }}
                    />
                  </div>
                  <strong>{todayRate === null ? NA : `${todayRate.toFixed(2)}%`}</strong>
                </div>
              </div>
            </>
          )}
        </article>
      </div>

      <section className="card rt-quality">
        <div className="card-heading">
          <h2>제품별 품질 현황</h2>
        </div>
        {qualityError && !productQualityQuery.data ? (
          <ApiErrorState
            error={qualityError}
            onRetry={() => {
              productsQuery.reload();
              productQualityQuery.reload();
            }}
            compact
          />
        ) : (
          <table className="rt-table">
            <thead>
              <tr>
                <th scope="col">제품</th>
                <th scope="col">검사 기록수</th>
                <th scope="col">불량 수</th>
                <th scope="col">불량 비율</th>
              </tr>
            </thead>
            <tbody>
              {productsQuery.loading || productQualityQuery.loading ? (
                <tr>
                  <td colSpan={4}>
                    <LoadingState label="제품 품질을 불러오는 중이에요" compact />
                  </td>
                </tr>
              ) : productRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>등록된 제품이 없어요.</td>
                </tr>
              ) : (
                productRows.map((quality) => (
                  <tr
                    key={quality.productId}
                    className={quality.focus ? 'focus-row' : ''}
                    aria-label={`${quality.product} 품질 상세 보기`}
                    {...activate(() => setPanel({ kind: 'quality', quality }))}
                  >
                    <td>
                      <strong>{quality.product}</strong>
                      {quality.focus && <span className="pill pill-red">우선 확인</span>}
                    </td>
                    <td>{quality.inspections.toLocaleString()}</td>
                    <td>{quality.defects}</td>
                    <td>
                      <strong>{quality.rate === null ? NA : `${quality.rate.toFixed(1)}%`}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td>전체</td>
                <td>{countLabel(monthInspections)}</td>
                <td>{countLabel(monthDefects)}</td>
                <td>{percentLabel(monthRate)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="rt-note">
          이번 달 검사 기록 {countLabel(monthInspections)}건 중 불량 {countLabel(monthDefects)}
          건이에요. 우선 확인 품목은 점검 기준 {INSPECTION_THRESHOLD}%를 넘은 품목이에요.
          <span>중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.</span>
        </p>
      </section>

      <section className="rt-filters" aria-label="조회 필터">
        <FilterDropdown
          label="설비 필터"
          value={machineFilter}
          options={['전체 설비', ...machines.map((machine) => machine.name)]}
          onChange={setMachineFilter}
        />
        <FilterDropdown
          label="제품 필터"
          value={productFilter}
          options={productOptions}
          onChange={setProductFilter}
        />
      </section>

      <section className="rt-machines" aria-label="설비 상태">
        <div className="section-top">
          <h2>
            설비 상태{' '}
            <span className="pill pill-neutral">
              {equipmentData === null ? NA : filteredMachines.length}대
            </span>
          </h2>
          <span className="muted">카드를 누르면 상세 정보가 열려요</span>
        </div>
        {machinesError ? (
          <ApiErrorState
            error={machinesError}
            onRetry={() => {
              currentQuery.reload();
              equipmentQuery.reload();
            }}
            compact
          />
        ) : equipmentQuery.loading && equipmentData === null ? (
          <LoadingState label="설비 정보를 불러오는 중이에요" compact />
        ) : filteredMachines.length === 0 ? (
          <div className="card rt-empty">
            <p>
              {machines.length === 0
                ? '등록된 설비가 없어요.'
                : '조건에 맞는 설비가 없어요. 필터를 바꿔 보세요.'}
            </p>
          </div>
        ) : (
          <div className="rt-band">
            <div
              className={`rt-card-grid${bandEdges.scrollable ? ' is-scrollable' : ''}${bandDragging ? ' is-dragging' : ''}`}
              ref={bandRef}
              onScroll={syncBand}
              onPointerDown={startBandDrag}
              onPointerMove={moveBandDrag}
              onPointerUp={endBandDrag}
              onPointerCancel={endBandDrag}
              onLostPointerCapture={endBandDrag}
              onPointerLeave={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) endBandDrag(event);
              }}
              onDragStart={(event) => event.preventDefault()}
              onClickCapture={(event) => {
                if (suppressBandClickRef.current && event.detail > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressBandClickRef.current = false;
                }
              }}
            >
              {filteredMachines.map((machine) => (
                <article
                  key={machine.equipmentId}
                  className={`rt-machine${
                    machine.status === '주의'
                      ? ' rt-machine-warn'
                      : machine.status === '고장'
                        ? ' rt-machine-broken'
                        : ''
                  }`}
                >
                  <button
                    onClick={() => setPanel({ kind: 'machine', machine })}
                    aria-label={`${machine.name} 상세 보기`}
                  >
                    <div className="rt-machine-top">
                      <strong>{machine.name}</strong>
                      <span
                        className={`pill ${machine.status ? statePill[machine.status] : 'pill-neutral'}`}
                      >
                        {machine.status ?? NA}
                      </span>
                    </div>
                    <span className="rt-product">
                      {machine.product ?? NA}
                      {machine.isDemo && <span className="pill pill-neutral">시연</span>}
                    </span>
                    <div className="mini-progress">
                      <span style={{ width: '0%' }} />
                    </div>
                    <div className="rt-machine-meta">
                      <span>
                        {NA} / {NA}개
                      </span>
                      <span>사이클 {cycleLabel(machine.cycleSeconds)}</span>
                    </div>
                    <div className="rt-machine-meta">
                      <span>발생 {clockLabel(machine.occurredAt)}</span>
                      <span>반영 {clockLabel(machine.availableAt)}</span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
            {bandEdges.scrollable && (
              <div className="rt-band-controls" role="group" aria-label="설비 목록 이동">
                <button
                  type="button"
                  className="rt-band-nav"
                  aria-label="이전 설비 보기"
                  disabled={bandEdges.start}
                  onClick={() => scrollBand(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="rt-band-nav"
                  aria-label="다음 설비 보기"
                  disabled={bandEdges.end}
                  onClick={() => scrollBand(1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card rt-events" aria-label="최근 실시간 기록">
        <div className="card-heading">
          <div>
            <h2>최근 실시간 기록</h2>
            <p>실시간 기록은 현재 API로 제공되지 않아요.</p>
          </div>
        </div>
        <p className="rt-empty">이벤트 로그는 API 미제공이에요.</p>
      </section>

      <section className="card rt-ask" aria-label="사출반장 질문">
        <div className="rt-ask-greeting">
          <span className="avatar">민</span>
          <p>
            <strong>사출반장</strong>
            안녕하세요 민규님! 공정 현황에 대해 궁금한 점이 있으신가요?
          </p>
        </div>
        <form className="rt-ask-form" onSubmit={handleAsk}>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="오늘 생산량은 얼마나 됐어?"
            aria-label="사출반장에게 질문"
          />
          <button className="button button-primary" type="submit">
            보내기
          </button>
        </form>
      </section>

      {machineDetail && (
        <Modal title={`${machineDetail.name} 상세`} wide plain onClose={() => setPanel(null)}>
          <section className="metric-summary" aria-label={`${machineDetail.name} 요약`}>
            <p className="metric-eyebrow">{machineDetail.product ?? NA} · 작업 진행률</p>
            <div className="metric-value">
              <strong>{NA}</strong>
              <span className="metric-unit">%</span>
              <span
                className={`pill ${machineDetail.status ? statePill[machineDetail.status] : 'pill-neutral'}`}
              >
                {machineDetail.status ?? NA}
              </span>
            </div>
            <p className="metric-sub">
              오늘 생산 기록은 API 미제공이에요
              {machineDetail.cycleSeconds !== null
                ? ` · 사이클 ${cycleLabel(machineDetail.cycleSeconds)}`
                : ''}
            </p>
          </section>
          <div
            className="metric-progress"
            role="progressbar"
            aria-valuenow={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext="API 미제공"
            aria-label="작업 진행률"
          >
            <span
              style={{
                width: '0%',
                background: machineDetail.status ? stateColor[machineDetail.status] : '#A9AAB5',
              }}
            />
          </div>
          {machineDetail.status === '고장' && (
            <p className="metric-state-note is-alert">
              가동이 멈춘 상태예요. 최근 기록과 점검 이력을 확인해 주세요.
            </p>
          )}
          {machineDetail.status === '휴식' && (
            <p className="metric-state-note">현재 가동하지 않는 설비예요.</p>
          )}
          <dl className="metric-stats">
            <div>
              <dt>오늘 생산</dt>
              <dd>{NA}</dd>
            </div>
            <div>
              <dt>사이클 타임</dt>
              <dd>{cycleLabel(machineDetail.cycleSeconds)}</dd>
            </div>
            <div>
              <dt>마지막 점검</dt>
              <dd>{NA}</dd>
            </div>
          </dl>
          <section className="metric-section" aria-label="최근 실시간 기록">
            <div className="metric-section-head">
              <h3>최근 실시간 기록</h3>
            </div>
            <p className="metric-empty">실시간 기록은 API 미제공이에요.</p>
          </section>
          <p className="metric-basis">
            발생 {formatDateTime(machineDetail.occurredAt ?? '')} · 반영{' '}
            {formatDateTime(machineDetail.availableAt ?? '')} ·{' '}
            {machineDetail.isDemo ? '시연 데이터' : '실데이터'}
            <br />
            설비 상태·생산량·점검 기록은 API 미제공입니다.
          </p>
          <button
            type="button"
            className="metric-link"
            onClick={() => {
              setPanel(null);
              navigate(
                machineDetail.product
                  ? `/records?product=${encodeURIComponent(machineDetail.product)}`
                  : '/records',
              );
            }}
          >
            같은 제품 생산·검사 이력 보기
            <ArrowUpRight size={14} />
          </button>
        </Modal>
      )}

      {qualityPanel && (
        <Modal
          title={`${qualityPanel.product} 품질 상세`}
          wide
          plain
          onClose={() => setPanel(null)}
        >
          <section className="metric-summary" aria-label={`${qualityPanel.product} 품질 요약`}>
            <p className="metric-eyebrow">라벨 검사 기준</p>
            <div className="metric-value">
              <strong>{qualityRate === null ? NA : qualityRate.toFixed(2)}</strong>
              <span className="metric-unit">%</span>
              <span
                className={`pill ${
                  qualityRate === null
                    ? 'pill-neutral'
                    : qualityRate > INSPECTION_THRESHOLD
                      ? 'pill-red'
                      : 'pill-green'
                }`}
              >
                {qualityRate === null
                  ? '기록 없음'
                  : qualityRate > INSPECTION_THRESHOLD
                    ? '우선 확인'
                    : '기준 이하'}
              </span>
            </div>
            <p className="metric-sub">
              전체 불량 {countLabel(monthDefects)}건 중 {qualityPanel.defects}건
            </p>
          </section>
          <section className="metric-section" aria-label="점검 기준 대비">
            <div className="metric-section-head">
              <h3>점검 기준 대비</h3>
              <span className="metric-ref">
                <i />
                점검 기준 {INSPECTION_THRESHOLD}%
              </span>
            </div>
            <div
              className="metric-gauge"
              role="img"
              aria-label={`검사 불량률 ${
                qualityRate === null ? NA : `${qualityRate.toFixed(2)}%`
              }, 점검 기준 ${INSPECTION_THRESHOLD}%`}
            >
              <span
                className="metric-gauge-fill"
                style={{
                  width: `${qualityRate === null ? 0 : (qualityRate / qualityScaleMax) * 100}%`,
                  background:
                    qualityRate !== null && qualityRate > INSPECTION_THRESHOLD
                      ? '#F2BB69'
                      : '#61E2A6',
                }}
              />
              <span
                className="metric-gauge-mark"
                style={{ left: `${(INSPECTION_THRESHOLD / qualityScaleMax) * 100}%` }}
              />
            </div>
            <p className="metric-gauge-note">
              {qualityRate === null
                ? `${NA} (검사 기록 없음)`
                : `기준보다 ${signed(qualityRate - INSPECTION_THRESHOLD, 2)}%p`}
            </p>
          </section>
          <dl className="metric-stats">
            <div>
              <dt>검사 기록수</dt>
              <dd>{qualityPanel.inspections.toLocaleString()}건</dd>
            </div>
            <div>
              <dt>불량 수</dt>
              <dd>{qualityPanel.defects.toLocaleString()}건</dd>
            </div>
            <div>
              <dt>전체 불량 비중</dt>
              <dd>{qualityShare === null ? NA : `${qualityShare}%`}</dd>
            </div>
          </dl>
          <p className="metric-basis">
            중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.
            {qualityPanel.focus
              ? ` ${qualityPanel.product}의 검사 불량률이 점검 기준 ${INSPECTION_THRESHOLD}%를 넘었어요.`
              : ''}
          </p>
          <button
            type="button"
            className="metric-link"
            onClick={() => {
              setPanel(null);
              navigate(`/records?product=${encodeURIComponent(qualityPanel.product)}`);
            }}
          >
            같은 제품 생산·검사 이력 보기
            <ArrowUpRight size={14} />
          </button>
        </Modal>
      )}

      {statusPanel && (
        <Modal
          title={`${statusPanel.label === '정상' ? '가동 중' : statusPanel.label} 설비 ${NA}`}
          wide
          plain
          onClose={() => setPanel(null)}
        >
          <section className="metric-summary" aria-label="설비 상태 요약">
            <p className="metric-eyebrow">
              전체 {statusTotal}대 중 {NA}대 · {NA}%
            </p>
            <div className="metric-value">
              <strong>{NA}</strong>
              <span className="metric-unit">대</span>
              <span
                className={`pill ${
                  statusPanel.label === '정상' ? 'pill-green' : statePill[statusPanel.label]
                }`}
              >
                {statusPanel.label === '정상' ? '가동 중' : statusPanel.label}
              </span>
            </div>
            <p className="metric-sub">
              {statusPanel.label === '정상'
                ? `정상 ${NA}대와 주의 ${NA}대를 함께 표시합니다.`
                : statusPanel.label === '휴식'
                  ? '현재 가동하지 않는 설비입니다.'
                  : '최근 기록과 점검 이력을 확인해 주세요.'}
            </p>
          </section>
          <div
            className="state-composition"
            role="img"
            aria-label={`전체 설비 구성: ${stateOrder
              .map((state) => `${state} ${statusCounts[state] ?? NA}대`)
              .join(', ')}`}
          >
            {stateOrder.map((state) => (
              <span
                key={state}
                style={{
                  width: `${
                    statusCounts[state] === null || statusTotal === 0
                      ? 0
                      : (statusCounts[state] / statusTotal) * 100
                  }%`,
                  background: stateColor[state],
                }}
                title={`${state} ${statusCounts[state] ?? NA}대`}
              />
            ))}
          </div>
          <ul className="state-legend">
            {stateOrder.map((state) => (
              <li key={state}>
                <i style={{ background: stateColor[state] }} />
                {state} {statusCounts[state] ?? NA}대
              </li>
            ))}
          </ul>
          <section className="metric-section" aria-label="설비 목록">
            <div className="metric-section-head">
              <h3>설비 목록</h3>
              <span className="metric-ref">{NA}대</span>
            </div>
            {statusPanelMachines.length === 0 ? (
              <p className="metric-empty">
                설비 상태 정보가 API 미제공이라 목록을 표시할 수 없어요.
              </p>
            ) : (
              <ul className="metric-machine-list">
                {statusPanelMachines.map((machine) => (
                  <li key={machine.equipmentId}>
                    <button
                      type="button"
                      aria-label={`${machine.name} 상세 보기`}
                      onClick={() => setPanel({ kind: 'machine', machine })}
                    >
                      <span className="metric-machine-name">
                        {machine.name}
                        <small>{machine.product ?? NA}</small>
                      </span>
                      <span
                        className={`pill ${machine.status ? statePill[machine.status] : 'pill-neutral'}`}
                      >
                        {machine.status ?? NA}
                      </span>
                      <span className="metric-machine-progress">{NA}</span>
                      <ChevronRight size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="metric-basis">설비 상태와 진행률은 API 미제공입니다.</p>
        </Modal>
      )}

      {panel?.kind === 'production' && (
        <Modal title="월 전체 생산량 상세" wide plain onClose={() => setPanel(null)}>
          <section className="metric-summary" aria-label="이번 달 생산 요약">
            <p className="metric-eyebrow">이번 달 누계</p>
            <div className="metric-value">
              <strong>{countLabel(monthCount)}</strong>
              <span className="metric-unit">건</span>
              {productionDelta === null ? (
                <span className="pill pill-neutral">저번 달 대비 {NA}</span>
              ) : (
                <span className={`pill ${productionDelta >= 0 ? 'pill-green' : 'pill-red'}`}>
                  {productionDelta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  저번 달 대비 {signed(productionDelta)}%
                </span>
              )}
            </div>
            <p className="metric-sub">
              목표 {NA} · 이번 달 생산 기록 {countLabel(monthCount)}건
            </p>
          </section>
          {productionTrendQuery.loading ? (
            <LoadingState label="일별 생산 기록을 불러오는 중이에요" compact />
          ) : (
            <MetricTrendChart
              title="이번 달 누계 추이"
              points={productionTrendPoints}
              reference={{ value: 0, label: '목표 API 미제공' }}
              seriesLabel="누계"
              formatValue={(value) => `${value.toLocaleString()}건`}
            />
          )}
          <dl className="metric-stats">
            <div>
              <dt>오늘 생산</dt>
              <dd>{countLabel(todayCount)}건</dd>
            </div>
            <div>
              <dt>이번 주</dt>
              <dd>{countLabel(thisWeekCount)}건</dd>
            </div>
            <div>
              <dt>저번 달</dt>
              <dd>{countLabel(previousMonthCount)}건</dd>
            </div>
          </dl>
          <p className="metric-basis">
            이번 달 누계는 일별 생산 기록 건수를 합산했습니다. 생산 수량과 목표는 API 미제공입니다.
          </p>
          <button
            type="button"
            className="metric-link"
            onClick={() => {
              setPanel(null);
              navigate('/records');
            }}
          >
            생산·검사 이력에서 보기
            <ArrowUpRight size={14} />
          </button>
        </Modal>
      )}

      {panel?.kind === 'defect' && (
        <Modal title="검사 불량률 상세" wide plain onClose={() => setPanel(null)}>
          <section className="metric-summary" aria-label="검사 불량률 요약">
            <p className="metric-eyebrow">이번주 · 라벨 검사 기준</p>
            <div className="metric-value">
              <strong>{weeklyRate === null ? NA : weeklyRate.toFixed(2)}</strong>
              <span className="metric-unit">%</span>
              {defectDelta === null ? (
                <span className="pill pill-neutral">어제 대비 {NA}</span>
              ) : (
                <span className={`pill ${defectDelta <= 0 ? 'pill-green' : 'pill-red'}`}>
                  {defectDelta <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
                  어제 대비 {signed(defectDelta, 2)}%p
                </span>
              )}
            </div>
            <p className="metric-sub">점검 기준 {INSPECTION_THRESHOLD}% 이하</p>
          </section>
          {defectTrendQuery.loading ? (
            <LoadingState label="일별 불량률을 불러오는 중이에요" compact />
          ) : (
            <MetricTrendChart
              title="이번주 검사 불량률"
              points={defectTrendPoints}
              reference={{
                value: INSPECTION_THRESHOLD,
                label: `점검 기준 ${INSPECTION_THRESHOLD}%`,
              }}
              seriesLabel="불량률"
              formatValue={(value) => `${value}%`}
            />
          )}
          <dl className="metric-stats">
            <div>
              <dt>검사 기록수</dt>
              <dd>
                {thisWeekSummary === null
                  ? NA
                  : `${thisWeekSummary.inspected_count.toLocaleString()}건`}
              </dd>
            </div>
            <div>
              <dt>불량 수</dt>
              <dd>
                {thisWeekSummary === null
                  ? NA
                  : `${thisWeekSummary.defect_count.toLocaleString()}건`}
              </dd>
            </div>
            <div>
              <dt>점검 기준</dt>
              <dd>{INSPECTION_THRESHOLD}%</dd>
            </div>
          </dl>
          <p className="metric-basis">중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.</p>
          <button
            type="button"
            className="metric-link"
            onClick={() => {
              setPanel(null);
              navigate('/quality-reports');
            }}
          >
            품질 리포트에서 보기
            <ArrowUpRight size={14} />
          </button>
        </Modal>
      )}
    </>
  );
}
