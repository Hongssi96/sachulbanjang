import { Navigate, NavLink, useLocation } from 'react-router';
import { ClipboardList, Factory, House, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import LoadingState from '../../components/LoadingState';
import TabletAccountDialog from '../TabletHomePage/TabletAccountDialog';
import logo from '../../assets/logo.png';
import LiveRoutes from './LiveRoutes';
import LiveHeader from './LiveHeader';
import TabletPasswordDialog from '../TabletHomePage/TabletPasswordDialog';
import '../TabletHomePage/TabletHomePage.css';
import '../TabletHomePage/TabletTheme.css';
import './Connected.css';

export default function ConnectedTabletApp() {
  const { user, status, refreshUser } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <LoadingState label="로그인 상태를 확인하고 있어요" />;
  if (location.pathname === '/login')
    return user && !user.must_change_password ? (
      <Navigate to="/" replace />
    ) : (
      <TabletAccountDialog
        page
        onClose={() => {
          window.location.hash = '/';
        }}
        onLoginOpen={() => {
          window.location.hash = '/login';
        }}
      />
    );
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password)
    return <TabletPasswordDialog onSave={refreshUser} onClose={() => undefined} />;
  const names: Record<string, string> = {
    '/': '홈',
    '/tasks': '작업 지시',
    '/equipment': '설비 현황',
    '/reports': '이상 보고',
    '/inventory': '재고 관리',
    '/quality-reports': '품질 리포트',
    '/records': '생산·검사 이력',
    '/handover': '인수인계',
  };
  return (
    <div className="tablet-home">
      <aside className="th-sidebar" aria-label="현장 메뉴">
        <NavLink className="th-brand" to="/">
          <img src={logo} alt="" />
          <strong>사출반장</strong>
        </NavLink>
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
          <strong>든든한 현장 파트너</strong>
          <p>서버에 저장된 현장 정보를 확인하세요.</p>
        </div>
      </aside>
      <div className="th-workspace">
        <LiveHeader title={names[location.pathname] ?? '현장 정보'} tablet />
        <section className="th-content">
          <LiveRoutes tablet />
        </section>
      </div>
    </div>
  );
}
