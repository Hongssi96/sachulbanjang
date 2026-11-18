import { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router';
import { Bell, Check, ChevronRight, Factory, LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Modal from './components/Modal';
import HomePage from './pages/HomePage';
import SchedulePage from './pages/SchedulePage';
import RealtimePage from './pages/RealtimePage';
import InventoryPage from './pages/InventoryPage/InventoryPage';
import QualityReportPage from './pages/QualityReportPage/QualityReportPage';
import RecordsPage, { RecordDetailPage } from './pages/RecordsPage/RecordsPage';
import PrecisionInspectionPage from './pages/PrecisionInspectionPage/PrecisionInspectionPage';
import ChatSearchPage from './pages/ChatSearchPage/ChatSearchPage';
import NotFoundPage from './pages/NotFoundPage';
import { reports } from './constants/demoData';

const menuRoutes: Record<string, string> = {
  홈: '/',
  '실시간 공정': '/realtime',
  '일정 관리': '/schedule',
  '생산·검사 이력': '/records',
  '재고 관리': '/inventory',
  '품질 리포트': '/quality-reports',
  '과거 대화 이력 + 검색': '/chat',
};

const routeTitles: Record<string, string> = {
  '/': '홈',
  '/realtime': '실시간 공정',
  '/schedule': '일정 관리',
  '/records': '생산·검사 이력',
  '/inventory': '재고 관리',
  '/quality-reports': '품질 리포트',
  '/chat': '대화·검색',
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
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
  const activeMenu =
    Object.entries(menuRoutes).find(
      ([, route]) => route === routePath || (route !== '/' && routePath.startsWith(route + '/')),
    )?.[0] ?? '';
  const pageTitle = routePath.endsWith('/precision-inspection')
    ? '정밀기계검사'
    : routePath.startsWith('/records/')
      ? '생산·검사 상세'
      : (routeTitles[routePath] ?? '페이지 없음');

  useEffect(() => {
    document.title = `사출반장 · ${pageTitle}`;
    workspaceRef.current?.scrollTo(0, 0);
  }, [location.pathname, pageTitle]);

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
  const relogin = () => {
    setSessionEnded(false);
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
  const askAssistant = () => {
    const focus = () => {
      document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('question')?.focus({ preventScroll: true });
    };
    if (location.pathname !== '/') {
      setToast('홈 사출반장으로 이동했어요. 이어서 질문해 주세요.');
      navigate('/');
      window.setTimeout(focus, 120);
    } else {
      focus();
    }
  };
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''} ${dark ? 'dark' : ''}`}>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        active={activeMenu}
        onNavigate={handleNavigate}
        onAssistant={askAssistant}
      />
      <div className="workspace" ref={workspaceRef}>
        <Topbar
          title={pageTitle}
          dark={dark}
          onToggleDark={() => setDark(!dark)}
          onBell={() => setNotificationsOpen(true)}
          extended={extended}
          onToggleExtended={toggleExtended}
          sessionEnded={sessionEnded}
          sessionFired={sessionFired}
          onSessionEnd={endSession}
          onRelogin={relogin}
        />
        <main id="main-content">
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
            <Route
              path="/realtime"
              element={
                <RealtimePage onOpenPlaceholder={setPlaceholder} onAskAssistant={askAssistant} />
              }
            />
            <Route path="/schedule" element={<SchedulePage onToast={setToast} />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:recordId" element={<RecordDetailPage />} />
            <Route
              path="/records/:recordId/precision-inspection"
              element={<PrecisionInspectionPage />}
            />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/quality-reports" element={<QualityReportPage />} />
            <Route path="/chat" element={<ChatSearchPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
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
            <p>현재 홈·실시간 공정·일정·재고·품질·검사·대화/검색 화면을 사용할 수 있습니다.</p>
            <ul>
              <li>생산 현황에서 조회 기간을 바꿔 보세요.</li>
              <li>보고를 누르면 상세 내용이 열립니다.</li>
              <li>달력에서 날짜를 선택해 일정을 확인하세요.</li>
              <li>인수인계 노트를 작성하고 확인 상태를 관리하세요.</li>
              <li>하단 사출반장에서 예시 질문을 실행해 보세요.</li>
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
            <p>오늘 근무가 끝났어요. 로그인 세션이 자동으로 종료되었어요.</p>
            <button className="button button-primary" onClick={relogin}>
              다시 로그인
            </button>
            <p className="demo-disclaimer">
              예시 세션 동작이며, 실제 로그인·인증은 아직 연동 전입니다.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
