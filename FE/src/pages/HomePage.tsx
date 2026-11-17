import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
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
  Moon,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Modal from '../components/Modal';
import ProductionChart from '../components/ProductionChart';
import { calendarEvents, equipment, reports } from '../constants/demoData';
import type { HandoverNote, Report } from '../types';

type Overlay =
  | { kind: 'report'; report: Report }
  | { kind: 'schedule'; day: number }
  | { kind: 'note' }
  | { kind: 'equipment' }
  | { kind: 'insight' }
  | { kind: 'guide'; name: string }
  | { kind: 'notifications' }
  | null;
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
const NOTE_KEY = 'sachul-home-notes-v1';
const demoNote: HandoverNote = {
  id: 'demo-1',
  content:
    '사출 3호기 압력 변동 확인이 필요합니다. 14시 정기 점검 기록을 확인한 후 다음 근무자에게 결과를 전달해 주세요.',
  author: '이현우 · 13:50',
  checked: false,
};
function loadNotes(): HandoverNote[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTE_KEY) ?? 'null');
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'id' in value &&
          typeof value.id === 'string' &&
          'content' in value &&
          typeof value.content === 'string' &&
          'author' in value &&
          typeof value.author === 'string' &&
          'checked' in value &&
          typeof value.checked === 'boolean',
      )
    )
      return parsed as HandoverNote[];
  } catch {
    /* 브라우저 저장소를 사용할 수 없으면 예시 노트를 표시한다. */
  }
  return [demoNote];
}
export default function HomePage() {
  const outlet = useOutlet();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle =
    location.pathname === '/'
      ? '홈'
      : location.pathname.replace(/\/$/, '') === '/inventory'
        ? '재고 관리'
        : location.pathname.replace(/\/$/, '') === '/quality-reports'
          ? '품질 리포트'
          : location.pathname.replace(/\/$/, '') === '/chat'
            ? '대화·검색'
            : location.pathname.endsWith('/precision-inspection')
              ? '정밀기계검사'
              : location.pathname.startsWith('/records')
                ? '생산·검사 이력'
                : '페이지 없음';
  useEffect(() => {
    document.title = `사출반장 · ${pageTitle}`;
    const frame = requestAnimationFrame(() => {
      if (location.hash === '#assistant') {
        document
          .getElementById('assistant')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('question')?.focus({ preventScroll: true });
      } else {
        window.scrollTo({ top: 0 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash, pageTitle]);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toast, setToast] = useState('');
  const [month, setMonth] = useState(10);
  const [year, setYear] = useState(2026);
  const [selectedDay, setSelectedDay] = useState(17);
  const [notes, setNotes] = useState<HandoverNote[]>(loadNotes);
  const [noteText, setNoteText] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [extended, setExtended] = useState(false);
  const [reportFilter, setReportFilter] = useState('전체');
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [equipmentName, setEquipmentName] = useState('전체 설비');
  const [announcementRead, setAnnouncementRead] = useState(false);
  const unreadNotes = notes.filter((note) => !note.checked).length;
  const visibleReports = reports.filter(
    (report) => reportFilter === '전체' || report.status !== '완료',
  );
  const visibleEquipment = equipment.filter(
    (item) => equipmentName === '전체 설비' || item.name === equipmentName,
  );
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const eventsForDay = (day: number) =>
    year === 2026 && month === 10 ? calendarEvents.filter((event) => event.day === day) : [];
  const saveNotes = (next: HandoverNote[]) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTE_KEY, JSON.stringify(next));
      return true;
    } catch {
      setToast('브라우저 저장소를 사용할 수 없어 새로고침하면 노트가 사라집니다.');
      return false;
    }
  };
  const changeMonth = (direction: number) => {
    const date = new Date(year, month + direction, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setSelectedDay(1);
  };
  const askAssistant = (value: string) => {
    const content = value.trim();
    if (!content) return;
    let reply =
      '오늘 예시 공정은 생산량 5,232개, 검사 불량률 1.15%, 가동률 60%입니다. 설비·검사 기록과 현장 조치를 함께 확인해 주세요.';
    if (/인수|교대/.test(content))
      reply = `인수인계 미확인 노트는 ${unreadNotes}건입니다. 사출 3호기의 압력 변동 점검 기록을 확인하고, 조치 결과와 다음 확인 사항을 다음 근무자에게 전달해 주세요.`;
    else if (/일정|점검/.test(content))
      reply =
        '11월 17일 예시 일정은 09:00 생산팀 회의, 14:00 사출 3호기 정기 점검, 16:30 CN7 출하 전 품질 확인입니다. 일정 카드에서 날짜를 선택하면 상세 내용을 볼 수 있어요.';
    else if (/불량|품질|원인/.test(content))
      reply =
        '예시 검사 불량률은 1.15%입니다. RG3 RH의 과거 불량 기록 27건 중 25건이 10/22–23에 집중되어 있습니다. 해당 기간의 공정 조건과 조치 이력을 우선 비교해 보세요. 원인은 확정할 수 없습니다.';
    else if (/설비|공정|보고/.test(content))
      reply =
        '예시 설비 현황에서 사출 3호기는 주의 상태이며 유압 압력 변동 보고가 대기 중입니다. 점검 기록과 보고 내용을 확인해 주세요. 과거 검사 불량과 현재 설비 고장은 서로 다른 상태입니다.';
    setMessages((current) => [
      ...current,
      { role: 'user', content },
      { role: 'assistant', content: reply },
    ]);
    setQuestion('');
  };
  const downloadSummary = () => {
    const csv =
      '\uFEFF구분,값,기준\n생산량,"5,232개",예시 데이터\n검사 불량률,1.15%,예시 검사 기록\n가동률,60%,예시 데이터\n미처리 보고,2건,예시 데이터\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '사출반장_홈요약_예시.csv';
    link.click();
    URL.revokeObjectURL(url);
    setToast('예시 홈 요약을 CSV로 내려받았습니다.');
  };
  const focusAssistant = () => {
    if (location.pathname !== '/') {
      navigate('/#assistant');
      return;
    }
    document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('question')?.focus({ preventScroll: true });
  };
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${dark ? 'dark' : ''}`}>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onNavigate={(name) => setOverlay({ kind: 'guide', name })}
        onAssistant={focusAssistant}
      />
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>워크스페이스</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="topbar-actions">
            <span className="shift-label">
              <Clock3 size={15} /> 주간 근무 <span>08:00–17:00</span>
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label="알림 3건 보기"
              onClick={() => setOverlay({ kind: 'notifications' })}
            >
              <Bell size={20} />
              <i />
            </button>
            <span className="avatar">민</span>
            <div className="user-info">
              <strong>
                박민규 <span>님</span>
              </strong>
              <small>생산 관리자</small>
            </div>
          </div>
        </header>
        <main id="main-content">
          {outlet ?? (
            <>
              <section className="page-intro">
                <div>
                  <div className="eyebrow">
                    <span /> FACTORY AT A GLANCE
                  </div>
                  <h1>
                    좋은 하루예요, 민규님<span className="greeting-dot">.</span>
                  </h1>
                  <p>공정부터 인수인계까지, 오늘의 공장을 한눈에 확인하세요.</p>
                </div>
                <div className="intro-actions">
                  <span className="date-label">
                    <CalendarDays size={17} />
                    2026년 11월 17일 화요일
                  </span>
                  <button className="button button-white" onClick={downloadSummary}>
                    <Download size={17} /> 요약 다운로드
                  </button>
                </div>
              </section>
              <div className="notice-strip">
                <span className="notice-tag">
                  <ShieldCheck size={16} /> 안전 공지
                </span>
                <p>14:00부터 사출 3호기 정기 점검이 예정되어 있습니다. 작업 전 확인해 주세요.</p>
                <button
                  onClick={() => {
                    setAnnouncementRead(true);
                    setYear(2026);
                    setMonth(10);
                    setSelectedDay(17);
                    setOverlay({ kind: 'schedule', day: 17 });
                  }}
                >
                  {announcementRead ? '확인 완료' : '일정 확인'}
                  <ArrowRight size={16} />
                </button>
              </div>
              <section className="overview" aria-labelledby="overview-heading">
                <div className="section-top">
                  <h2 id="overview-heading">
                    오늘의 공정 요약{' '}
                    <span className="live-label">
                      <i /> DEMO
                    </span>
                  </h2>
                  <span className="muted">예시 기준 시각 16:42</span>
                </div>
                <div className="kpi-grid">
                  <article className="kpi">
                    <div className="kpi-label">
                      전체 생산량
                      <Layers3 size={19} />
                    </div>
                    <div className="kpi-value">
                      5,232<span>개</span>
                    </div>
                    <div className="kpi-bottom">
                      <span className="positive">
                        <ArrowUpRight size={14} /> 전일 대비 4.2%
                      </span>
                      <span>목표 5,400개</span>
                    </div>
                    <div className="mini-progress">
                      <span style={{ width: '96.9%' }} />
                    </div>
                  </article>
                  <article className="kpi">
                    <div className="kpi-label">
                      검사 불량률
                      <ShieldCheck size={19} />
                    </div>
                    <div className="kpi-value">
                      1.15<span>%</span>
                    </div>
                    <div className="kpi-bottom">
                      <span className="positive">
                        <ArrowDownRight size={14} /> 전일 대비 0.32%p
                      </span>
                      <span>검사 기록 기준</span>
                    </div>
                    <div className="kpi-spark" aria-hidden="true">
                      <svg viewBox="0 0 240 22" preserveAspectRatio="none">
                        <path d="M0 5 L20 9 L40 6 L60 12 L80 10 L100 15 L120 12 L140 18 L160 16 L180 20 L200 18 L220 20 L240 21" />
                      </svg>
                    </div>
                  </article>
                  <article className="kpi">
                    <div className="kpi-label">
                      설비 가동률
                      <Gauge size={19} />
                    </div>
                    <div className="kpi-value">
                      60<span>%</span>
                      <span className="kpi-secondary">
                        6 <small>/ 10대</small>
                      </span>
                    </div>
                    <div className="kpi-bottom">
                      <span>정상 6대 · 휴식 2대 · 고장 2대</span>
                    </div>
                    <div className="segmented-progress" aria-label="정상 60%, 휴식 20%, 고장 20%">
                      <span />
                      <span />
                      <span />
                    </div>
                  </article>
                  <article className="kpi">
                    <div className="kpi-label">
                      확인이 필요한 보고
                      <ClipboardIcon />
                    </div>
                    <div className="kpi-value">
                      2<span>건</span>
                      <span className="pill pill-amber">확인 필요</span>
                    </div>
                    <div className="kpi-bottom">
                      <span>접수 대기 1건 · 조치 중 1건</span>
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
                    <div className="kpi-caption">오늘 올라온 보고 3건</div>
                  </article>
                </div>
              </section>
              <div className="dashboard-grid">
                <div className="main-column">
                  <section className="card production-card">
                    <div className="card-heading">
                      <div>
                        <h2>생산 현황</h2>
                        <p>시간에 따른 생산량 흐름을 확인하세요.</p>
                      </div>
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
                    </div>
                    <div className="chart-summary">
                      <div>
                        <strong>
                          {period === 'today' ? '5,232' : '42,810'}
                          <span>개</span>
                        </strong>
                        <span className="positive">
                          <ArrowUpRight size={15} />
                          {period === 'today' ? '4.2%' : '6.8%'}
                          <span className="muted">이전 기간 대비</span>
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
                    <ProductionChart period={period} />
                    <div className="chart-footer">
                      <span>
                        <span className="status-dot" />
                        생산 흐름이 안정적으로 유지되고 있어요.
                      </span>
                      <button
                        className="text-link"
                        onClick={() => setOverlay({ kind: 'equipment' })}
                      >
                        공장 한눈에 보기
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </section>
                  <section className="card equipment-card">
                    <div className="card-heading">
                      <div className="heading-inline">
                        <h2>주요 설비 현황</h2>
                        <span className="pill pill-neutral">4대</span>
                      </div>
                      <label className="select-control">
                        <span className="sr-only">설비 필터</span>
                        <select
                          aria-label="설비 필터"
                          value={equipmentName}
                          onChange={(event) => setEquipmentName(event.target.value)}
                        >
                          <option>전체 설비</option>
                          {equipment.map((item) => (
                            <option key={item.name}>{item.name}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                    </div>
                    <div className="equipment-grid">
                      {visibleEquipment.map((item) => (
                        <button
                          className={`equipment-tile ${item.state === '주의' ? 'equipment-warning' : ''}`}
                          key={item.name}
                          onClick={() => setOverlay({ kind: 'equipment' })}
                        >
                          <div className="equipment-title">
                            <Factory size={19} />
                            <span
                              className={`equipment-status ${item.state === '주의' ? 'warning' : ''}`}
                            >
                              <i />
                              {item.state}
                            </span>
                          </div>
                          <strong>{item.name}</strong>
                          <span className="equipment-product">{item.product}</span>
                          <div className="equipment-progress">
                            <span style={{ width: `${item.progress}%` }} />
                          </div>
                          <div className="equipment-meta">
                            <span>작업 진행률</span>
                            <b>{item.progress}%</b>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="card reports-card" id="reports">
                    <div className="card-heading">
                      <div className="heading-inline">
                        <h2>올라온 보고</h2>
                        <span className="pill pill-neutral">3</span>
                      </div>
                      <div className="report-tabs">
                        <button
                          onClick={() => setReportFilter('전체')}
                          className={reportFilter === '전체' ? 'current' : ''}
                        >
                          전체
                        </button>
                        <button
                          onClick={() => setReportFilter('미처리')}
                          className={reportFilter === '미처리' ? 'current' : ''}
                        >
                          미처리
                        </button>
                      </div>
                    </div>
                    <div className="report-list">
                      {visibleReports.map((report) => (
                        <button
                          className="report-row"
                          key={report.id}
                          onClick={() => setOverlay({ kind: 'report', report })}
                        >
                          <span
                            className={`report-icon ${report.status === '대기' ? 'report-icon-alert' : ''}`}
                          >
                            {report.status === '대기' ? (
                              <Wrench size={19} />
                            ) : report.status === '완료' ? (
                              <CheckCheck size={19} />
                            ) : (
                              <FileText size={19} />
                            )}
                          </span>
                          <span className="report-copy">
                            <strong>{report.title}</strong>
                            <small>
                              {report.author}
                              <span>·</span>
                              {report.equipment}
                              <span>·</span>
                              {report.time}
                            </small>
                          </span>
                          <span
                            className={`pill ${report.status === '대기' ? 'pill-amber' : report.status === '완료' ? 'pill-green' : 'pill-violet'}`}
                          >
                            {report.status}
                          </span>
                          <ChevronRight className="row-arrow" size={17} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="card assistant-card" id="assistant">
                    <div className="card-heading">
                      <div className="heading-inline">
                        <span className="ai-icon">
                          <Sparkles size={21} />
                        </span>
                        <div>
                          <h2>사출반장에게 물어보세요</h2>
                          <p>오늘의 공정, 필요한 정보만 빠르게.</p>
                        </div>
                      </div>
                      <span className="pill pill-violet">AI 도우미</span>
                    </div>
                    <div className="question-chips">
                      {['오늘 공정 요약해줘', '확인할 품질 이슈는?', '다음 근무자 인수인계'].map(
                        (chip) => (
                          <button key={chip} onClick={() => askAssistant(chip)}>
                            {chip}
                            <ArrowUpRight size={14} />
                          </button>
                        ),
                      )}
                    </div>
                    {messages.length > 0 && (
                      <div className="chat-history" role="log" aria-label="도우미 대화">
                        {messages.map((message, i) => (
                          <div className={`chat-message ${message.role}`} key={i}>
                            <small>
                              {message.role === 'user' ? '민규님' : '사출반장 · 예시 응답'}
                            </small>
                            <p>{message.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <form
                      className="question-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        askAssistant(question);
                      }}
                    >
                      <Sparkles size={19} />
                      <label htmlFor="question" className="sr-only">
                        사출반장 질문
                      </label>
                      <input
                        id="question"
                        value={question}
                        onChange={(event) => setQuestion(event.target.value)}
                        maxLength={500}
                        placeholder="공정 현황에 대해 궁금한 점을 물어보세요"
                      />
                      <button type="submit" disabled={!question.trim()} aria-label="질문 보내기">
                        <ArrowRight size={21} />
                      </button>
                    </form>
                    <p className="demo-disclaimer">
                      예시 데이터에 기반한 정해진 응답입니다. 실제 AI 분석은 연동 전입니다.
                    </p>
                  </section>
                </div>
                <div className="side-column">
                  <section className="insight-card">
                    <div className="insight-label">
                      <Sparkles size={17} /> 사출반장의 품질 인사이트<span>예시</span>
                    </div>
                    <h2>
                      오늘은 이 부분을
                      <br />
                      먼저 확인해 보세요.
                    </h2>
                    <div className="insight-target">
                      <span className="insight-pulse" />
                      <strong>RG3 RH 검사 기록</strong>
                      <span className="pill pill-amber">우선 확인</span>
                    </div>
                    <p>
                      과거 불량 기록이 특정 기간에 집중되어 있어요. 해당 기간의 공정 조건과 조치
                      이력을 함께 확인해 주세요.
                    </p>
                    <div className="insight-numbers">
                      <div>
                        <small>라벨 기록 중 불량 비율</small>
                        <strong>
                          4.30<span>%</span>
                        </strong>
                      </div>
                      <div>
                        <small>10/22–23 집중 기록</small>
                        <strong>
                          25<span>/ 27건</span>
                        </strong>
                      </div>
                    </div>
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
                      <button
                        className="icon-button"
                        onClick={() => setCalendarExpanded(!calendarExpanded)}
                        aria-label={calendarExpanded ? '일정 요약 접기' : '선택 날짜 일정 펼치기'}
                        aria-expanded={calendarExpanded}
                      >
                        <CalendarDays size={19} />
                      </button>
                    </div>
                    <div className="calendar-month">
                      <strong>
                        {year}년 {month + 1}월
                      </strong>
                      <div>
                        <button
                          className="icon-button"
                          aria-label="이전 달"
                          onClick={() => changeMonth(-1)}
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="다음 달"
                          onClick={() => changeMonth(1)}
                        >
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
                      {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                        <button
                          key={day}
                          className={`calendar-day ${day === selectedDay ? 'chosen' : ''} ${year === 2026 && month === 10 && day === 17 ? 'today' : ''}`}
                          aria-label={`${month + 1}월 ${day}일, 일정 ${eventsForDay(day).length}건`}
                          aria-pressed={day === selectedDay}
                          onClick={() => {
                            setSelectedDay(day);
                            setOverlay({ kind: 'schedule', day });
                          }}
                        >
                          <span>{day}</span>
                          {eventsForDay(day).length > 0 && <i />}
                        </button>
                      ))}
                    </div>
                    <div className="calendar-schedule">
                      <div>
                        <strong>
                          {month + 1}월 {selectedDay}일{' '}
                          <span>
                            {year === 2026 && month === 10 && selectedDay === 17
                              ? '오늘'
                              : '선택일'}
                          </span>
                        </strong>
                        <span className="muted">{eventsForDay(selectedDay).length}건</span>
                      </div>
                      {eventsForDay(selectedDay).length ? (
                        eventsForDay(selectedDay)
                          .slice(0, calendarExpanded ? 10 : 2)
                          .map((event) => (
                            <button
                              className="schedule-row"
                              key={event.time}
                              onClick={() => setOverlay({ kind: 'schedule', day: selectedDay })}
                            >
                              <span
                                className={`schedule-line ${event.kind === '점검' ? 'mint' : ''}`}
                              />
                              <span>
                                <small>
                                  {event.time} · {event.kind}
                                </small>
                                <strong>{event.title}</strong>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))
                      ) : (
                        <p className="empty-text">등록된 일정이 없어요.</p>
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
                    {notes.length > 0 ? (
                      <>
                        <div className="note-preview">
                          <span
                            className={`pill ${notes[0].checked ? 'pill-green' : 'pill-amber'}`}
                          >
                            {notes[0].checked ? '확인 완료' : '미확인'}
                          </span>
                          <p>{notes[0].content}</p>
                          <small>{notes[0].author}</small>
                        </div>
                        <button
                          className="note-confirm"
                          onClick={() => {
                            const saved = saveNotes(
                              notes.map((note, index) =>
                                index === 0 ? { ...note, checked: !note.checked } : note,
                              ),
                            );
                            if (saved)
                              setToast(
                                notes[0].checked
                                  ? '노트를 미확인으로 변경했습니다.'
                                  : '인수인계 노트를 확인했습니다.',
                              );
                          }}
                        >
                          <Check size={16} />
                          {notes[0].checked ? '확인 취소' : '내용 확인했어요'}
                        </button>
                        {notes.length > 1 && (
                          <button
                            className="text-link note-more"
                            onClick={() => setOverlay({ kind: 'note' })}
                          >
                            전체 노트 {notes.length}건 보기
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="empty-text">아직 작성된 인수인계가 없어요.</p>
                    )}
                  </section>
                  <div className="shift-card">
                    <span className="shift-clock">
                      <Clock3 size={21} />
                    </span>
                    <div>
                      <strong>
                        {extended ? '연장 근무가 설정되었어요' : '오늘도 안전하게, 함께해요'}
                      </strong>
                      <p>{extended ? '데모 화면에만 적용됩니다.' : '주간 근무 · 08:00–17:00'}</p>
                    </div>
                    <button
                      onClick={() => {
                        setExtended(!extended);
                        setToast(
                          extended
                            ? '연장 근무 예시를 해제했습니다.'
                            : '연장 근무 예시를 설정했습니다. 실제 로그인 세션은 변경되지 않습니다.',
                        );
                      }}
                    >
                      {extended ? '취소' : '로그인 연장'}
                    </button>
                  </div>
                </div>
              </div>
              <footer className="page-footer">
                <span>© 2026 사출반장. 더 나은 현장을 함께 만듭니다.</span>
                <span>예시 화면 · 실제 공정 및 서버 미연동</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="알림 닫기">
            닫기
          </button>
        </div>
      )}
      {overlay && (
        <Modal
          title={
            overlay.kind === 'report'
              ? '현장 보고 상세'
              : overlay.kind === 'schedule'
                ? `${year}년 ${month + 1}월 ${overlay.day}일 일정`
                : overlay.kind === 'note'
                  ? '인수인계 노트'
                  : overlay.kind === 'equipment'
                    ? '공장 한눈에 보기'
                    : overlay.kind === 'insight'
                      ? '품질 인사이트 · 분석 근거'
                      : overlay.kind === 'notifications'
                        ? '알림'
                        : overlay.name
          }
          onClose={() => setOverlay(null)}
          wide={overlay.kind === 'equipment'}
        >
          {overlay.kind === 'report' && (
            <>
              <span className="pill pill-violet">
                {overlay.report.category} · {overlay.report.status}
              </span>
              <h3>{overlay.report.title}</h3>
              <p className="muted">
                {overlay.report.id} · {overlay.report.author} · {overlay.report.time}
              </p>
              <p>{overlay.report.description}</p>
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
                  setNoteText(
                    `${overlay.report.equipment}: ${overlay.report.title} — 조치 결과 확인 필요`,
                  );
                  setOverlay({ kind: 'note' });
                }}
              >
                인수인계 노트에 기록
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {overlay.kind === 'schedule' && (
            <>
              {eventsForDay(overlay.day).length ? (
                eventsForDay(overlay.day).map((event) => (
                  <div className="modal-event" key={event.time}>
                    <span className="pill pill-violet">{event.kind}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.time} · 생산팀 · 예시 일정</p>
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
              <p className="demo-disclaimer">일정은 2026년 11월 기준의 시연용 데이터입니다.</p>
            </>
          )}
          {overlay.kind === 'note' && (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!noteText.trim()) return;
                  const saved = saveNotes([
                    {
                      id: crypto.randomUUID(),
                      content: noteText.trim(),
                      author: `박민규 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}`,
                      checked: false,
                    },
                    ...notes,
                  ]);
                  setNoteText('');
                  if (saved) setToast('인수인계 노트를 이 브라우저에 저장했습니다.');
                }}
              >
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
                    disabled={!noteText.trim()}
                  >
                    <Plus size={16} />
                    노트 저장
                  </button>
                </div>
              </form>
              <p className="demo-disclaimer">
                노트는 현재 브라우저에만 저장됩니다. 다른 근무자와 공유되지 않습니다.
              </p>
              <div className="all-notes">
                {notes.map((note) => (
                  <article key={note.id}>
                    <div>
                      <span className={`pill ${note.checked ? 'pill-green' : 'pill-amber'}`}>
                        {note.checked ? '확인 완료' : '미확인'}
                      </span>
                      <small>{note.author}</small>
                    </div>
                    <p>{note.content}</p>
                    <button
                      className="text-link"
                      onClick={() =>
                        saveNotes(
                          notes.map((value) =>
                            value.id === note.id ? { ...value, checked: !value.checked } : value,
                          ),
                        )
                      }
                    >
                      <Check size={15} />
                      {note.checked ? '확인 취소' : '내용 확인'}
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
          {overlay.kind === 'equipment' && (
            <>
              <p className="muted">주요 설비 4대의 배치와 상태를 보여주는 예시입니다.</p>
              <div className="factory-map">
                {equipment.map((item, index) => (
                  <div
                    className={`machine ${item.state === '주의' ? 'machine-warning' : ''}`}
                    key={item.name}
                  >
                    <Factory size={34} />
                    <strong>{item.name}</strong>
                    <span>{item.product}</span>
                    <span className={`pill ${item.state === '주의' ? 'pill-amber' : 'pill-green'}`}>
                      {item.state}
                    </span>
                    <small>사출 {index < 2 ? '1' : '2'}라인</small>
                  </div>
                ))}
              </div>
              <div className="modal-callout">
                <TriangleAlert size={18} />
                <p>사출 3호기 압력 변동 확인 필요 · 설비 상태와 배치는 시연용입니다.</p>
              </div>
            </>
          )}
          {overlay.kind === 'insight' && (
            <>
              <span className="pill pill-amber">우선 조사 후보 · 원인 미확정</span>
              <h3>RG3 RH의 특정 생산일을 먼저 살펴보세요.</h3>
              <p>
                제공된 분석 참고 자료에서 RG3 RH는 라벨 기록 628건 중 불량 27건(4.30%)이며, 이 중
                25건이 2020년 10월 22–23일에 집중되어 있습니다.
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
                이 비율은 제공된 라벨 기록 기준이며 전체 생산 불량률이 아닙니다. 실시간 공정이나
                현재 설비의 고장을 의미하지 않습니다.
              </p>
              <button
                className="button button-primary"
                onClick={() => {
                  setNoteText(
                    'RG3 RH: 2020.10.22–23 검사 기록과 조치 이력 비교 필요. 원인 미확정.',
                  );
                  setOverlay({ kind: 'note' });
                }}
              >
                확인 사항을 인수인계에 기록
                <ArrowRight size={16} />
              </button>
            </>
          )}
          {overlay.kind === 'notifications' && (
            <>
              {reports.map((report) => (
                <button
                  className="notification-row"
                  key={report.id}
                  onClick={() => setOverlay({ kind: 'report', report })}
                >
                  <Bell size={18} />
                  <span>
                    <strong>{report.title}</strong>
                    <small>{report.time} · 예시 알림</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </>
          )}
          {overlay.kind === 'guide' && (
            <div className="empty-state">
              <Factory size={36} />
              <h3>
                {overlay.name === '사용 가이드'
                  ? '사출반장 홈 사용하기'
                  : `${overlay.name} 화면은 준비 중이에요`}
              </h3>
              <p>현재 홈, 생산·검사 이력, 재고 관리, 품질 리포트 화면을 사용할 수 있습니다.</p>
              <ul>
                <li>생산 현황에서 조회 기간을 바꿔 보세요.</li>
                <li>보고를 누르면 상세 내용이 열립니다.</li>
                <li>달력에서 날짜를 선택해 일정을 확인하세요.</li>
                <li>인수인계 노트를 작성하고 확인 상태를 관리하세요.</li>
                <li>하단 사출반장에서 예시 질문을 실행해 보세요.</li>
              </ul>
              <button
                className="button button-primary"
                onClick={() => {
                  setOverlay(null);
                  navigate('/');
                }}
              >
                홈으로 돌아가기
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function ClipboardIcon() {
  return <MessageSquareText size={19} />;
}
