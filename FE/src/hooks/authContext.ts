import { createContext } from 'react';
import type { AuthenticatedUser } from '../api/auth';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  login: (employeeNo: string, password: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
  /** 비밀번호 변경처럼 서버가 돌려준 최신 사용자 정보로 상태를 갱신할 때 쓴다. */
  updateUser: (user: AuthenticatedUser) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
