import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from '../api/auth';
import type { AuthenticatedUser } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthContext } from './authContext';
import type { AuthStatus } from './authContext';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function restoreSession(): Promise<AuthenticatedUser> {
  try {
    return await getCurrentUser();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }

  try {
    return await refreshSession();
  } catch (error) {
    // 같은 세션의 다른 탭이 갱신 중이면 잠시 뒤 한 번만 다시 시도한다.
    if (
      error instanceof ApiError &&
      error.code === 'REFRESH_IN_PROGRESS' &&
      error.retryAfterSeconds !== undefined
    ) {
      await delay(Math.max(1, error.retryAfterSeconds) * 1000);
      return refreshSession();
    }
    throw error;
  }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const restoreRequest = useRef<Promise<AuthenticatedUser> | null>(null);

  useEffect(() => {
    let active = true;
    // StrictMode의 effect 재실행에도 세션 복원 요청은 한 번만 보낸다.
    restoreRequest.current ??= restoreSession();
    restoreRequest.current
      .then((restoredUser) => {
        if (!active) return;
        setUser(restoredUser);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (employeeNo: string, password: string) => {
    const authenticatedUser = await loginRequest(employeeNo, password);
    setUser(authenticatedUser);
    setStatus('authenticated');
    return authenticatedUser;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await getCurrentUser());
  }, []);

  const updateUser = useCallback((nextUser: AuthenticatedUser) => {
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const expired = () => {
      setUser(null);
      setStatus('unauthenticated');
    };
    window.addEventListener('imleader-session-expired', expired);
    return () => window.removeEventListener('imleader-session-expired', expired);
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, refreshUser, updateUser }),
    [status, user, login, logout, refreshUser, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
