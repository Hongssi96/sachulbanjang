import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import TabletTasksPage from './TabletTasksPage';
import TabletEquipmentPage from './TabletEquipmentPage';
import TabletReportsPage from './TabletReportsPage';
import { initialTabletReports } from './tabletData';
import TabletQuestionFlow from './TabletQuestionFlow';
import { emptyQuestionSelection } from './questionModel';
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleHelp,
  Clock3,
  Check,
  ChevronsUp,
  HardHat,
  ClipboardCheck,
  ClipboardList,
  Factory,
  House,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Modal from '../../components/Modal';
import logo from '../../assets/logo.png';
import './TabletHomePage.css';
import './TabletTheme.css';

const checklist = [
  '작업 구역과 안전 커버 상태 확인',
  '금형 체결 및 누유 여부 확인',
  '온도·압력 계기 확인',
  '초도 제품의 외관 및 치수 확인',
];
export default function TabletHomePage() {
  const location = useLocation();
  const [tabletReports, setTabletReports] = useState(initialTabletReports);
  const screenTitle =
    (
      {
        '/': '홈',
        '/tasks': '작업 지시',
        '/equipment': '설비 현황',
        '/reports': '이상 보고',
      } as Record<string, string>
    )[location.pathname] ?? '페이지 없음';
  useEffect(() => {
    document.title = `사출반장 · ${screenTitle} · iPad`;
    window.scrollTo(0, 0);
  }, [location.pathname, screenTitle]);
  const [selection, setSelection] = useState(emptyQuestionSelection);
  const [modal, setModal] = useState<
    | 'note'
    | 'check'
    | 'manual'
    | 'contact'
    | 'report'
    | 'schedule'
    | 'equipment'
    | 'question'
    | null
  >(null);
  const [note, setNote] = useState('S14 상세에서 RG3 RH 검사 이력을 확인해 주세요.');
  const [draft, setDraft] = useState(note);
  const [acknowledged, setAcknowledged] = useState(false);
  const [checks, setChecks] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [extended, setExtended] = useState(false);
  const [report, setReport] = useState('');
  const ready = Boolean(selection.product && selection.line && selection.topic && selection.view);
  const question = ready
    ? `${selection.product}, ${selection.line}의 ${selection.period || '현재'} ${selection.topic}을 ${selection.view} 방식으로 알려줘.`
    : '제품, 라인, 확인 내용, 보기 방식을 선택해 주세요.';
  const openNote = () => {
    setDraft(note);
    setModal('note');
  };
  return (
    <div className="tablet-home">
      <aside className="th-sidebar" aria-label="현장 메뉴">
        <Link className="th-brand" to="/" aria-label="사출반장 태블릿 홈">
          <img src={logo} alt="" />
          <strong>
            사출반장<small>FIELD WORKSPACE</small>
          </strong>
        </Link>
        <span className="th-menu-label">워크스페이스</span>
        <nav>
          <NavLink to="/" end>
            <House size={19} />홈
          </NavLink>
          <NavLink to="/tasks">
            <ClipboardList size={19} />
            작업 지시
          </NavLink>
          <NavLink to="/equipment">
            <Factory size={19} />
            설비 현황
          </NavLink>
          <NavLink to="/reports">
            <TriangleAlert size={19} />
            이상 보고
          </NavLink>
        </nav>
        <div className="th-side-help">
          <span className="th-help-icon">
            <CircleHelp size={25} />
          </span>
          <strong>든든한 현장 파트너</strong>
          <p>
            주요 기능을 터치로
            <br />
            간편하게 실행하세요.
          </p>
          <button onClick={() => setModal('manual')}>
            사용 안내 <ArrowRight size={14} />
          </button>
        </div>
      </aside>
      <div className="th-workspace">
        <header className="th-header">
          <div className="th-header-location">
            <span>현장 워크스페이스</span>
            <strong>{screenTitle}</strong>
          </div>
          <div>
            <span className="th-shift-indicator">
              <i />
              주간조 <span>08:00–17:00</span>
            </span>
            <span className="th-user-avatar">민</span>
            <strong>
              박민규 <small>현장관리자</small>
            </strong>
            <button onClick={() => setExtended(!extended)}>
              {extended ? '연장 취소' : '로그인 연장'}
              <Clock3 size={15} />
            </button>
          </div>
        </header>
        <section className="th-content" id="tablet-content" aria-label="현장관리자 홈">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <div className="th-welcome">
                    <div>
                      <span className="th-card-kicker">YOUR DAILY FIELD BRIEF</span>
                      <h1>
                        좋은 하루예요, 민규님<span>.</span>
                      </h1>
                    </div>
                    <span className="th-date-chip">
                      <Clock3 size={16} />
                      2026.11.17 · 화요일
                    </span>
                  </div>
                  {feedback && (
                    <div className="th-feedback" role="status">
                      <Check size={17} />
                      {feedback}
                      <button aria-label="알림 닫기" onClick={() => setFeedback('')}>
                        닫기
                      </button>
                    </div>
                  )}
                  <section className="th-summary" aria-label="현장 품질 요약">
                    <div>
                      <span>
                        <span className="th-kpi-icon violet">
                          <ClipboardCheck size={20} />
                        </span>
                        검사 기록
                      </span>
                      <strong>
                        2,480<small>건</small>
                      </strong>
                      <p>선택 범위의 검사 완료 기록</p>
                    </div>
                    <div>
                      <span>
                        <span className="th-kpi-icon mint">
                          <ChartNoAxesCombined size={20} />
                        </span>
                        검사 불량률
                      </span>
                      <strong className="th-green">
                        2.4<small>%</small>
                      </strong>
                      <p className="th-green">↘ 이전 구간 대비 0.8%p</p>
                    </div>
                    <div>
                      <span>
                        <span className="th-kpi-icon coral">
                          <ShieldCheck size={20} />
                        </span>
                        AI 점검 대상
                      </span>
                      <strong className="th-coral">
                        18<small>건</small>
                      </strong>
                      <p className="th-amber">검사 전 위험 추정 · 실제 불량 아님</p>
                    </div>
                    <div>
                      <span>
                        <span className="th-kpi-icon cloud">
                          <Factory size={20} />
                        </span>
                        정상 가동 설비
                      </span>
                      <strong className="th-purple">
                        11<small>/ 13대</small>
                      </strong>
                      <p>주의 1대 · 미가동 1대</p>
                    </div>
                  </section>
                  <div className="th-layout">
                    <div className="th-left">
                      <section className="th-assistant card">
                        <div className="th-section-heading">
                          <div>
                            <h2>현장 도우미</h2>
                          </div>
                          <span className="th-ai-badge">
                            <ChevronsUp size={14} />
                            사출반장 AI
                          </span>
                        </div>
                        <div className="th-ai-intro">
                          <span>
                            <HardHat size={24} />
                          </span>
                          <div>
                            <strong>질문에 필요한 항목을 선택하세요</strong>
                            <p>제품, 라인, 확인 항목을 차례대로 조합할 수 있어요.</p>
                          </div>
                        </div>
                        <TabletQuestionFlow selection={selection} onChange={setSelection} />
                        <div className="th-question">
                          <small>조합된 질문</small>
                          <p>{question}</p>
                        </div>
                        <button
                          className="th-ask"
                          disabled={!ready}
                          onClick={() => setModal('question')}
                        >
                          이 조합으로 AI에게 묻기 <ArrowUpRight size={18} />
                        </button>
                      </section>
                    </div>
                    <div className="th-right">
                      <section className="th-handover card">
                        <div className="th-section-heading">
                          <div>
                            <span className="th-card-kicker">SHIFT HANDOVER</span>
                            <h2>인수인계</h2>
                            <p>{acknowledged ? '미확인 0건' : '미확인 1건'}</p>
                          </div>
                          <button onClick={openNote}>
                            <Plus size={17} /> 노트 남기기
                          </button>
                        </div>
                        <article>
                          <div className="th-note-top">
                            <strong>S14</strong>
                            <span className={acknowledged ? 'is-acknowledged' : ''}>
                              {acknowledged ? '확인 완료' : '미확인'}
                            </span>
                          </div>
                          <h3>다음에 할 일</h3>
                          <p className="th-note-text">{note}</p>
                          <small>작성 홍태휘 · 08:00</small>
                          <div className="th-note-actions">
                            <Link to="/equipment">
                              설비 상세 <ArrowRight size={17} />
                            </Link>
                            <button onClick={() => setAcknowledged(!acknowledged)}>
                              {acknowledged ? (
                                <>
                                  <Check size={17} /> 확인함
                                </>
                              ) : (
                                '확인함'
                              )}
                            </button>
                          </div>
                        </article>
                      </section>
                      <section className="th-quick card">
                        <div className="th-section-heading">
                          <h2>빠른 실행</h2>
                        </div>
                        <div>
                          <button onClick={() => setModal('check')}>
                            <span>
                              <strong>점검 시작</strong>
                              <small>설비 체크리스트</small>
                            </span>
                          </button>
                          <button onClick={() => setModal('manual')}>
                            <span>
                              <strong>매뉴얼</strong>
                              <small>표준 작업 절차</small>
                            </span>
                          </button>
                          <button onClick={openNote}>
                            <span>
                              <strong>교대 기록</strong>
                              <small>인수인계 확인</small>
                            </span>
                          </button>
                          <button onClick={() => setModal('contact')}>
                            <span>
                              <strong>비상 연락</strong>
                              <small>관리자·안전팀</small>
                            </span>
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                  <p className="th-demo">AI 추정과 실제 검사 결과를 구분해 표시합니다.</p>
                </>
              }
            />
            <Route path="/tasks" element={<TabletTasksPage />} />
            <Route path="/equipment" element={<TabletEquipmentPage />} />
            <Route
              path="/reports"
              element={
                <TabletReportsPage
                  reports={tabletReports}
                  onReport={(entry) => setTabletReports((previous) => [entry, ...previous])}
                />
              }
            />
            <Route
              path="*"
              element={
                <div className="card tp-empty">
                  <h1>화면을 찾을 수 없어요</h1>
                  <Link className="button button-primary" to="/">
                    태블릿 홈으로
                  </Link>
                </div>
              }
            />
          </Routes>
        </section>
      </div>
      {modal && (
        <Modal
          title={
            modal === 'schedule'
              ? '오늘 작업 지시'
              : modal === 'equipment'
                ? 'S14 설비 현황'
                : modal === 'question'
                  ? '현장 도우미 · 질문 확인'
                  : modal === 'note'
                    ? '인수인계 노트'
                    : modal === 'check'
                      ? '설비 점검 체크리스트'
                      : modal === 'manual'
                        ? '표준 작업 절차'
                        : modal === 'report'
                          ? '이상 보고'
                          : '비상 연락 안내'
          }
          onClose={() => setModal(null)}
        >
          {modal === 'schedule' ? (
            <div className="th-form">
              <p>2026.11.17 · 주간조 일정</p>
              <ol>
                <li>09:20 CN7 초도 검사 · 외관·치수 확인</li>
                <li>11:00 RG3 생산 조건 확인 · S14 검사 이력 점검</li>
                <li>14:00 금형 교체 지원 · 현장 안전 절차 확인</li>
              </ol>
              <button className="button button-primary" onClick={() => setModal('check')}>
                점검 시작
              </button>
            </div>
          ) : modal === 'equipment' ? (
            <div className="th-form">
              <p>
                <strong>S14 · RG3 RH</strong>
              </p>
              <p>가동 상태 미확인 · 과거 검사 기록</p>
              <p>최근 검사 30건 중 양품 28건, 불량 2건 · 검사 불량률 6.7%</p>
              <p>현재 설비 상태는 현장 계기로 확인해 주세요.</p>
              <button className="button button-white" onClick={openNote}>
                인수인계 노트 남기기
              </button>
            </div>
          ) : modal === 'question' ? (
            <div className="th-form">
              <p>
                <strong>조합한 질문</strong>
              </p>
              <p>{question}</p>
              <p>현장 태블릿에서 확인하는 화면입니다.</p>
              <p>
                관련 기록: S14 · RG3 RH 검사 기록 30건 중 불량 2건입니다. 실시간 생산량·온도·압력은
                현장 계기에서 확인해 주세요.
              </p>
              <button className="button button-white" onClick={() => setModal('check')}>
                현장 확인 항목 보기
              </button>
            </div>
          ) : modal === 'note' ? (
            <form
              className="th-form"
              onSubmit={(event) => {
                event.preventDefault();
                setNote(draft.trim());
                setAcknowledged(false);
                setModal(null);
                setFeedback('현재 화면에 인수인계 노트를 기록했어요.');
              }}
            >
              <label>
                다음 근무자에게 전달할 내용
                <textarea
                  required
                  maxLength={500}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <small>새로고침하면 초기화되는 기록입니다.</small>
              <button className="button button-primary" disabled={!draft.trim()}>
                노트 저장
              </button>
            </form>
          ) : modal === 'check' ? (
            <div className="th-form">
              <p>점검 대상: S14 · 체크리스트</p>
              {checklist.map((item) => (
                <label className="th-check" key={item}>
                  <input
                    type="checkbox"
                    checked={checks.includes(item)}
                    onChange={(event) =>
                      setChecks(
                        event.target.checked
                          ? [...checks, item]
                          : checks.filter((value) => value !== item),
                      )
                    }
                  />
                  {item}
                </label>
              ))}
              <button
                className="button button-primary"
                disabled={checks.length !== checklist.length}
                onClick={() => {
                  setModal(null);
                  setFeedback('점검 항목을 모두 확인했어요.');
                }}
              >
                점검 완료 기록
              </button>
            </div>
          ) : modal === 'report' ? (
            <form
              className="th-form"
              onSubmit={(event) => {
                event.preventDefault();
                setModal(null);
                setReport('');
                setFeedback('이상 내용을 기록했어요.');
              }}
            >
              <label>
                설비와 이상 내용
                <textarea
                  required
                  value={report}
                  onChange={(event) => setReport(event.target.value)}
                  placeholder="예: S14 압력 변동 발생"
                />
              </label>
              <button className="button button-primary" disabled={!report.trim()}>
                보고 기록
              </button>
            </form>
          ) : modal === 'manual' ? (
            <div className="th-form">
              <p>현장 작업 전 확인 순서</p>
              <ol>
                {checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <p>실제 작업에는 사업장의 승인된 최신 매뉴얼을 사용해 주세요.</p>
              <button className="button button-white" onClick={() => setModal('check')}>
                현장 점검 시작 <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="th-form">
              <p>관리자·안전팀 연락처는 아직 연결되지 않았습니다.</p>
              <p>현장에 게시된 비상 연락망과 사내 대응 절차를 확인해 주세요.</p>
              <button className="button button-white" onClick={() => setModal('report')}>
                이상 보고 작성
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
