import { createContext } from 'react';
import type { AuthenticatedUser } from '../api/auth';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  login: (employeeNo: string, password: string) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
