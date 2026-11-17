import { useMemo, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Clock3 } from 'lucide-react';
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

interface RealtimePageProps {
  onOpenPlaceholder: (name: string) => void;
  onAskAssistant: () => void;
}

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

const DONUT_RADIUS = 50;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export default function RealtimePage({ onOpenPlaceholder, onAskAssistant }: RealtimePageProps) {
  const [machineFilter, setMachineFilter] = useState('전체 설비');
  const [productFilter, setProductFilter] = useState('전체 제품');
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [panel, setPanel] = useState<DetailPanel | null>(null);
  const [question, setQuestion] = useState('');

  const handleAsk = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!question.trim()) return;
    onAskAssistant();
    setQuestion('');
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
    const length = (segment.count / statusCounts.total) * DONUT_CIRCUMFERENCE;
    const circle = { ...segment, length, offset: donutOffset };
    donutOffset += length;
    return circle;
  });

  const productionValue = period === 'today' ? productionSummary.today : productionSummary.week;
  const productionBars =
    period === 'today'
      ? [
          { label: '작월', value: productionSummary.previousToday, current: false },
          { label: '당월', value: productionSummary.today, current: true },
        ]
      : [
          { label: '이전', value: productionSummary.previousWeek, current: false },
          { label: '최근', value: productionSummary.week, current: true },
        ];
  const productionBarMax = Math.max(...productionBars.map((bar) => bar.value));

  return (
    <>
      <section className="rt-intro" aria-label="실시간 공정 소개">
        <div>
          <p>설비 상태와 생산 흐름, 품질 지표를 한 화면에서 확인하세요.</p>
          <span className="rt-updated">
            <Clock3 size={14} /> 예시 기준 시각 16:42
          </span>
        </div>
        <p className="demo-disclaimer">예시 화면 · 실제 공정 및 서버 미연동</p>
      </section>

      <section className="rt-filters" aria-label="조회 필터">
        <label className="select-control">
          <span className="sr-only">설비 필터</span>
          <select
            aria-label="설비 필터"
            value={machineFilter}
            onChange={(event) => setMachineFilter(event.target.value)}
          >
            <option>전체 설비</option>
            {equipment.map((machine) => (
              <option key={machine.name}>{machine.name}</option>
            ))}
          </select>
        </label>
        <label className="select-control">
          <span className="sr-only">제품 필터</span>
          <select
            aria-label="제품 필터"
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
          >
            {productOptions.map((product) => (
              <option key={product}>{product}</option>
            ))}
          </select>
        </label>
        <div className="segmented-control" aria-label="생산 조회 기간">
          <button
            className={period === 'today' ? 'selected' : ''}
            aria-pressed={period === 'today'}
            onClick={() => setPeriod('today')}
          >
            오늘
          </button>
          <button
            className={period === 'week' ? 'selected' : ''}
            aria-pressed={period === 'week'}
            onClick={() => setPeriod('week')}
          >
            최근 9일
          </button>
        </div>
      </section>

      <div className="rt-summary">
        <article
          className="card rt-kpi rt-clickable"
          aria-label="전체 생산량 상세 보기"
          {...activate(() => setPanel({ kind: 'production' }))}
        >
          <div className="card-heading">
            <div>
              <h2>전체 생산량</h2>
              <p>{period === 'today' ? '오늘 기준 예시' : '최근 9일 누적 예시'}</p>
            </div>
            <span className="pill pill-green">
              <ArrowUpRight size={13} />
              {period === 'today' ? '작월 대비 +4.2%' : '이전 기간 대비 +6.8%'}
            </span>
          </div>
          <div className="kpi-value">
            {productionValue.toLocaleString()}
            <span>개</span>
          </div>
          <div className="rt-bars">
            {productionBars.map((bar) => (
              <div className="rt-bar-row" key={bar.label}>
                <span>{bar.label}</span>
                <div className="rt-bar">
                  <span
                    className={bar.current ? 'rt-bar-current' : 'rt-bar-previous'}
                    style={{ width: `${(bar.value / productionBarMax) * 100}%` }}
                  />
                </div>
                <strong>{bar.value.toLocaleString()}개</strong>
              </div>
            ))}
          </div>
          <div className="kpi-bottom">
            {period === 'today' ? (
              <span>목표 {productionSummary.todayTarget.toLocaleString()}개</span>
            ) : (
              <span>최근 9일 누적</span>
            )}
          </div>
          {period === 'today' && (
            <div className="mini-progress">
              <span
                style={{
                  width: `${(productionSummary.today / productionSummary.todayTarget) * 100}%`,
                }}
              />
            </div>
          )}
        </article>

        <article className="card rt-donut-card">
          <div className="card-heading">
            <div>
              <h2>설비 가동률</h2>
              <p>10대 설비 기준 예시</p>
            </div>
          </div>
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
                  strokeWidth="16"
                  strokeDasharray={`${circle.length} ${DONUT_CIRCUMFERENCE - circle.length}`}
                  strokeDashoffset={-circle.offset}
                  transform="rotate(-90 60 60)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPanel({ kind: 'status', label: circle.label })}
                />
              ))}
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
        </article>

        <article
          className="card rt-defect-card rt-clickable"
          aria-label="검사 불량률 상세 보기"
          {...activate(() => setPanel({ kind: 'defect' }))}
        >
          <div className="card-heading">
            <div>
              <h2>검사 불량률</h2>
              <p>검사 기록 기준 예시</p>
            </div>
          </div>
          <div className="kpi-value">
            {defect.rate}
            <span>%</span>
          </div>
          <div className="rt-bars">
            <div className="rt-bar-row">
              <span>이번</span>
              <div className="rt-bar">
                <span
                  className="rt-bar-current"
                  style={{ width: `${(defect.rate / defectRatePrevious) * 100}%` }}
                />
              </div>
              <strong>{defect.rate}%</strong>
            </div>
            <div className="rt-bar-row">
              <span>전일</span>
              <div className="rt-bar">
                <span className="rt-bar-previous" style={{ width: '100%' }} />
              </div>
              <strong>{defectRatePrevious}%</strong>
            </div>
          </div>
          <p className="rt-defect-caption">
            <ArrowDownRight size={14} /> 전일 대비 0.32%p 감소했어요
          </p>
        </article>
      </div>

      <section className="card rt-quality">
        <div className="card-heading">
          <div>
            <h2>제품별 품질 현황</h2>
            <p>{qualityPeriod} · 중복 제거 라벨 기록 · 예시</p>
          </div>
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
                  {quality.focus && <span className="pill pill-amber">우선 확인</span>}
                </td>
                <td>{quality.inspections.toLocaleString()}</td>
                <td>{quality.defects}</td>
                <td>{((quality.defects / quality.inspections) * 100).toFixed(1)}%</td>
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
          <div className="rt-card-grid">
            {filteredEquipment.map((machine) => (
              <article key={machine.name} className="rt-machine">
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
                      {machine.production?.toLocaleString()} / {machine.target?.toLocaleString()}개
                    </span>
                    <span>사이클 {machine.cycleMinutes ? `${machine.cycleMinutes}분` : '—'}</span>
                  </div>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card rt-events" aria-label="최근 실시간 기록">
        <div className="card-heading">
          <div>
            <h2>최근 실시간 기록</h2>
            <p>예시 이벤트 {filteredEvents.length}건</p>
          </div>
        </div>
        {filteredEvents.length === 0 ? (
          <p className="rt-empty">조건에 맞는 기록이 없어요. 필터를 바꿔 보세요.</p>
        ) : (
          <ul className="rt-event-list">
            {filteredEvents.map((event) => (
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
        )}
      </section>

      <footer className="rt-bottom">
        <button className="button button-white" onClick={() => onOpenPlaceholder('생산·검사 이력')}>
          생산·검사 이력 보기
          <ChevronRight size={16} />
        </button>
      </footer>

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
        <p className="demo-disclaimer">
          예시 화면 · 실제 AI가 아닙니다. 질문은 홈의 사출반장으로 이어져요.
        </p>
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
          <p className="demo-disclaimer">예시 데이터이며 실제 설비 상태가 아닙니다.</p>
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
          <p className="demo-disclaimer">예시 데이터이며 실제 설비 상태가 아닙니다.</p>
        </Modal>
      )}

      {panel?.kind === 'production' && (
        <Modal title="전체 생산량 상세" onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>오늘</dt>
              <dd>{productionSummary.today.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>최근 9일</dt>
              <dd>{productionSummary.week.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>오늘 목표</dt>
              <dd>{productionSummary.todayTarget.toLocaleString()}개</dd>
            </div>
            <div>
              <dt>작월</dt>
              <dd>{productionSummary.previousToday.toLocaleString()}개</dd>
            </div>
          </dl>
          <p className="rt-note">
            오늘 목표 달성률은 96.9%예요. 작월 대비 생산량이 +4.2% 늘었어요.
          </p>
          <p className="demo-disclaimer">예시 데이터이며 실제 생산량이 아닙니다.</p>
        </Modal>
      )}

      {panel?.kind === 'defect' && (
        <Modal title="검사 불량률 상세" onClose={() => setPanel(null)}>
          <dl className="rt-detail">
            <div>
              <dt>이번</dt>
              <dd>{defect.rate}%</dd>
            </div>
            <div>
              <dt>전일</dt>
              <dd>{defectRatePrevious}%</dd>
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
