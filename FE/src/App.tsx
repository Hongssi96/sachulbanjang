import LoadingState from './components/LoadingState';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { Bell, Check, ChevronRight, Factory, LogOut, PanelLeftOpen, Maximize2 } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Modal from './components/Modal';

const RecordsPage = lazy(() => import('./pages/RecordsPage/RecordsPage'));
const RecordDetailPage = lazy(() =>
  import('./pages/RecordsPage/RecordsPage').then((module) => ({
    default: module.RecordDetailPage,
  })),
);

import { reports } from './constants/demoData';

const HomePage = lazy(() => import('./pages/HomePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const RealtimePage = lazy(() => import('./pages/RealtimePage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage/InventoryPage'));
const QualityReportPage = lazy(() => import('./pages/QualityReportPage/QualityReportPage'));
const PrecisionInspectionPage = lazy(
  () => import('./pages/PrecisionInspectionPage/PrecisionInspectionPage'),
);
const ChatSearchPage = lazy(() => import('./pages/ChatSearchPage/ChatSearchPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage/ReportsPage'));
const ReportDetailPage = lazy(() => import('./pages/ReportsPage/ReportDetailPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const menuRoutes: Record<string, string> = {
  홈: '/',
  '실시간 공정': '/realtime',
  '일정 관리': '/schedule',
  '생산·검사 이력': '/records',
  '재고 관리': '/inventory',
  '품질 리포트': '/quality-reports',
  '올라온 보고': '/reports',
  '과거 대화 이력 + 검색': '/chat',
};

const routeTitles: Record<string, string> = {
  '/': '홈',
  '/realtime': '실시간 공정',
  '/schedule': '일정 관리',
  '/records': '생산·검사 이력',
  '/inventory': '재고 관리',
  '/quality-reports': '품질 리포트',
  '/reports': '올라온 보고',
  '/chat': '대화·검색',
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [peekMenuKey, setPeekMenuKey] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState('');
  const [extended, setExtended] = useState(false);
  const [placeholder, setPlaceholder] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionFired, setSessionFired] = useState(false);
  const [offWorkModalOpen, setOffWorkModalOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const routePath = location.pathname.replace(/\/$/, '') || '/';
  const isChat = routePath === '/chat';
  const chatFocus = isChat && new URLSearchParams(location.search).get('menu') !== 'show';
  const toggleChatMenu = () => {
    const query = new URLSearchParams(location.search);
    if (chatFocus) query.set('menu', 'show');
    else query.delete('menu');
    navigate({ pathname: location.pathname, search: query.toString() }, { replace: true });
  };
  const activeMenu =
    Object.entries(menuRoutes).find(
      ([, route]) => route === routePath || (route !== '/' && routePath.startsWith(route + '/')),
    )?.[0] ?? '';
  const pageTitle = routePath.endsWith('/precision-inspection')
    ? '정밀기계검사'
    : routePath.startsWith('/records/')
      ? '생산·검사 상세'
      : routePath.startsWith('/reports/')
        ? '보고 상세'
        : (routeTitles[routePath] ?? '페이지 없음');

  useEffect(() => {
    document.title = `사출반장 · ${pageTitle}`;
    workspaceRef.current?.scrollTo(0, 0);
  }, [location.pathname, pageTitle]);

  const toggleDark = () => {
    // 주간 모드로 돌아오면 연장 근무를 해제해 17시 자동 로그아웃이 다시 동작하도록 한다.
    if (dark) setExtended(false);
    setDark(!dark);
  };
  const toggleExtended = () => {
    if (sessionEnded) {
      setToast('퇴근 시간 이후에는 연장할 수 없어요. 다시 로그인해 주세요.');
      return;
    }
    setExtended(!extended);
    setDark(!extended);
    setToast(
      extended
        ? '연장 근무 예시를 해제했습니다. 화면 테마를 원래대로 되돌렸어요.'
        : '연장 근무 예시를 설정했습니다. 화면을 야근 모드로 전환했어요.',
    );
  };
  const endSession = () => {
    setSessionFired(true);
    setSessionEnded(true);
    setOffWorkModalOpen(true);
    setExtended(false);
  };
  const logout = () => {
    setSessionFired(true);
    setSessionEnded(true);
    setExtended(false);
    setDark(false);
    setToast('로그아웃되었습니다. 오늘 하루 수고하셨어요!');
  };
  const relogin = () => {
    setSessionEnded(false);
    setSessionFired(false);
    setOffWorkModalOpen(false);
    setExtended(true);
    setDark(true);
    setToast('예시 로그인 세션을 다시 시작했어요. 오늘 야근 모드로 시작합니다.');
  };
  const handleNavigate = (name: string) => {
    const route = menuRoutes[name];
    if (route) navigate(route);
    else setPlaceholder(name);
  };
  const askAssistant = () => navigate('/chat?chat=new');
  return (
    <div
      className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${dark ? 'dark' : ''} ${chatFocus ? 'chat-focus' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      {chatFocus && (
        <button
          type="button"
          className="chat-menu-edge"
          aria-label="메뉴 미리보기"
          onMouseEnter={() => setPeekMenuKey(location.key)}
          onFocus={() => setPeekMenuKey(location.key)}
        />
      )}
      <div
        className={`chat-hover-menu ${chatFocus && peekMenuKey === location.key ? 'is-open' : ''}`}
        onMouseLeave={() => setPeekMenuKey(null)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setPeekMenuKey(null);
        }}
      >
        <Sidebar
          collapsed={chatFocus ? false : collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          active={activeMenu}
          onNavigate={handleNavigate}
          onAssistant={askAssistant}
        />
      </div>
      <div className="workspace" ref={workspaceRef}>
        <Topbar
          title={pageTitle}
          dark={dark}
          onToggleDark={toggleDark}
          onBell={() => setNotificationsOpen(true)}
          extended={extended}
          onToggleExtended={toggleExtended}
          sessionEnded={sessionEnded}
          sessionFired={sessionFired}
          onSessionEnd={endSession}
          onLogout={logout}
          onRelogin={relogin}
        />
        <main id="main-content">
          {isChat && (
            <div className="chat-display-controls">
              <span>{chatFocus ? '대화·검색' : ''}</span>
              <button
                type="button"
                className="button button-white"
                onClick={toggleChatMenu}
                aria-expanded={!chatFocus}
              >
                {chatFocus ? <PanelLeftOpen size={17} /> : <Maximize2 size={17} />}
                {chatFocus ? '메뉴 보이기' : '메뉴 숨기고 확대'}
              </button>
            </div>
          )}
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    onToast={setToast}
                    extended={extended}
                    onToggleExtended={toggleExtended}
                  />
                }
              />
              <Route path="/realtime" element={<RealtimePage />} />
              <Route path="/schedule" element={<SchedulePage onToast={setToast} />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/records/:recordId" element={<RecordDetailPage />} />
              <Route
                path="/records/:recordId/precision-inspection"
                element={<PrecisionInspectionPage />}
              />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/quality-reports" element={<QualityReportPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:reportId" element={<ReportDetailPage />} />
              <Route path="/chat" element={<ChatSearchPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
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
      {placeholder && (
        <Modal title={placeholder} onClose={() => setPlaceholder('')}>
          <div className="empty-state">
            <Factory size={36} />
            <h3>
              {placeholder === '사용 가이드'
                ? '사출반장 홈 사용하기'
                : `${placeholder} 화면은 준비 중이에요`}
            </h3>
            <p>현재 홈·실시간 공정·일정·재고·품질·검사·보고·대화/검색 화면을 사용할 수 있습니다.</p>
            <ul>
              <li>생산 현황에서 조회 기간을 바꿔 보세요.</li>
              <li>보고를 누르면 상세 내용이 열립니다.</li>
              <li>달력에서 날짜를 선택해 일정을 확인하세요.</li>
              <li>인수인계 노트를 작성하고 확인 상태를 관리하세요.</li>
              <li>대화·검색 화면에서 예시 질문을 실행해 보세요.</li>
            </ul>
            <button className="button button-primary" onClick={() => setPlaceholder('')}>
              닫기
            </button>
          </div>
        </Modal>
      )}
      {notificationsOpen && (
        <Modal title="알림" onClose={() => setNotificationsOpen(false)}>
          {reports.map((report) => (
            <button
              className="notification-row"
              key={report.id}
              onClick={() => {
                setNotificationsOpen(false);
                setToast('보고 상세 화면은 준비 중이에요.');
              }}
            >
              <Bell size={18} />
              <span>
                <strong>{report.title}</strong>
                <small>{report.time} · 예시 알림</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </Modal>
      )}
      {offWorkModalOpen && (
        <Modal title="퇴근 시간 알림" onClose={() => setOffWorkModalOpen(false)}>
          <div className="empty-state">
            <LogOut size={36} />
            <h3>퇴근시간이에요!</h3>
            <p>오늘 근무가 끝났어요. 로그인 세션이 종료되었어요.</p>
            <button className="button button-primary" onClick={relogin}>
              다시 로그인
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
