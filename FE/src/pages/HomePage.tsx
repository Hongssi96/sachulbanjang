import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Factory,
  FileText,
  Gauge,
  Layers3,
  Lightbulb,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { confirmHandoverNote, createHandoverNote, fetchHandoverNotes } from '../api/handover';
import type { HandoverNote } from '../api/handover';
import { fetchCurrentProcess } from '../api/process';
import { fetchQualitySummary } from '../api/quality';
import { fetchProcessRecords } from '../api/records';
import type { ProcessRecord } from '../api/records';
import { fetchReport, fetchReports } from '../api/reports';
import type { ReportCategory, ReportStatus } from '../api/reports';
import { fetchSchedules } from '../api/schedules';
import type { ScheduleCategory, ScheduleItem } from '../api/schedules';
import ApiErrorState from '../components/ApiErrorState';
import LoadingState from '../components/LoadingState';
import Modal from '../components/Modal';
import MissingValue from '../components/MissingValue';
import ReportMarkdown from '../components/ReportMarkdown';
import SegmentedControl from '../components/SegmentedControl';
import { useApiQuery } from '../hooks/useApiQuery';
import { usePageEntryReady } from '../components/PageEntry/PageEntryContext';
import HomeSectionSkeleton from './HomePage/HomeSectionSkeleton';
import { useAuth } from '../hooks/useAuth';
import { useWorkSession } from '../hooks/useWorkSession';
import { formatDate, formatDateTime, shiftDateISO, todayISO } from '../utils/dateFormat';

type Overlay =
  | { kind: 'report'; reportId: number }
  | { kind: 'schedule'; day: number }
  | { kind: 'note' }
  | { kind: 'equipment' }
  | { kind: 'insight' }
  | null;

type Kind = '점검' | '납품' | '회의';

interface EventView {
  id: number;
  title: string;
  kind: Kind;
  allDay: boolean;
  time: string;
  minutes: number;
  year: number;
  month: number;
  day: number;
}

interface ChartPoint {
  label: string;
  value: number;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const RECENT_DAYS = 9;
const INSIGHT_DAYS = 30;
const NOTE_PAGE_SIZE = 5;
const kindPill: Record<Kind, string> = {
  점검: 'pill-amber',
  납품: 'pill-green',
  회의: 'pill-violet',
};
const kindColor: Record<Kind, string> = {
  점검: '#F2BB69',
  납품: '#61E2A6',
  회의: '#635B85',
};
const reportStatusLabel: Record<ReportStatus, '대기' | '진행 중' | '완료'> = {
  pending: '대기',
  in_progress: '진행 중',
  completed: '완료',
};
const reportStatusPill: Record<ReportStatus, string> = {
  pending: 'pill-amber',
  in_progress: 'pill-violet',
  completed: 'pill-green',
};
const reportCategoryLabel: Record<ReportCategory, string> = {
  equipment_issue: '설비 이상',
  quality_report: '품질 보고',
  inspection_done: '점검 완료',
  periodic_weekly: '주간 보고',
  periodic_monthly: '월간 보고',
  other: '기타',
};

const pad2 = (value: number) => String(value).padStart(2, '0');

/** ISO 시각을 Asia/Seoul 기준 연·월·일·시·분으로 나눈다. */
function seoulParts(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string) => {
    const found = parts.find((item) => item.type === type);
    return found ? Number(found.value) : Number.NaN;
  };
  const year = read('year');
  const month = read('month') - 1;
  const day = read('day');
  const hour = read('hour');
  const minute = read('minute');
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute, minutes: hour * 60 + minute };
}

function seoulDayKey(value: string): string {
  const parts = seoulParts(value);
  return parts ? `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}` : '';
}

function formatClock(value: string): string {
  const parts = seoulParts(value);
  return parts ? `${pad2(parts.hour)}:${pad2(parts.minute)}` : '—';
}

function categoryToKind(category: ScheduleCategory): Kind {
  if (category === 'inspection') return '점검';
  if (category === 'meeting') return '회의';
  return '납품';
}

function toEventView(item: ScheduleItem): EventView | null {
  if (item.all_day && item.start_date) {
    const [year, month, day] = item.start_date.split('-').map(Number);
    if (![year, month, day].every(Number.isFinite)) return null;
    return {
      id: item.schedule_id,
      title: item.title,
      kind: categoryToKind(item.category),
      allDay: true,
      time: '종일',
      minutes: 0,
      year,
      month: month - 1,
      day,
    };
  }
  if (!item.starts_at) return null;
  const parts = seoulParts(item.starts_at);
  if (!parts) return null;
  return {
    id: item.schedule_id,
    title: item.title,
    kind: categoryToKind(item.category),
    allDay: false,
    time: `${pad2(parts.hour)}:${pad2(parts.minute)}`,
    minutes: parts.minutes,
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function sortEvents(events: EventView[]): EventView[] {
  return events.slice().sort((a, b) => a.minutes - b.minutes);
}

function buildChartPoints(
  records: ProcessRecord[],
  period: 'today' | 'week',
  todayKey: string,
): ChartPoint[] {
  if (!records.length) return [];
  if (period === 'today') {
    const buckets = new Map<number, number>();
    records
      .filter((record) => seoulDayKey(record.occurred_at) === todayKey)
      .forEach((record) => {
        const parts = seoulParts(record.occurred_at);
        if (!parts) return;
        buckets.set(parts.hour, (buckets.get(parts.hour) ?? 0) + 1);
      });
    return [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([hour, value]) => ({ label: `${pad2(hour)}:00`, value }));
  }
  const days = Array.from({ length: RECENT_DAYS }, (_, index) => {
    const key = shiftDateISO(todayKey, index - (RECENT_DAYS - 1));
    return { key, label: key.slice(5).replace('-', '.') };
  });
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const key = seoulDayKey(record.occurred_at);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return days.map((day) => ({ label: day.label, value: counts.get(day.key) ?? 0 }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했어요.';
}

function HomeProductionChart({
  period,
  points,
}: {
  period: 'today' | 'week';
  points: ChartPoint[];
}) {
  if (!points.length) {
    return (
      <div className="chart-wrap">
        <p className="empty-text">표시할 생산 기록이 없어요.</p>
      </div>
    );
  }
  const LEFT = 62;
  const RIGHT = 35;
  const TOP = 20;
  const BOTTOM = 40;
  const WIDTH = 730;
  const HEIGHT = 272;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const maxValue = Math.max(...points.map((point) => point.value));
  const top = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const x = (index: number) =>
    points.length === 1 ? LEFT + plotWidth / 2 : LEFT + (index * plotWidth) / (points.length - 1);
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight;
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${period === 'today' ? '시간별' : '일별'} 생산 기록: 총 ${total.toLocaleString()}건. ${points
          .map((point) => `${point.label} ${point.value}건`)
          .join(', ')}`}
      >
        {[0, 1, 2, 3, 4].map((index) => {
          const value = (top / 4) * index;
          return (
            <g key={index}>
              <line
                x1={LEFT}
                y1={y(value)}
                x2={WIDTH - RIGHT}
                y2={y(value)}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <text x={LEFT - 12} y={y(value) + 4} textAnchor="end" className="chart-axis">
                {value.toLocaleString()}
              </text>
            </g>
          );
        })}
        <polyline
          points={line}
          fill="none"
          stroke="#635B85"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            cx={x(index)}
            cy={y(point.value)}
            r={index === points.length - 1 ? 5 : 3}
            fill={index === points.length - 1 ? '#61E2A6' : '#635B85'}
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>
              {point.label} · {point.value.toLocaleString()}건
            </title>
          </circle>
        ))}
        {points.map((point, index) => (
          <text
            key={`${point.label}-axis`}
            x={x(index)}
            y={HEIGHT - 12}
            textAnchor="middle"
            className="chart-axis"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

interface HomePageProps {
  onToast: (message: string) => void;
  extended: boolean;
  onLogout: () => void;
  loggingOut: boolean;
}
export default function HomePage({ onToast, extended, onLogout, loggingOut }: HomePageProps) {
  const { user } = useAuth();
  // 일정관리 탭과 같이 오늘 날짜를 기본으로 보여준다.
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  const todayKey = todayISO(today);
  const todayLabel = `${todayYear}.${pad2(todayMonth + 1)}.${pad2(todayDay)} (${WEEKDAYS[today.getDay()]})`;
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [confirmingNoteId, setConfirmingNoteId] = useState<number | null>(null);
  const [reportFilter, setReportFilter] = useState('전체');
  const [announcementRead, setAnnouncementRead] = useState(false);

  const reportsQuery = useApiQuery('home:reports', () => fetchReports({ pageSize: 100 }), {
    pollMs: 60_000,
  });
  const notesQuery = useApiQuery(
    'home:handover-notes',
    () => fetchHandoverNotes({ pageSize: NOTE_PAGE_SIZE }),
    { pollMs: 60_000 },
  );
  const processQuery = useApiQuery('home:process-current', fetchCurrentProcess, {
    pollMs: 30_000,
  });
  const workSession = useWorkSession();

  const monthFrom = `${year}-${pad2(month + 1)}-01`;
  const monthTo = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`;
  const schedulesQuery = useApiQuery(
    `home:schedules:${year}:${month}`,
    () => fetchSchedules({ from: monthFrom, to: monthTo, pageSize: 100 }),
    { pollMs: 60_000 },
  );
  const noticeQuery = useApiQuery(
    `home:schedules-notice:${todayKey}`,
    () => fetchSchedules({ from: todayKey, to: shiftDateISO(todayKey, 60), pageSize: 100 }),
    { pollMs: 60_000 },
  );

  const insightFrom = shiftDateISO(todayKey, -(INSIGHT_DAYS - 1));
  const qualityQuery = useApiQuery(
    `home:quality:${insightFrom}:${todayKey}`,
    () => fetchQualitySummary({ from: insightFrom, to: todayKey }),
    { pollMs: 60_000 },
  );
  const qualityTodayQuery = useApiQuery(
    `home:quality-today:${todayKey}`,
    () => fetchQualitySummary({ from: todayKey, to: todayKey }),
    { pollMs: 60_000 },
  );
  const recordFrom = shiftDateISO(todayKey, -(RECENT_DAYS - 1));
  const recordsQuery = useApiQuery(
    `home:records:${recordFrom}:${todayKey}`,
    () => fetchProcessRecords({ from: recordFrom, to: todayKey, pageSize: 100 }),
    { pollMs: 60_000 },
  );
  const todayRecordsQuery = useApiQuery(
    `home:records-today:${todayKey}`,
    () => fetchProcessRecords({ from: todayKey, to: todayKey, pageSize: 1 }),
    { pollMs: 60_000 },
  );
  const summaryErrors = [
    { label: '공정 현황', query: processQuery },
    { label: '오늘 검사 요약', query: qualityTodayQuery },
    { label: '오늘 생산 기록', query: todayRecordsQuery },
  ].filter(({ query }) => query.error && !query.data);

  const reportId = overlay?.kind === 'report' ? overlay.reportId : null;
  // 첫 화면의 KPI·생산 차트·보고·품질 요약만 기다리고 부가 영역은 독립적으로 표시한다.
  usePageEntryReady(
    [
      reportsQuery,
      processQuery,
      qualityQuery,
      qualityTodayQuery,
      recordsQuery,
      todayRecordsQuery,
    ].every((query) => query.data !== null || query.error !== null),
  );
  const reportDetailQuery = useApiQuery(
    `home:report:${reportId ?? 'none'}`,
    () => {
      if (reportId === null) return Promise.reject(new Error('선택된 보고가 없습니다.'));
      return fetchReport(reportId);
    },
    { enabled: reportId !== null },
  );

  const monthEvents = (schedulesQuery.data?.items ?? [])
    .map(toEventView)
    .filter((event): event is EventView => event !== null);
  const noticeEvents = (noticeQuery.data?.items ?? [])
    .map(toEventView)
    .filter((event): event is EventView => event !== null);
  const eventsForDay = (day: number) =>
    monthEvents.filter(
      (event) => event.year === year && event.month === month && event.day === day,
    );
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  // 오늘 일정이 있으면 그 일정을, 없으면 가장 가까운 다음 일정을 공지로 보여준다.
  const notice = (() => {
    for (let offset = 0; offset <= 60; offset += 1) {
      const date = new Date(todayYear, todayMonth, todayDay + offset);
      const dayEvents = sortEvents(
        noticeEvents.filter(
          (event) =>
            event.year === date.getFullYear() &&
            event.month === date.getMonth() &&
            event.day === date.getDate(),
        ),
      );
      if (!dayEvents.length) continue;
      const event = dayEvents.find((value) => value.kind === '점검') ?? dayEvents[0];
      return { event, date, total: dayEvents.length };
    }
    return null;
  })();
  const noticeIsToday =
    notice !== null &&
    notice.date.getFullYear() === todayYear &&
    notice.date.getMonth() === todayMonth &&
    notice.date.getDate() === todayDay;
  const noticeText =
    noticeQuery.loading && !noticeQuery.data
      ? '일정을 불러오는 중이에요.'
      : noticeQuery.error && !noticeQuery.data
        ? '일정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'
        : notice
          ? noticeIsToday
            ? notice.event.allDay
              ? `종일 일정으로 ${notice.event.title}이(가) 예정되어 있습니다.${
                  notice.total > 1 ? ` 외 ${notice.total - 1}건이 더 있습니다.` : ''
                } 작업 전 확인해 주세요.`
              : `${notice.event.time}부터 ${notice.event.title} 일정이 예정되어 있습니다.${
                  notice.total > 1 ? ` 외 ${notice.total - 1}건이 더 있습니다.` : ''
                } 작업 전 확인해 주세요.`
            : `${formatDate(
                `${notice.date.getFullYear()}-${pad2(notice.date.getMonth() + 1)}-${pad2(notice.date.getDate())}`,
              )} ${
                notice.event.allDay ? '종일' : notice.event.time
              }에 ${notice.event.title} 일정이 예정되어 있습니다.`
          : '오늘 예정된 안전 점검이나 일정이 없습니다.';
  // 선택한 날짜의 일정은 시간순으로 보여준다.
  const selectedEvents = sortEvents(eventsForDay(selectedDay));

  const reports = reportsQuery.data?.items ?? [];
  const latestReports = reports.slice(0, 3);
  const visibleReports = latestReports.filter(
    (report) => reportFilter === '전체' || report.business_status !== 'completed',
  );
  const pendingCount = reportsQuery.data
    ? reports.filter((report) => report.business_status !== 'completed').length
    : null;
  const waitingCount = reportsQuery.data
    ? reports.filter((report) => report.business_status === 'pending').length
    : null;
  const inProgressCount = reportsQuery.data
    ? reports.filter((report) => report.business_status === 'in_progress').length
    : null;
  const todayReportCount = reportsQuery.data
    ? reports.filter((report) => seoulDayKey(report.created_at) === todayKey).length
    : null;

  const notes = notesQuery.data?.items ?? [];
  const latestNote = notes.length ? notes[0] : null;
  const noteTotal = notesQuery.data?.pagination.total_items ?? notes.length;
  const unreadNotes = notes.filter((note) => !note.my_confirmed_at).length;

  const quality = qualityQuery.data;
  const defectRate = quality?.defect_rate ?? null;
  const todayDefectRate = qualityTodayQuery.data?.defect_rate ?? null;

  const weekTotal = recordsQuery.data?.pagination.total_items ?? null;
  const todayTotal = todayRecordsQuery.data?.pagination.total_items ?? null;
  const chartTotal = period === 'today' ? todayTotal : weekTotal;
  const chartPoints = buildChartPoints(recordsQuery.data?.items ?? [], period, todayKey);
  const sampledRecords = recordsQuery.data?.items.length ?? 0;
  const equipmentCount = processQuery.data
    ? new Set(processQuery.data.items.map((item) => item.equipment_id)).size
    : null;
  const workEnds = workSession.session ? formatClock(workSession.session.ends_at) : '—';
  const shiftText = workSession.error
    ? '근무 정보를 불러오지 못했어요.'
    : `주간 근무 · 종료 ${workEnds}`;

  const reportDetail =
    reportDetailQuery.data && reportDetailQuery.data.report_id === reportId
      ? reportDetailQuery.data
      : null;

  const changeMonth = (direction: number) => {
    const date = new Date(year, month + direction, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setSelectedDay(1);
  };
  const downloadSummary = () => {
    const rate = defectRate === null ? '—' : `${defectRate.toFixed(2)}%`;
    const rows = [
      ['구분', '값', '기준'],
      ['생산 기록', `${weekTotal ?? '—'}건`, `최근 ${RECENT_DAYS}일`],
      ['검사 건수', `${quality ? quality.inspected_count : '—'}건`, `최근 ${INSIGHT_DAYS}일`],
      ['불량률', rate, `최근 ${INSIGHT_DAYS}일`],
      ['미처리 보고', `${pendingCount ?? '—'}건`, '전체'],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '사출반장_홈요약.csv';
    link.click();
    URL.revokeObjectURL(url);
    onToast('홈 요약을 CSV로 내려받았습니다.');
  };
  const confirmNote = async (note: HandoverNote) => {
    if (note.my_confirmed_at) return;
    setConfirmingNoteId(note.note_id);
    try {
      await confirmHandoverNote(note.note_id);
      onToast('인수인계 노트를 확인했습니다.');
      notesQuery.reload();
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setConfirmingNoteId(null);
    }
  };
  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = noteText.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      await createHandoverNote({ body });
      setNoteText('');
      notesQuery.reload();
      onToast('인수인계 노트를 저장했어요.');
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <section className="page-intro">
        <div>
          <h1>
            좋은 하루예요, {user?.display_name ?? '—'}님<span className="greeting-dot">.</span>
          </h1>
        </div>
        <div className="intro-actions">
          <span className="date-label">
            <CalendarDays size={17} />
            {todayLabel}
          </span>
          <button className="button button-white" onClick={downloadSummary}>
            <Download size={17} /> 요약 다운로드
          </button>
        </div>
      </section>
      {summaryErrors.length > 0 && (
        <div className="home-initial-errors">
          {summaryErrors.map(({ label, query }) => (
            <section key={label} aria-label={`${label} 조회 오류`}>
              <p className="muted">{label}</p>
              {query.error && <ApiErrorState compact error={query.error} onRetry={query.reload} />}
            </section>
          ))}
        </div>
      )}
      <div className="notice-strip">
        <span className="notice-tag">
          <ShieldCheck size={16} />{' '}
          {!notice || notice.event.kind === '점검' ? '안전 공지' : '일정 공지'}
        </span>
        <p>{noticeText}</p>
        <button
          onClick={() => {
            const target = notice?.date ?? today;
            setAnnouncementRead(true);
            setYear(target.getFullYear());
            setMonth(target.getMonth());
            setSelectedDay(target.getDate());
            setOverlay({ kind: 'schedule', day: target.getDate() });
          }}
        >
          {announcementRead ? '확인 완료' : '일정 확인'}
          <ArrowRight size={16} />
        </button>
      </div>
      <section className="overview" aria-labelledby="overview-heading">
        <div className="section-top">
          <h2 id="overview-heading">오늘의 공정 요약 </h2>
          <span className="muted">
            마지막 갱신 {processQuery.data ? formatClock(processQuery.data.queried_at) : '—'}
          </span>
        </div>
        <div className="kpi-grid">
          <article className="kpi">
            <div className="kpi-label">
              전체 생산량
              <Layers3 size={19} />
            </div>
            <div className="kpi-value">
              <MissingValue size="lg" />
              <span>개</span>
            </div>
            <div className="kpi-bottom">
              <span>생산 기록 {todayTotal ?? '—'}건</span>
              <span>목표 —</span>
            </div>
            <div className="mini-progress">
              <span style={{ width: '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              검사 불량률
              <ShieldCheck size={19} />
            </div>
            <div className="kpi-value">
              {todayDefectRate === null ? <MissingValue size="lg" /> : todayDefectRate.toFixed(2)}
              <span>%</span>
            </div>
            <div className="kpi-bottom">
              <span>어제 대비 —</span>
              <span>검사 기록 기준</span>
            </div>
            <div className="kpi-spark" aria-hidden="true">
              <svg viewBox="0 0 240 22" preserveAspectRatio="none" />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              설비 가동률
              <Gauge size={19} />
            </div>
            <div className="kpi-value">
              <MissingValue size="lg" />
              <span>%</span>
              <span className="kpi-secondary">
                {equipmentCount ?? '—'} <small>/ —대</small>
              </span>
            </div>
            <div className="kpi-bottom">
              <span>정상 —대 · 휴식 —대 · 고장 —대</span>
            </div>
            <div className="segmented-progress" aria-label="설비 상태 비율 제공되지 않음">
              <span style={{ width: '0%' }} />
              <span style={{ width: '0%' }} />
              <span style={{ width: '0%' }} />
            </div>
          </article>
          <article className="kpi">
            <div className="kpi-label">
              확인이 필요한 보고
              <ClipboardIcon />
            </div>
            <div className="kpi-value">
              {pendingCount === null ? <MissingValue size="lg" /> : pendingCount}
              <span className="unit-lift">건</span>
              <span className="pill pill-amber">확인 필요</span>
            </div>
            <div className="kpi-bottom">
              <span>
                접수 대기 {waitingCount ?? '—'}건 · 조치 중 {inProgressCount ?? '—'}건
              </span>
              <button
                className="text-link"
                onClick={() => {
                  setReportFilter('미처리');
                  document
                    .getElementById('reports')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                aria-label="미처리 보고 보기"
              >
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="kpi-caption">오늘 올라온 보고 {todayReportCount ?? '—'}건</div>
          </article>
        </div>
      </section>
      <div className="dashboard-grid home-dashboard">
        <div className="main-column">
          <section className="card production-card">
            <div className="card-heading">
              <div>
                <h2>생산 현황</h2>
              </div>
              <SegmentedControl
                label="생산 조회 기간"
                value={period}
                options={[
                  { value: 'today', label: '오늘' },
                  { value: 'week', label: '최근 9일' },
                ]}
                onChange={setPeriod}
              />
            </div>
            <div className="chart-summary">
              <div>
                <strong>
                  {chartTotal ?? '—'}
                  <span>건</span>
                </strong>
                <span className="positive">
                  <ArrowUpRight size={15} />—<span className="muted">이전 기간 대비</span>
                </span>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-violet" />
                  생산량
                </span>
                <span>
                  <i className="legend-dashed" />
                  기준 생산량
                </span>
              </div>
            </div>
            {recordsQuery.loading && !recordsQuery.data ? (
              <LoadingState compact label="생산 기록을 불러오는 중이에요" />
            ) : recordsQuery.error && !recordsQuery.data ? (
              <ApiErrorState compact error={recordsQuery.error} onRetry={recordsQuery.reload} />
            ) : (
              <HomeProductionChart period={period} points={chartPoints} />
            )}
            <div className="chart-footer">
              <span>
                <span className="status-dot" />
                {chartTotal === null
                  ? '생산 기록을 불러오는 중이에요.'
                  : chartTotal === 0
                    ? '표시할 생산 기록이 없어요.'
                    : chartTotal > sampledRecords
                      ? `생산 기록 ${chartTotal.toLocaleString()}건 중 최근 ${sampledRecords}건을 기준으로 표시합니다.`
                      : `생산 기록 ${chartTotal.toLocaleString()}건을 기준으로 표시합니다.`}
              </span>
              <button className="text-link" onClick={() => setOverlay({ kind: 'equipment' })}>
                공장 한눈에 보기
                <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
          <section className="card reports-card" id="reports">
            <div className="card-heading">
              <div className="heading-inline">
                <h2>올라온 보고</h2>
                <span className="pill pill-neutral">
                  {reportsQuery.data ? latestReports.length : '—'}
                </span>
              </div>
              <SegmentedControl
                label="보고 처리 상태"
                value={reportFilter}
                options={[
                  { value: '전체', label: '전체' },
                  { value: '미처리', label: '미처리' },
                ]}
                onChange={setReportFilter}
              />
            </div>
            <div className="report-list">
              {reportsQuery.loading && !reportsQuery.data ? (
                <LoadingState compact label="보고를 불러오는 중이에요" />
              ) : reportsQuery.error && !reportsQuery.data ? (
                <ApiErrorState compact error={reportsQuery.error} onRetry={reportsQuery.reload} />
              ) : visibleReports.length ? (
                visibleReports.map((report) => {
                  const status = report.business_status;
                  return (
                    <button
                      className="report-row"
                      key={report.report_id}
                      onClick={() => setOverlay({ kind: 'report', reportId: report.report_id })}
                    >
                      <span
                        className={`report-icon ${status === 'pending' ? 'report-icon-alert' : ''}`}
                      >
                        {status === 'pending' ? (
                          <Wrench size={19} />
                        ) : status === 'completed' ? (
                          <CheckCheck size={19} />
                        ) : (
                          <FileText size={19} />
                        )}
                      </span>
                      <span className="report-copy">
                        <strong>{report.title}</strong>
                        <small>
                          {report.author_display_name}
                          <span>·</span>—<span>·</span>
                          {formatClock(report.created_at)}
                        </small>
                      </span>
                      <span className={`pill ${reportStatusPill[status]}`}>
                        {reportStatusLabel[status]}
                      </span>
                      <ChevronRight className="row-arrow" size={17} />
                    </button>
                  );
                })
              ) : (
                <p className="empty-text">
                  {reportFilter === '미처리'
                    ? '미처리 보고가 없어요.'
                    : '아직 올라온 보고가 없어요.'}
                </p>
              )}
            </div>
          </section>
          <section className="card handover-card">
            <div className="card-heading">
              <div className="heading-inline">
                <h2>인수인계 노트</h2>
                {unreadNotes > 0 && <span className="count-dot">{unreadNotes}</span>}
              </div>
              <button
                className="icon-button"
                aria-label="인수인계 노트 작성"
                onClick={() => setOverlay({ kind: 'note' })}
              >
                <Plus size={19} />
              </button>
            </div>
            {notesQuery.loading && !notesQuery.data ? (
              <HomeSectionSkeleton label="인수인계 노트를 불러오는 중이에요" />
            ) : notesQuery.error && !notesQuery.data ? (
              <ApiErrorState compact error={notesQuery.error} onRetry={notesQuery.reload} />
            ) : latestNote ? (
              <>
                <div className="note-preview">
                  <span
                    className={`pill ${latestNote.my_confirmed_at ? 'pill-green' : 'pill-amber'}`}
                  >
                    {latestNote.my_confirmed_at ? '확인 완료' : '미확인'}
                  </span>
                  <p>{latestNote.body}</p>
                  <small>
                    {latestNote.author_display_name} · {formatDateTime(latestNote.created_at)}
                  </small>
                </div>
                <button
                  className="note-confirm"
                  onClick={() => {
                    void confirmNote(latestNote);
                  }}
                  disabled={
                    Boolean(latestNote.my_confirmed_at) || confirmingNoteId === latestNote.note_id
                  }
                >
                  <Check size={16} />
                  {latestNote.my_confirmed_at
                    ? '확인 완료'
                    : confirmingNoteId === latestNote.note_id
                      ? '확인 중...'
                      : '내용 확인했어요'}
                </button>
                {noteTotal > 1 && (
                  <button
                    className="text-link note-more"
                    onClick={() => setOverlay({ kind: 'note' })}
                  >
                    전체 노트 {noteTotal}건 보기
                    <ArrowRight size={14} />
                  </button>
                )}
              </>
            ) : (
              <p className="empty-text">아직 작성된 인수인계가 없어요.</p>
            )}
          </section>
        </div>
        <div className="side-column">
          <section className="insight-card">
            <div className="insight-label">
              <Sparkles size={17} /> 사출반장의 품질 인사이트
            </div>
            <h2>
              오늘은 이 부분을
              <br />
              먼저 확인해 보세요.
            </h2>
            <div className="insight-target">
              <span className="insight-pulse" />
              <strong>검사 기록 요약</strong>
              <span className="pill pill-amber">우선 확인</span>
            </div>
            <p>
              {qualityQuery.loading && !quality
                ? '검사 기록을 불러오는 중이에요.'
                : qualityQuery.error && !quality
                  ? '검사 기록을 불러오지 못했어요.'
                  : quality && quality.inspected_count > 0
                    ? `최근 ${INSIGHT_DAYS}일 검사 ${quality.inspected_count}건 중 불량 ${quality.defect_count}건입니다. 불량 유형과 조치 이력을 함께 확인해 주세요.`
                    : `최근 ${INSIGHT_DAYS}일 검사 기록이 없어 확인할 항목이 없습니다.`}
            </p>
            <div className="insight-numbers">
              <div>
                <small>검사 기록 중 불량 비율</small>
                <strong>
                  {defectRate === null ? <MissingValue /> : defectRate.toFixed(2)}
                  <span>%</span>
                </strong>
              </div>
              <div>
                <small>검사 / 생산 기록</small>
                <strong>
                  {quality ? quality.inspected_count : <MissingValue />}
                  <span>/ </span>
                  {quality ? `${quality.production_record_count}건` : <MissingValue />}
                </strong>
              </div>
            </div>
            {qualityQuery.error && !quality && (
              <ApiErrorState compact error={qualityQuery.error} onRetry={qualityQuery.reload} />
            )}
            <button
              className="button button-primary insight-button"
              onClick={() => setOverlay({ kind: 'insight' })}
            >
              분석 근거 확인
              <ArrowUpRight size={17} />
            </button>
            <small className="insight-disclaimer">
              <Lightbulb size={13} />
              관찰된 연관성이 원인을 의미하지는 않습니다.
            </small>
          </section>
          <section className="card calendar-card">
            <div className="card-heading">
              <h2>근무 일정</h2>
            </div>
            <div className="calendar-month">
              <strong>
                {year}.{String(month + 1).padStart(2, '0')}
              </strong>
              <div>
                <button
                  className="icon-button"
                  aria-label="이전 달"
                  onClick={() => changeMonth(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button className="icon-button" aria-label="다음 달" onClick={() => changeMonth(1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="calendar-grid">
              {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                <span className={`weekday ${index === 0 ? 'sunday' : ''}`} key={day}>
                  {day}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, index) => (
                <span key={`blank-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                const dayEvents = eventsForDay(day);
                return (
                  <button
                    key={day}
                    className={`calendar-day ${day === selectedDay ? 'chosen' : ''} ${
                      year === today.getFullYear() &&
                      month === today.getMonth() &&
                      day === today.getDate()
                        ? 'today'
                        : ''
                    }`}
                    aria-label={`${month + 1}월 ${day}일, 일정 ${dayEvents.length}건`}
                    aria-pressed={day === selectedDay}
                    onClick={() => setSelectedDay(day)}
                  >
                    <span>{day}</span>
                    {dayEvents.length > 0 && (
                      <i
                        style={{
                          backgroundColor: kindColor[sortEvents(dayEvents)[0].kind],
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="calendar-schedule">
              <div>
                <strong>
                  {formatDate(
                    `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`,
                  )}{' '}
                  <span>
                    {year === today.getFullYear() &&
                    month === today.getMonth() &&
                    selectedDay === today.getDate()
                      ? '오늘'
                      : '선택일'}
                  </span>
                </strong>
                <span className="muted">
                  {schedulesQuery.loading && !schedulesQuery.data
                    ? '—'
                    : `${selectedEvents.length}건`}
                </span>
              </div>
              {schedulesQuery.loading && !schedulesQuery.data ? (
                <HomeSectionSkeleton label="일정을 불러오는 중이에요" />
              ) : schedulesQuery.error && !schedulesQuery.data ? (
                <ApiErrorState
                  compact
                  error={schedulesQuery.error}
                  onRetry={schedulesQuery.reload}
                />
              ) : selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <div className="schedule-row" key={event.id}>
                    <span
                      className="schedule-line"
                      style={{ backgroundColor: kindColor[event.kind] }}
                    />
                    <span>
                      <small>
                        {event.time} · {event.kind}
                      </small>
                      <strong>{event.title}</strong>
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty-text">등록된 일정이 없어요.</p>
              )}
            </div>
          </section>
        </div>
        <div className="shift-card">
          <span className="shift-clock">
            <Clock3 size={21} />
          </span>
          <div>
            <strong>{extended ? '연장 근무가 설정되었어요' : '오늘도 안전하게, 함께해요'}</strong>
            <p>{extended ? '현재 화면에만 적용됩니다.' : shiftText}</p>
          </div>
          <button onClick={onLogout} disabled={loggingOut}>
            로그아웃
          </button>
        </div>
      </div>
      <footer className="page-footer">
        <span>© 2026 사출반장. 더 나은 현장을 함께 만듭니다.</span>
      </footer>
      {overlay && (
        <Modal
          title={
            overlay.kind === 'report'
              ? '현장 보고 상세'
              : overlay.kind === 'schedule'
                ? `${formatDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(overlay.day).padStart(2, '0')}`)} 일정`
                : overlay.kind === 'note'
                  ? '인수인계 노트'
                  : overlay.kind === 'equipment'
                    ? '공장 한눈에 보기'
                    : '품질 인사이트 · 분석 근거'
          }
          onClose={() => setOverlay(null)}
          wide={overlay.kind === 'equipment'}
        >
          {overlay.kind === 'report' && (
            <>
              {reportDetailQuery.error && !reportDetail ? (
                <ApiErrorState error={reportDetailQuery.error} onRetry={reportDetailQuery.reload} />
              ) : reportDetail ? (
                <>
                  <span className="pill pill-violet">
                    {reportCategoryLabel[reportDetail.category]} ·{' '}
                    {reportStatusLabel[reportDetail.business_status]}
                  </span>
                  <h3>{reportDetail.title}</h3>
                  <p className="muted">
                    {reportDetail.report_id} · {reportDetail.author_display_name} ·{' '}
                    {formatDateTime(reportDetail.created_at)}
                  </p>
                  <div className="report-markdown">
                    <ReportMarkdown markdown={reportDetail.body_markdown || '—'} />
                  </div>
                  <div className="modal-callout">
                    <strong>다음 확인 사항</strong>
                    <p>
                      설비 점검 기록과 검사 이력을 확인하고, 현장 조치 결과를 인수인계 노트에 남겨
                      주세요.
                    </p>
                  </div>
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setNoteText(`${reportDetail.title}: 조치 결과 확인 필요`);
                      setOverlay({ kind: 'note' });
                    }}
                  >
                    인수인계 노트에 기록
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <LoadingState label="보고를 불러오는 중이에요" />
              )}
            </>
          )}
          {overlay.kind === 'schedule' && (
            <>
              {schedulesQuery.loading && !schedulesQuery.data ? (
                <LoadingState label="일정을 불러오는 중이에요" />
              ) : schedulesQuery.error && !schedulesQuery.data ? (
                <ApiErrorState error={schedulesQuery.error} onRetry={schedulesQuery.reload} />
              ) : eventsForDay(overlay.day).length ? (
                sortEvents(eventsForDay(overlay.day)).map((event) => (
                  <div className="modal-event" key={event.id}>
                    <span className={`pill ${kindPill[event.kind]}`}>{event.kind}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.time} · 생산팀 일정</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <CalendarDays size={32} />
                  <h3>등록된 일정이 없어요</h3>
                  <p>다른 날짜를 선택해 확인해 보세요.</p>
                </div>
              )}
            </>
          )}
          {overlay.kind === 'note' && (
            <>
              <form onSubmit={submitNote}>
                <label className="field-label" htmlFor="note">
                  다음 근무자에게 전달할 내용
                </label>
                <textarea
                  id="note"
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="설비, 조치 내용, 다음 확인 사항을 남겨 주세요."
                  required
                  maxLength={1000}
                  rows={4}
                />
                <div className="form-footer">
                  <small>{noteText.length} / 1,000</small>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={!noteText.trim() || savingNote}
                  >
                    <Plus size={16} />
                    노트 저장
                  </button>
                </div>
              </form>
              <p className="demo-disclaimer">노트는 서버에 저장되어 다른 근무자와 공유됩니다.</p>
              {notesQuery.loading && !notesQuery.data ? (
                <LoadingState compact label="인수인계 노트를 불러오는 중이에요" />
              ) : notesQuery.error && !notesQuery.data ? (
                <ApiErrorState compact error={notesQuery.error} onRetry={notesQuery.reload} />
              ) : notes.length ? (
                <div className="all-notes">
                  {notes.map((note) => (
                    <article key={note.note_id}>
                      <div>
                        <span
                          className={`pill ${note.my_confirmed_at ? 'pill-green' : 'pill-amber'}`}
                        >
                          {note.my_confirmed_at ? '확인 완료' : '미확인'}
                        </span>
                        <small>
                          {note.author_display_name} · {formatDateTime(note.created_at)}
                        </small>
                      </div>
                      <p>{note.body}</p>
                      <button
                        className="text-link"
                        onClick={() => {
                          void confirmNote(note);
                        }}
                        disabled={
                          Boolean(note.my_confirmed_at) || confirmingNoteId === note.note_id
                        }
                      >
                        <Check size={15} />
                        {note.my_confirmed_at
                          ? '확인 완료'
                          : confirmingNoteId === note.note_id
                            ? '확인 중...'
                            : '내용 확인'}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-text">아직 작성된 인수인계가 없어요.</p>
              )}
            </>
          )}
          {overlay.kind === 'equipment' && (
            <>
              <p className="muted">설비 배치와 상태를 보여줍니다.</p>
              {processQuery.loading && !processQuery.data ? (
                <LoadingState label="설비 정보를 불러오는 중이에요" />
              ) : processQuery.error && !processQuery.data ? (
                <ApiErrorState error={processQuery.error} onRetry={processQuery.reload} />
              ) : (
                <div className="factory-map">
                  {processQuery.data?.items.length ? (
                    processQuery.data.items.map((item) => (
                      <div className="machine" key={item.equipment_id}>
                        <Factory size={34} />
                        <strong>{item.equipment_name}</strong>
                        <span>{item.product_name ?? '—'}</span>
                        <span className="pill pill-neutral">—</span>
                        <small>
                          {item.equipment_code} · 주기 {item.cycle_time_seconds ?? '—'}초
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="empty-text" style={{ gridColumn: '1 / -1' }}>
                      표시할 설비가 없어요.
                    </p>
                  )}
                </div>
              )}
              <div className="modal-callout">
                <TriangleAlert size={18} />
                <p>설비 상태·이상 알림은 API에서 제공되지 않습니다.</p>
              </div>
            </>
          )}
          {overlay.kind === 'insight' && (
            <>
              {qualityQuery.loading && !quality ? (
                <LoadingState label="품질 요약을 불러오는 중이에요" />
              ) : qualityQuery.error && !quality ? (
                <ApiErrorState error={qualityQuery.error} onRetry={qualityQuery.reload} />
              ) : quality ? (
                <>
                  <span className="pill pill-amber">우선 조사 후보 · 원인 미확정</span>
                  <h3>
                    {quality.inspected_count > 0
                      ? `최근 ${INSIGHT_DAYS}일 검사 기록을 먼저 살펴보세요.`
                      : `최근 ${INSIGHT_DAYS}일 검사 기록이 없습니다.`}
                  </h3>
                  <p>
                    {quality.inspected_count > 0
                      ? `검사 ${quality.inspected_count}건 중 불량 ${quality.defect_count}건이며 불량률은 ${
                          quality.defect_rate === null ? '—' : `${quality.defect_rate.toFixed(2)}%`
                        }입니다. 불량 유형: ${
                          quality.defect_types.length
                            ? quality.defect_types
                                .map((item) => `${item.type ?? '유형 미지정'} ${item.count}건`)
                                .join(', ')
                            : '—'
                        }.`
                      : '선택한 기간에 검사 기록이 없어 분석할 수치가 없습니다.'}
                  </p>
                  <div className="modal-callout">
                    <strong>추천 확인 순서</strong>
                    <ol>
                      <li>해당 날짜의 공정 기록과 불량 사유 확인</li>
                      <li>동일 제품의 양품·불량 공정 조건 비교</li>
                      <li>단위·배율·수집 오류 여부 확인</li>
                      <li>현장 조치 및 이후 검사 결과 대조</li>
                    </ol>
                  </div>
                  <p>
                    이 비율은 조회 기간의 검사 기록 기준이며 전체 생산 불량률이 아닙니다. 실시간
                    공정이나 현재 설비의 고장을 의미하지 않습니다.
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => {
                      setNoteText(
                        `검사 기록 ${quality.inspected_count}건, 불량 ${quality.defect_count}건 확인 필요. 원인 미확정.`,
                      );
                      setOverlay({ kind: 'note' });
                    }}
                  >
                    확인 사항을 인수인계에 기록
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <p className="empty-text">표시할 품질 요약이 없어요.</p>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
function ClipboardIcon() {
  return <MessageSquareText size={19} />;
}
