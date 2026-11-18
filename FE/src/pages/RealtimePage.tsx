import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from 'lucide-react';
import Modal from '../components/Modal';
import {
  defectRatePrevious,
  equipment,
  productQuality,
  productionSummary,
  qualityPeriod,
  realtimeEvents,
} from '../constants/demoData';
import type { Equipment, EquipmentState, ProductQuality, RealtimeEvent } from '../types';

const statePill: Record<EquipmentState, string> = {
  정상: 'pill-green',
  주의: 'pill-amber',
  고장: 'pill-red',
  휴식: 'pill-neutral',
};
const levelPill: Record<RealtimeEvent['level'], string> = {
  정상: 'pill-green',
  주의: 'pill-amber',
  고장: 'pill-red',
  정보: 'pill-neutral',
};

type DetailPanel =
  | { kind: 'machine'; machine: Equipment }
  | { kind: 'quality'; quality: ProductQuality }
  | { kind: 'status'; label: '정상' | '휴식' | '고장' }
  | { kind: 'production' }
  | { kind: 'defect' };

// 도넛의 "정상" 구간은 가동 중(정상·주의) 설비를 함께 세는 그룹이다.
const statusGroupMachines = (label: '정상' | '휴식' | '고장') =>
  label === '정상'
    ? equipment.filter((machine) => machine.state === '정상' || machine.state === '주의')
    : equipment.filter((machine) => machine.state === label);

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
  const rootRef = useRef<HTMLDivElement>(null);

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
        onClick={() => setOpen((prev) => !prev)}
      >
        {value}
        <ChevronDown size={16} className="rt-select-chevron" />
      </button>
      {open && (
        <ul className="rt-select-menu" role="listbox" aria-label={label}>
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
  const [eventsExpanded, setEventsExpanded] = useState(false);
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

  const machineDetail = panel?.kind === 'machine' ? panel.machine : null;

  const productOptions = ['전체 제품', ...new Set(equipment.map((machine) => machine.product))];

  const filteredEquipment = equipment.filter(
    (machine) =>
      (machineFilter === '전체 설비' || machine.name === machineFilter) &&
      (productFilter === '전체 제품' || machine.product === productFilter),
  );
  const filteredEvents = realtimeEvents.filter(
    (event) =>
      (machineFilter === '전체 설비' || event.machine === machineFilter) &&
      (productFilter === '전체 제품' ||
        equipment.find((machine) => machine.name === event.machine)?.product === productFilter),
  );
  // 실시간 기록은 최근 10건만 노출하고, 이전 기록은 생산·검사 이력 탭으로 유도한다.
  // 실시간 기록은 기본적으로 최근 10건만 보여주고, 더 보기로 전체를 펼친다.
  // 좌측 열에 최신 기록부터 아래로 쌓고, 나머지를 우측 열에 담는다.
  const shownEvents = eventsExpanded ? filteredEvents : filteredEvents.slice(0, 10);
  const eventSplit = Math.ceil(shownEvents.length / 2);
  const eventColumns = [shownEvents.slice(0, eventSplit), shownEvents.slice(eventSplit)];

  // 설비가 많아질 때를 대비해 목록을 좌우 스크롤 밴드로 전환한다.
  const bandRef = useRef<HTMLDivElement>(null);
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
  }, [syncBand, filteredEquipment.length]);

  const scrollBand = (direction: number) => {
    const el = bandRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const statusCounts = useMemo(() => {
    const operating = equipment.filter(
      (machine) => machine.state === '정상' || machine.state === '주의',
    ).length;
    const resting = equipment.filter((machine) => machine.state === '휴식').length;
    const broken = equipment.filter((machine) => machine.state === '고장').length;
    return { operating, resting, broken, total: equipment.length };
  }, []);
  const operatingRate = Math.round((statusCounts.operating / statusCounts.total) * 100);

  const defect = useMemo(() => {
    const inspections = productQuality.reduce((sum, quality) => sum + quality.inspections, 0);
    const defects = productQuality.reduce((sum, quality) => sum + quality.defects, 0);
    return { inspections, defects, rate: Number(((defects / inspections) * 100).toFixed(2)) };
  }, []);

  const donutSegments: { label: '정상' | '휴식' | '고장'; count: number; color: string }[] = [
    { label: '정상', count: statusCounts.operating, color: '#61E2A6' },
    { label: '휴식', count: statusCounts.resting, color: '#A9AAB5' },
    { label: '고장', count: statusCounts.broken, color: '#D95F70' },
  ];
  let donutOffset = 0;
  const donutCircles = donutSegments.map((segment) => {
    const length = (segment.count / statusCounts.total) * 100;
    const circle = { ...segment, length, offset: donutOffset };
    donutOffset += length;
    return circle;
  });

  // 월 전체 생산량 카드의 보조 비교 막대. KPI·목표·저번 달 비교는 월 기준 고정이다.
  const trendBars =
    trend === 'daily'
      ? [
          { label: '어제', value: productionSummary.yesterday, current: false },
          { label: '오늘', value: productionSummary.todayOutput, current: true },
        ]
      : [
          { label: '지난주', value: productionSummary.lastWeek, current: false },
          { label: '이번주', value: productionSummary.thisWeek, current: true },
        ];
  const trendBarMax = Math.max(...trendBars.map((bar) => bar.value));

  return (
    <>
      <div className="rt-summary">
        <article
          className="card rt-kpi rt-clickable"
          aria-label="월 전체 생산량 상세 보기"
          {...activate(() => setPanel({ kind: 'production' }))}
        >
          <div className="card-heading">
            <h2>월 전체 생산량</h2>
            <div
              className="segmented-control"
              role="group"
              aria-label="생산 비교 기간 전환"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={trend === 'daily' ? 'selected' : ''}
                aria-pressed={trend === 'daily'}
                onClick={(event) => {
                  event.stopPropagation();
                  setTrend('daily');
                }}
              >
                오늘
              </button>
              <button
                type="button"
                className={trend === 'weekly' ? 'selected' : ''}
                aria-pressed={trend === 'weekly'}
                onClick={(event) => {
                  event.stopPropagation();
                  setTrend('weekly');
                }}
              >
                이번주
              </button>
            </div>
          </div>
          <div className="kpi-value">
            {productionSummary.today.toLocaleString()}
            <span>개</span>
            <span className="pill pill-green">
              <ArrowUpRight size={13} />
              저번 달 대비 +4.2%
            </span>
          </div>
          <div className="rt-bars">
            {trendBars.map((bar) => (
              <div className="rt-bar-row" key={bar.label}>
                <span>{bar.label}</span>
                <div className="rt-bar">
                  <span
                    className={bar.current ? 'rt-bar-current' : 'rt-bar-previous'}
                    style={{ width: `${(bar.value / trendBarMax) * 100}%` }}
                  />
                </div>
                <strong>{bar.value.toLocaleString()}개</strong>
              </div>
            ))}
          </div>
          <div className="kpi-bottom">
            <span>이번 달 목표 {productionSummary.todayTarget.toLocaleString()}개</span>
            <span>현재까지 {productionSummary.today.toLocaleString()}개</span>
          </div>
          <div className="mini-progress">
            <span
              style={{
                width: `${(productionSummary.today / productionSummary.todayTarget) * 100}%`,
              }}
            />
          </div>
        </article>

        <article className="card rt-donut-card">
          <div className="card-heading">
            <h2>설비 가동률</h2>
          </div>
          <div className="rt-donut-body">
            <div className="rt-donut">
              <svg viewBox="0 0 120 120" role="img" aria-label={`가동률 ${operatingRate}%`}>
                {donutCircles.map((circle) => (
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
                ))}
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
                <strong>{operatingRate}%</strong>
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
                    {circle.label} {circle.count}대
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article
          className="card rt-defect-card rt-clickable"
          aria-label="검사 불량률 상세 보기"
          {...activate(() => setPanel({ kind: 'defect' }))}
        >
          <div className="card-heading">
            <h2>검사 불량률</h2>
          </div>
          <div className="kpi-value">
            {defect.rate}
            <span>%</span>
            <span className="pill pill-green">
              <ArrowDownRight size={13} /> 어제 대비 -0.32%p
            </span>
          </div>
          <div className="rt-bars">
            <div className="rt-bar-row">
              <span>어제</span>
              <div className="rt-bar">
                <span className="rt-bar-previous" style={{ width: '100%' }} />
              </div>
              <strong>{defectRatePrevious}%</strong>
            </div>
            <div className="rt-bar-row">
              <span>오늘</span>
              <div className="rt-bar">
                <span
                  className="rt-bar-current"
                  style={{ width: `${(defect.rate / defectRatePrevious) * 100}%` }}
                />
              </div>
              <strong>{defect.rate}%</strong>
            </div>
          </div>
        </article>
      </div>

      <section className="card rt-quality">
        <div className="card-heading">
          <h2>제품별 품질 현황</h2>
        </div>
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
            {productQuality.map((quality) => (
              <tr
                key={quality.product}
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
                  <strong>{((quality.defects / quality.inspections) * 100).toFixed(1)}%</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>전체</td>
              <td>{defect.inspections.toLocaleString()}</td>
              <td>{defect.defects}</td>
              <td>{defect.rate}%</td>
            </tr>
          </tfoot>
        </table>
        <p className="rt-note">
          RG3 RH의 불량 기록 27건 중 25건이 10/22–23에 집중되어 있어요. 해당 기간의 공정 조건과 조치
          이력을 우선 비교해 보세요.
          <span>중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.</span>
        </p>
      </section>

      <section className="rt-filters" aria-label="조회 필터">
        <FilterDropdown
          label="설비 필터"
          value={machineFilter}
          options={['전체 설비', ...equipment.map((machine) => machine.name)]}
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
            설비 상태 <span className="pill pill-neutral">{filteredEquipment.length}대</span>
          </h2>
          <span className="muted">카드를 누르면 상세 정보가 열려요</span>
        </div>
        {filteredEquipment.length === 0 ? (
          <div className="card rt-empty">
            <p>조건에 맞는 설비가 없어요. 필터를 바꿔 보세요.</p>
          </div>
        ) : (
          <div className="rt-band">
            {bandEdges.scrollable && (
              <button
                type="button"
                className="rt-band-nav prev"
                aria-label="이전 설비 보기"
                disabled={bandEdges.start}
                onClick={() => scrollBand(-1)}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="rt-card-grid" ref={bandRef} onScroll={syncBand}>
              {filteredEquipment.map((machine) => (
                <article
                  key={machine.name}
                  className={`rt-machine${
                    machine.state === '주의'
                      ? ' rt-machine-warn'
                      : machine.state === '고장'
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
                      <span className={`pill ${statePill[machine.state]}`}>{machine.state}</span>
                    </div>
                    <span className="rt-product">{machine.product}</span>
                    <div className="mini-progress">
                      <span style={{ width: `${machine.progress}%` }} />
                    </div>
                    <div className="rt-machine-meta">
                      <span>
                        {machine.production?.toLocaleString()} / {machine.target?.toLocaleString()}
                        개
                      </span>
                      <span>사이클 {machine.cycleMinutes ? `${machine.cycleMinutes}분` : '—'}</span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
            {bandEdges.scrollable && (
              <button
                type="button"
                className="rt-band-nav next"
                aria-label="다음 설비 보기"
                disabled={bandEdges.end}
                onClick={() => scrollBand(1)}
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        )}
      </section>

      <section className="card rt-events" aria-label="최근 실시간 기록">
        <div className="card-heading">
          <div>
            <h2>최근 실시간 기록</h2>
            <p>
              총 {filteredEvents.length}건
              {filteredEvents.length > shownEvents.length ? ' · 최근 10건' : ''}
            </p>
          </div>
        </div>
        {filteredEvents.length === 0 ? (
          <p className="rt-empty">조건에 맞는 기록이 없어요. 필터를 바꿔 보세요.</p>
        ) : (
          <div className="rt-event-list">
            {eventColumns.map((column, index) => (
              <ul className="rt-event-col" key={index}>
                {column.map((event) => (
                  <li key={`${event.time}-${event.machine}`}>
                    <span className="rt-time">
                      <Clock3 size={13} /> {event.time}
                    </span>
                    <span className={`pill ${levelPill[event.level]}`}>{event.level}</span>
                    <span className="rt-event-machine">{event.machine}</span>
                    <span className="rt-message">{event.message}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
        {filteredEvents.length > shownEvents.length && (
          <button
            type="button"
            className={`rt-events-more${eventsExpanded ? ' open' : ''}`}
            aria-expanded={eventsExpanded}
            onClick={() => setEventsExpanded(!eventsExpanded)}
          >
            {eventsExpanded ? '접기' : '더 보기'}
            <ChevronDown size={14} />
          </button>
        )}
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
            placeholder="예시: 오늘 생산량은 얼마나 됐어?"
            aria-label="사출반장에게 질문"
          />
          <button className="button button-primary" type="submit">
            보내기
          </button>
        </form>
      </section>

      {machineDetail && (
        <Modal title={`${machineDetail.name} 상세`} onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>상태</dt>
              <dd>
                <span className={`pill ${statePill[machineDetail.state]}`}>
                  {machineDetail.state}
                </span>
              </dd>
            </div>
            <div>
              <dt>제품</dt>
              <dd>{machineDetail.product}</dd>
            </div>
            <div>
              <dt>진행률</dt>
              <dd>{machineDetail.progress}%</dd>
            </div>
            <div>
              <dt>오늘 생산량</dt>
              <dd>
                {machineDetail.production?.toLocaleString()} /{' '}
                {machineDetail.target?.toLocaleString()}개
              </dd>
            </div>
            <div>
              <dt>사이클 타임</dt>
              <dd>{machineDetail.cycleMinutes ? `${machineDetail.cycleMinutes}분` : '—'}</dd>
            </div>
            <div>
              <dt>마지막 점검</dt>
              <dd>{machineDetail.lastCheck ?? '—'}</dd>
            </div>
          </dl>
        </Modal>
      )}

      {panel?.kind === 'quality' && (
        <Modal title={`${panel.quality.product} 품질 상세`} onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>검사 기록수</dt>
              <dd>{panel.quality.inspections.toLocaleString()}건</dd>
            </div>
            <div>
              <dt>불량 수</dt>
              <dd>{panel.quality.defects}건</dd>
            </div>
            <div>
              <dt>불량 비율</dt>
              <dd>{((panel.quality.defects / panel.quality.inspections) * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt>집계 기간</dt>
              <dd>{qualityPeriod}</dd>
            </div>
          </dl>
          {panel.quality.focus && (
            <p className="rt-note">
              RG3 RH의 불량 기록 27건 중 25건이 10/22–23에 집중되어 있어요. 해당 기간의 공정 조건과
              조치 이력을 우선 비교해 보세요.
            </p>
          )}
          <p className="demo-disclaimer">
            중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.
          </p>
        </Modal>
      )}

      {panel?.kind === 'status' && (
        <Modal
          title={`${panel.label === '정상' ? '가동 중' : panel.label} 설비 ${statusGroupMachines(panel.label).length}대`}
          onClose={() => setPanel(null)}
        >
          <ul className="rt-status-list">
            {statusGroupMachines(panel.label).map((machine) => (
              <li key={machine.name}>
                <strong>{machine.name}</strong>
                <span className="rt-status-product">{machine.product}</span>
                <span className={`pill ${statePill[machine.state]}`}>{machine.state}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {panel?.kind === 'production' && (
        <Modal title="월 전체 생산량 상세" onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>이번 달 누계</dt>
              <dd>{productionSummary.today.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>이번 달 목표</dt>
              <dd>{productionSummary.todayTarget.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>저번 달</dt>
              <dd>{productionSummary.previousToday.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>어제 · 오늘</dt>
              <dd>
                {productionSummary.yesterday.toLocaleString()}개 ·{' '}
                {productionSummary.todayOutput.toLocaleString()}개
              </dd>
            </div>
            <div>
              <dt>지난주 · 이번주</dt>
              <dd>
                {productionSummary.lastWeek.toLocaleString()}개 ·{' '}
                {productionSummary.thisWeek.toLocaleString()}개
              </dd>
            </div>
          </dl>
          <p className="rt-note">
            이번 달 목표 달성률은 96.9%예요. 저번 달 대비 생산량이 +4.2% 늘었어요.
          </p>
        </Modal>
      )}

      {panel?.kind === 'defect' && (
        <Modal title="검사 불량률 상세" onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>어제</dt>
              <dd>{defectRatePrevious}%</dd>
            </div>
            <div>
              <dt>오늘</dt>
              <dd>{defect.rate}%</dd>
            </div>
            <div>
              <dt>변화</dt>
              <dd>0.32%p 감소</dd>
            </div>
            <div>
              <dt>검사 기록수</dt>
              <dd>{defect.inspections.toLocaleString()}건</dd>
            </div>
          </dl>
          <p className="rt-note">
            제품별 불량 내역은 화면의 제품별 품질 현황 표에서 확인할 수 있어요.
          </p>
          <p className="demo-disclaimer">
            중복 제거 라벨 기록 기준이며 전체 생산 불량률이 아닙니다.
          </p>
        </Modal>
      )}
    </>
  );
}
