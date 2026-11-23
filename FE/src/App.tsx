import { Navigate, Route, Routes, useLocation } from 'react-router';
import AppShell from './AppShell';
import LoadingState from './components/LoadingState';
import LoginPage from './pages/LoginPage/LoginPage';
import { useAuth } from './hooks/useAuth';

function ProtectedShell() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="auth-loading">
        <LoadingState label="로그인 상태를 확인하는 중이에요" />
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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedShell />} />
    </Routes>
  );
}
