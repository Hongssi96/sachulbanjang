import { useEffect, useState } from 'react';
import type { AuthStatus } from './authContext';

/** 인증 처리를 지연시키지 않고 최초 인증 로딩 화면만 최소 1초 유지한다. */
export function useMinimumAuthLoading(status: AuthStatus): boolean {
  const [minimumPassed, setMinimumPassed] = useState(status !== 'checking');
  useEffect(() => {
    if (minimumPassed) return;
    const timer = window.setTimeout(() => setMinimumPassed(true), 1000);
    return () => window.clearTimeout(timer);
  }, [minimumPassed]);
  return status === 'checking' || !minimumPassed;
}
