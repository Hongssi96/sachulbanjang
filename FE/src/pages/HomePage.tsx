import { formatDate } from '../utils/dateFormat';
import { useState } from 'react';
import {
  ArrowDownRight,
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
import Modal from '../components/Modal';
import ProductionChart from '../components/ProductionChart';
import SegmentedControl from '../components/SegmentedControl';
import { demoAsOf, equipment, reportPosts, sortedReportPosts } from '../constants/demoData';
import { useCalendarEvents } from '../services/calendarStore';
import { getReportStatus, useReportStatusVersion } from '../services/reportStatus';
import type { HandoverNote, Report } from '../types';

type Overlay =
  | { kind: 'report'; report: Report }
  | { kind: 'schedule'; day: number }
  | { kind: 'note' }
  | { kind: 'equipment' }
  | { kind: 'insight' }
  | null;

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
interface HomePageProps {
  onToast: (message: string) => void;
  extended: boolean;
  onLogout: () => void;
  loggingOut: boolean;
}
export default function HomePage({ onToast, extended, onLogout, loggingOut }: HomePageProps) {
  // 일정관리 탭과 같이 오늘 날짜를 기본으로 보여준다.
  const today = new Date();
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [notes, setNotes] = useState<HandoverNote[]>(loadNotes);
  const [noteText, setNoteText] = useState('');
  const [reportFilter, setReportFilter] = useState('전체');
  const [announcementRead, setAnnouncementRead] = useState(false);
  useReportStatusVersion();
  const allEvents = useCalendarEvents();
  const unreadNotes = notes.filter((note) => !note.checked).length;
  const latestReports = sortedReportPosts.slice(0, 3);
  const visibleReports = latestReports.filter(
    (report) => reportFilter === '전체' || getReportStatus(report) !== '완료',
  );
  const reportStatuses = reportPosts.map((report) => getReportStatus(report));
  const pendingCount = reportStatuses.filter((status) => status !== '완료').length;
  const waitingCount = reportStatuses.filter((status) => status === '대기').length;
  const inProgressCount = reportStatuses.filter((status) => status === '진행 중').length;
  const demoToday = sortedReportPosts[0]?.date;
  const todayReportCount = demoToday
    ? reportPosts.filter((report) => report.date === demoToday).length
    : 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const eventsForDay = (day: number) =>
    year === 2026
      ? allEvents.filter((event) => (event.month ?? 10) === month && event.day === day)
      : [];
  // 선택한 날짜의 일정은 시간순으로 보여준다.
  const selectedEvents = eventsForDay(selectedDay)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));
  const saveNotes = (next: HandoverNote[]) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTE_KEY, JSON.stringify(next));
      return true;
    } catch {
      onToast('브라우저 저장소를 사용할 수 없어 새로고침하면 노트가 사라집니다.');
      return false;
    }
  };
  const changeMonth = (direction: number) => {
    const date = new Date(year, month + direction, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setSelectedDay(1);
  };
  const downloadSummary = () => {
    const csv =
      '\uFEFF구분,값,기준\n생산량,"5,232개",오늘\n검사 불량률,1.15%,오늘\n가동률,60%,오늘\n미처리 보고,2건,오늘\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '사출반장_홈요약.csv';
    link.click();
    URL.revokeObjectURL(url);
    onToast('홈 요약을 CSV로 내려받았습니다.');
  };
  return (
    <>
      <section className="page-intro">
        <div>
          <h1>
            좋은 하루예요, 민규님<span className="greeting-dot">.</span>
          </h1>
        </div>
        <div className="intro-actions">
          <span className="date-label">
            <CalendarDays size={17} />
            2026.11.17 (화)
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
          <h2 id="overview-heading">오늘의 공정 요약 </h2>
          <span className="muted">마지막 갱신 {demoAsOf}</span>
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
                <ArrowUpRight size={14} /> 어제 대비 4.2%
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
                <ArrowDownRight size={14} /> 어제 대비 0.32%p
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
              {pendingCount}
              <span>건</span>
              <span className="pill pill-amber">확인 필요</span>
            </div>
            <div className="kpi-bottom">
              <span>
                접수 대기 {waitingCount}건 · 조치 중 {inProgressCount}건
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
            <div className="kpi-caption">오늘 올라온 보고 {todayReportCount}건</div>
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
                <span className="pill pill-neutral">{latestReports.length}</span>
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
              {visibleReports.map((report) => {
                const reportStatus = getReportStatus(report);
                return (
                  <button
                    className="report-row"
                    key={report.id}
                    onClick={() => setOverlay({ kind: 'report', report })}
                  >
                    <span
                      className={`report-icon ${reportStatus === '대기' ? 'report-icon-alert' : ''}`}
                    >
                      {reportStatus === '대기' ? (
                        <Wrench size={19} />
                      ) : reportStatus === '완료' ? (
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
                      className={`pill ${reportStatus === '대기' ? 'pill-amber' : reportStatus === '완료' ? 'pill-green' : 'pill-violet'}`}
                    >
                      {reportStatus}
                    </span>
                    <ChevronRight className="row-arrow" size={17} />
                  </button>
                );
              })}
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
                  <span className={`pill ${notes[0].checked ? 'pill-green' : 'pill-amber'}`}>
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
                      onToast(
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
              <strong>RG3 RH 검사 기록</strong>
              <span className="pill pill-amber">우선 확인</span>
            </div>
            <p>
              과거 불량 기록이 특정 기간에 집중되어 있어요. 해당 기간의 공정 조건과 조치 이력을 함께
              확인해 주세요.
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
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => (
                <button
                  key={day}
                  className={`calendar-day ${day === selectedDay ? 'chosen' : ''} ${
                    year === today.getFullYear() &&
                    month === today.getMonth() &&
                    day === today.getDate()
                      ? 'today'
                      : ''
                  }`}
                  aria-label={`${month + 1}월 ${day}일, 일정 ${eventsForDay(day).length}건`}
                  aria-pressed={day === selectedDay}
                  onClick={() => setSelectedDay(day)}
                >
                  <span>{day}</span>
                  {eventsForDay(day).length > 0 && <i />}
                </button>
              ))}
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
                <span className="muted">{selectedEvents.length}건</span>
              </div>
              {selectedEvents.length ? (
                selectedEvents.map((event) => (
                  <div className="schedule-row" key={`${event.time}-${event.title}`}>
                    <span className={`schedule-line ${event.kind === '점검' ? 'mint' : ''}`} />
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
            <p>{extended ? '현재 화면에만 적용됩니다.' : '주간 근무 · 08:00–17:00'}</p>
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
              <span className="pill pill-violet">
                {overlay.report.category} · {getReportStatus(overlay.report)}
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
                  <div className="modal-event" key={`${event.time}-${event.title}`}>
                    <span className="pill pill-violet">{event.kind}</span>
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
                  if (saved) onToast('인수인계 노트를 이 브라우저에 저장했습니다.');
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
              <p className="muted">설비 배치와 상태를 보여줍니다.</p>
              <div className="factory-map">
                {equipment.map((item, index) => (
                  <div
                    className={`machine machine-state-${item.state === '고장' ? 'fault' : item.state === '휴식' ? 'rest' : item.state === '주의' ? 'warning' : 'normal'}`}
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
                <p>사출 3호기 압력 변동 확인이 필요합니다.</p>
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
        </Modal>
      )}
    </>
  );
}
function ClipboardIcon() {
  return <MessageSquareText size={19} />;
}
