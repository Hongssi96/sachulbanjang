import LoadingState from './components/LoadingState';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { Bell, Check, ChevronLeft, ChevronRight, Factory } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Modal from './components/Modal';
import { useAuth } from './hooks/useAuth';
import { markLoggedOut } from './utils/logoutNotice';

const RecordsPage = lazy(() => import('./pages/RecordsPage/RecordsPage'));
const RecordDetailPage = lazy(() =>
  import('./pages/RecordsPage/RecordsPage').then((module) => ({
    default: module.RecordDetailPage,
  })),
);

import { demoAsOf, reports } from './constants/demoData';

const HomePage = lazy(() => import('./pages/HomePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const RealtimePage = lazy(() => import('./pages/RealtimePage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage/InventoryPage'));
const QualityReportPage = lazy(() => import('./pages/QualityReportPage/QualityReportPage'));
const PrecisionInspectionPage = lazy(
  () => import('./pages/PrecisionInspectionPage/PrecisionInspectionPage'),
);
const ChatSearchPage = lazy(() => import('./pages/ChatSearchPage/ChatSearchPage'));
const MyPage = lazy(() => import('./pages/MyPage/MyPage'));
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
  '/mypage': '관리',
};

export default function AppShell() {
  const { user, logout } = useAuth();
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
  const [loggingOut, setLoggingOut] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const routePath = location.pathname.replace(/\/$/, '') || '/';
  const isChat = routePath === '/chat';
  // 화면 높이에 맞추고 안쪽 영역만 스크롤하는 화면들
  const fitViewport = ['/chat', '/schedule', '/reports'].includes(routePath);
  // 대화 화면은 기본으로 메뉴(사이드바)를 숨긴다. 왼쪽 가장자리 손잡이로 고정해 보이면 menu=show.
  const chatFocus = isChat && new URLSearchParams(location.search).get('menu') !== 'show';
  const setChatMenuShown = (show: boolean) => {
    const query = new URLSearchParams(location.search);
    if (show) query.set('menu', 'show');
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

  // 사이드바 버튼을 눌러 대화 화면(메뉴 숨김)에 들어오면, 그 버튼에 남은 포커스 때문에
  // 숨긴 메뉴가 펼쳐진 채 남지 않도록 포커스를 풀어 준다.
  useEffect(() => {
    const focused = document.activeElement;
    if (chatFocus && focused instanceof HTMLElement && menuRef.current?.contains(focused)) {
      focused.blur();
    }
  }, [chatFocus, location.key]);

  // 토스트는 2초 뒤 자동으로 사라진다.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleDark = () => {
    // 주간 모드로 돌아오면 연장 근무를 해제해 17시 자동 로그아웃이 다시 동작하도록 한다.
    if (dark) setExtended(false);
    setDark(!dark);
  };
  // 야근을 시작한다. 퇴근 시간 이후 자동 로그아웃된 상태에서도 바로 연장할 수 있다.
  const startOvertime = () => {
    setSessionEnded(false);
    setSessionFired(false);
    setOffWorkModalOpen(false);
    setExtended(true);
    setDark(true);
  };
  const toggleExtended = () => {
    if (sessionEnded) {
      startOvertime();
      return;
    }
    setExtended(!extended);
    setDark(!extended);
  };
  const endSession = () => {
    setSessionFired(true);
    setSessionEnded(true);
    setOffWorkModalOpen(true);
    setExtended(false);
  };
  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      markLoggedOut();
      navigate('/login', { replace: true });
    } catch {
      setToast('로그아웃하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setLoggingOut(false);
    }
  };
  const handleNavigate = (name: string) => {
    const route = menuRoutes[name];
    if (route) navigate(route);
    else setPlaceholder(name);
  };
  const askAssistant = () => navigate('/chat?chat=new');
  if (!user) return null;
  return (
    <div
      className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${dark ? 'dark' : ''} ${fitViewport ? 'fit-viewport' : ''} ${chatFocus ? 'chat-focus' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      {chatFocus && (
        // 가장자리 전체 높이: 마우스를 대면 메뉴 미리보기(키보드는 아래 손잡이를 쓴다)
        <div
          className="chat-menu-edge"
          aria-hidden="true"
          onMouseEnter={() => setPeekMenuKey(location.key)}
        />
      )}
      {isChat && (
        <button
          type="button"
          className={`chat-menu-handle ${chatFocus ? '' : 'is-pinned'}`}
          onClick={() => {
            setPeekMenuKey(null);
            setChatMenuShown(chatFocus);
          }}
          aria-label={chatFocus ? '메뉴 보이기' : '메뉴 숨기기'}
          title={chatFocus ? '메뉴 보이기' : '메뉴 숨기기'}
        >
          {chatFocus ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}
      <div
        ref={menuRef}
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
          meta={routePath === '/realtime' ? `마지막 갱신 ${demoAsOf}` : undefined}
          title={pageTitle}
          user={user}
          dark={dark}
          onToggleDark={toggleDark}
          onBell={() => setNotificationsOpen(true)}
          extended={extended}
          onToggleExtended={toggleExtended}
          sessionEnded={sessionEnded}
          sessionFired={sessionFired}
          onSessionEnd={endSession}
          onProfile={() => navigate('/mypage')}
          onLogout={handleLogout}
          loggingOut={loggingOut}
        />
        <main id="main-content">
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route
                path="/"
                element={
                  <HomePage
                    onToast={setToast}
                    extended={extended}
                    onLogout={handleLogout}
                    loggingOut={loggingOut}
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
              <Route
                path="/mypage"
                element={
                  <MyPage
                    onToast={setToast}
                    onLogout={handleLogout}
                    loggingOut={loggingOut}
                    dark={dark}
                    onToggleDark={toggleDark}
                  />
                }
              />
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
              <li>대화·검색 화면에서 질문을 실행해 보세요.</li>
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
                <small>{report.time} · 알림</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </Modal>
      )}
      {offWorkModalOpen && (
        <Modal title="퇴근 시간 알림" plain onClose={() => setOffWorkModalOpen(false)}>
          <div className="confirm-dialog">
            <p>오늘 근무가 끝났어요.</p>
            <strong>야근이 필요하면 연장 근무를 시작해 주세요.</strong>
            <div className="confirm-actions">
              <button className="button button-white" onClick={() => setOffWorkModalOpen(false)}>
                닫기
              </button>
              <button className="button button-primary" onClick={startOvertime}>
                오늘 야근
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
