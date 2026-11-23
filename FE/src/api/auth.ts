import { ApiError, apiRequest } from './client';

export interface AuthenticatedUser {
  id: number;
  employee_no: string;
  display_name: string;
  role: 'admin' | 'worker';
  must_change_password: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAuthenticatedUser(payload: unknown): AuthenticatedUser {
  if (
    !isRecord(payload) ||
    typeof payload.id !== 'number' ||
    typeof payload.employee_no !== 'string' ||
    typeof payload.display_name !== 'string' ||
    (payload.role !== 'admin' && payload.role !== 'worker') ||
    typeof payload.must_change_password !== 'boolean'
  ) {
    throw new ApiError('로그인 응답 형식이 올바르지 않습니다.', {
      status: 500,
      code: 'INVALID_RESPONSE',
    });
  }

  return {
    id: payload.id,
    employee_no: payload.employee_no,
    display_name: payload.display_name,
    role: payload.role,
    must_change_password: payload.must_change_password,
  };
}

export async function login(employeeNo: string, password: string): Promise<AuthenticatedUser> {
  const payload = await apiRequest<unknown>('/auth/login', {
    method: 'POST',
    body: { employee_no: employeeNo, password },
  });
  return parseAuthenticatedUser(payload);
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  return parseAuthenticatedUser(await apiRequest<unknown>('/auth/me'));
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthenticatedUser> {
  const payload = await apiRequest<unknown>('/auth/password', {
    method: 'PATCH',
    body: { current_password: currentPassword, new_password: newPassword },
    csrf: true,
  });
  return parseAuthenticatedUser(payload);
}

export async function refreshSession(): Promise<AuthenticatedUser> {
  const payload = await apiRequest<unknown>('/auth/refresh', {
    method: 'POST',
    csrf: true,
  });
  return parseAuthenticatedUser(payload);
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST', csrf: true });
}
