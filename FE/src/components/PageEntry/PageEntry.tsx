import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import AuthLoading from '../AuthLoading/AuthLoading';
import { PageEntryContext } from './PageEntryContext';
import './PageEntry.css';

interface EntryIdentity {
  pathname: string;
}

const MIN_PAGE_LOADING_MS = 1_000;

export default function PageEntry({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const managed = pathname !== '/login' && user?.employee_no !== 'IPAD001';
  // 검색·필터 변경은 제외하고, 다른 화면에 갔다 돌아온 경우에는 새로운 진입으로 취급한다.
  const identity = useMemo<EntryIdentity>(() => ({ pathname }), [pathname]);
  const [minimumComplete, setMinimumComplete] = useState<EntryIdentity | null>(null);
  const [readyIdentity, setReadyIdentity] = useState<EntryIdentity | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const onReady = useCallback(() => setReadyIdentity(identity), [identity]);

  useEffect(() => {
    if (!managed) return;
    const timer = window.setTimeout(() => setMinimumComplete(identity), MIN_PAGE_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [identity, managed]);

  const minimumPassed = minimumComplete === identity;
  const needsData = status === 'authenticated' && !user?.must_change_password;
  const pending =
    managed &&
    (status === 'checking' || !minimumPassed || (needsData && readyIdentity !== identity));
  const fullScreen = !bootstrapped || status !== 'authenticated';
  useEffect(() => {
    if (!pending) setBootstrapped(true);
  }, [pending]);

  const context = useMemo(
    () => (managed ? { onReady, contentLoading: pending && !fullScreen } : null),
    [managed, onReady, pending, fullScreen],
  );
  const canMountPage =
    !managed || status === 'authenticated' || (status === 'unauthenticated' && minimumPassed);

  return (
    <PageEntryContext.Provider value={context}>
      <div className="page-entry-content" hidden={pending && fullScreen}>
        {canMountPage ? children : null}
      </div>
      {pending && fullScreen && (
        <div className="auth-loading">
          <AuthLoading label="화면을 준비하고 있어요" />
        </div>
      )}
    </PageEntryContext.Provider>
  );
}
