import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useLoadingCompletion } from '../../hooks/useLoadingCompletion';
import AuthLoading from '../AuthLoading/AuthLoading';
import { PageEntryContext } from './PageEntryContext';
import './PageEntry.css';

interface EntryIdentity {
  pathname: string;
}

const MIN_PAGE_LOADING_MS = 1_000;

interface PageEntryProps {
  children: ReactNode;
  loading?: ReactNode;
  manageTablet?: boolean;
  finishDelayMs?: number;
}

export default function PageEntry({
  children,
  loading,
  manageTablet = false,
  finishDelayMs = 0,
}: PageEntryProps) {
  const { status, user } = useAuth();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const managed = pathname !== '/login' && (manageTablet || user?.employee_no !== 'IPAD001');
  // 검색·필터 변경은 제외하고, 다른 화면에 갔다 돌아온 경우에는 새로운 진입으로 취급한다.
  const identity = useMemo<EntryIdentity>(() => ({ pathname }), [pathname]);
  const [minimumComplete, setMinimumComplete] = useState<EntryIdentity | null>(null);
  const [readyIdentity, setReadyIdentity] = useState<EntryIdentity | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const onReady = useCallback(() => setReadyIdentity(identity), [identity]);
  // 앱 내부에서 보고 상세로 이동할 때는 페이지 전용 스켈레톤이 로딩을 담당한다.
  const reportDetailLoading =
    bootstrapped && status === 'authenticated' && /^\/reports\/[^/]+$/.test(pathname);

  useEffect(() => {
    if (!managed || reportDetailLoading) return;
    const timer = window.setTimeout(() => setMinimumComplete(identity), MIN_PAGE_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [identity, managed, reportDetailLoading]);

  const minimumPassed = minimumComplete === identity;
  const needsData = status === 'authenticated' && !user?.must_change_password;
  const pending =
    managed &&
    !reportDetailLoading &&
    (status === 'checking' || !minimumPassed || (needsData && readyIdentity !== identity));
  const completing = useLoadingCompletion(pending, finishDelayMs);
  const showLoading = managed && !reportDetailLoading && completing;
  const fullScreen = !bootstrapped || status !== 'authenticated';
  useEffect(() => {
    if (!showLoading) setBootstrapped(true);
  }, [showLoading]);

  const context = useMemo(
    () =>
      managed ? { onReady, contentLoading: showLoading && !fullScreen, preparing: pending } : null,
    [managed, onReady, showLoading, fullScreen, pending],
  );
  const canMountPage =
    !managed || status === 'authenticated' || (status === 'unauthenticated' && minimumPassed);

  return (
    <PageEntryContext.Provider value={context}>
      <div className="page-entry-content" hidden={showLoading && fullScreen}>
        {canMountPage ? children : null}
      </div>
      {showLoading && fullScreen && (
        <div className="auth-loading">
          {loading ?? <AuthLoading label="화면을 준비하고 있어요" />}
        </div>
      )}
    </PageEntryContext.Provider>
  );
}
