import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Sidebar from './components/Sidebar';
import LiveHeader from './pages/Connected/LiveHeader';
import LiveRoutes from './pages/Connected/LiveRoutes';
import TabletPasswordDialog from './pages/TabletHomePage/TabletPasswordDialog';
import { useAuth } from './hooks/useAuth';
const ConnectedTabletApp = lazy(() => import('./pages/Connected/ConnectedTabletApp'));

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
export default function AppShell() {
  const { user, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const active =
    Object.entries(menuRoutes).find(
      ([, path]) =>
        path === location.pathname || (path !== '/' && location.pathname.startsWith(`${path}/`)),
    )?.[0] ?? '현장 정보';
  if (!user) return null;
  if (user.employee_no === 'IPAD001')
    return (
      <Suspense fallback={<div role="status">아이패드 화면을 여는 중이에요…</div>}>
        <ConnectedTabletApp />
      </Suspense>
    );
  if (user.must_change_password)
    return <TabletPasswordDialog onSave={refreshUser} onClose={() => undefined} />;
  return (
    <div className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        active={active}
        onNavigate={(name) => {
          if (menuRoutes[name]) navigate(menuRoutes[name]);
        }}
        onAssistant={() => navigate('/chat')}
      />
      <div className="workspace">
        <LiveHeader title={active} />
        <main id="main-content">
          <LiveRoutes />
        </main>
      </div>
    </div>
  );
}
