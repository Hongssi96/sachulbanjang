import { Navigate, Route, Routes, useLocation } from 'react-router';
import AppShell from './AppShell';
import AuthLoading from './components/AuthLoading/AuthLoading';
import LoginPage from './pages/LoginPage/LoginPage';
import { useAuth } from './hooks/useAuth';
import { useMinimumAuthLoading } from './hooks/useMinimumAuthLoading';
import PageEntry from './components/PageEntry/PageEntry';

function ProtectedShell() {
  const { status, user } = useAuth();
  const location = useLocation();
  const authLoading = useMinimumAuthLoading(status);

  if (authLoading && user?.employee_no !== 'IPAD001') {
    return (
      <div className="auth-loading">
        <AuthLoading label="로그인 상태를 확인하는 중이에요" />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <AppShell />;
}

export default function App() {
  return (
    <PageEntry>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </PageEntry>
  );
}
