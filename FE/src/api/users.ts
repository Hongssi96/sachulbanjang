import { apiRequest } from './client';
import {
  asArray,
  asBoolean,
  asEnum,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  parsePagination,
  toQuery,
} from './json';
import type { ListResponse } from './types';

export type UserRole = 'admin' | 'worker';

export interface UserListItem {
  user_id: number;
  employee_no: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  shift_start_local: string;
  shift_end_local: string;
  version: number;
}

export interface UserDetail extends UserListItem {
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
}

export interface AccountAuditEvent {
  event_id: number;
  action: string;
  actor_id: number;
  actor_display_name: string;
  target_user_id: number;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateUserInput {
  employeeNo: string;
  displayName: string;
  role: UserRole;
  shiftStartLocal: string;
  shiftEndLocal: string;
}

export interface UserCreateResult {
  user_id: number;
  employee_no: string;
  display_name: string;
  role: UserRole;
  shift_start_local: string;
  shift_end_local: string;
  temporary_password: string;
  must_change_password: boolean;
  version: number;
}

export interface UserUpdateInput {
  version: number;
  displayName?: string;
  role?: UserRole;
  shiftStartLocal?: string;
  shiftEndLocal?: string;
}

function parseUserItem(value: unknown, field: string): UserListItem {
  const item = asRecord(value, field);
  return {
    user_id: asNumber(item.user_id, `${field}.user_id`),
    employee_no: asString(item.employee_no, `${field}.employee_no`),
    display_name: asString(item.display_name, `${field}.display_name`),
    role: asEnum(item.role, `${field}.role`, ['admin', 'worker'] as const),
    is_active: asBoolean(item.is_active, `${field}.is_active`),
    shift_start_local: asString(item.shift_start_local, `${field}.shift_start_local`),
    shift_end_local: asString(item.shift_end_local, `${field}.shift_end_local`),
    version: asNumber(item.version, `${field}.version`),
  };
}

function parseUserDetail(value: unknown): UserDetail {
  const item = asRecord(value, 'user');
  return {
    ...parseUserItem(item, 'user'),
    must_change_password: asBoolean(item.must_change_password, 'user.must_change_password'),
    created_at: asString(item.created_at, 'user.created_at'),
    updated_at: asString(item.updated_at, 'user.updated_at'),
    deactivated_at: asNullableString(item.deactivated_at, 'user.deactivated_at'),
  };
}

export async function fetchUsers(
  params: {
    q?: string;
    role?: UserRole;
    includeInactive?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ListResponse<UserListItem>> {
  const payload = await apiRequest<unknown>(
    `/users${toQuery({
      q: params.q,
      role: params.role,
      include_inactive: params.includeInactive ? 'true' : undefined,
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((item, index) =>
      parseUserItem(item, `items[${index}]`),
    ),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function fetchUser(userId: number): Promise<UserDetail> {
  return parseUserDetail(await apiRequest<unknown>(`/users/${userId}`));
}

export async function createUser(input: CreateUserInput): Promise<UserCreateResult> {
  const item = asRecord(
    await apiRequest<unknown>('/users', {
      method: 'POST',
      csrf: true,
      body: {
        employee_no: input.employeeNo,
        display_name: input.displayName,
        role: input.role,
        shift_start_local: input.shiftStartLocal,
        shift_end_local: input.shiftEndLocal,
      },
    }),
    'user',
  );
  return {
    user_id: asNumber(item.user_id, 'user.user_id'),
    employee_no: asString(item.employee_no, 'user.employee_no'),
    display_name: asString(item.display_name, 'user.display_name'),
    role: asEnum(item.role, 'user.role', ['admin', 'worker'] as const),
    shift_start_local: asString(item.shift_start_local, 'user.shift_start_local'),
    shift_end_local: asString(item.shift_end_local, 'user.shift_end_local'),
    temporary_password: asString(item.temporary_password, 'user.temporary_password'),
    must_change_password: asBoolean(item.must_change_password, 'user.must_change_password'),
    version: asNumber(item.version, 'user.version'),
  };
}

export async function updateUser(userId: number, input: UserUpdateInput): Promise<UserDetail> {
  return parseUserDetail(
    await apiRequest<unknown>(`/users/${userId}`, {
      method: 'PATCH',
      csrf: true,
      body: {
        version: input.version,
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.shiftStartLocal === undefined
          ? {}
          : { shift_start_local: input.shiftStartLocal }),
        ...(input.shiftEndLocal === undefined ? {} : { shift_end_local: input.shiftEndLocal }),
      },
    }),
  );
}

export async function deactivateUser(userId: number, version: number): Promise<UserDetail> {
  return parseUserDetail(
    await apiRequest<unknown>(`/users/${userId}/deactivation`, {
      method: 'POST',
      csrf: true,
      body: { version },
    }),
  );
}

export async function reactivateUser(userId: number, version: number): Promise<UserDetail> {
  return parseUserDetail(
    await apiRequest<unknown>(`/users/${userId}/reactivation`, {
      method: 'POST',
      csrf: true,
      body: { version },
    }),
  );
}

export async function fetchUserAuditEvents(
  userId: number,
  params: { page?: number; pageSize?: number } = {},
): Promise<ListResponse<AccountAuditEvent>> {
  const payload = await apiRequest<unknown>(
    `/users/${userId}/audit-events${toQuery({
      page: params.page,
      page_size: params.pageSize,
    })}`,
  );
  return {
    items: asArray(asRecord(payload, 'response').items, 'items').map((value, index) => {
      const item = asRecord(value, `items[${index}]`);
      return {
        event_id: asNumber(item.event_id, `items[${index}].event_id`),
        action: asString(item.action, `items[${index}].action`),
        actor_id: asNumber(item.actor_id, `items[${index}].actor_id`),
        actor_display_name: asString(item.actor_display_name, `items[${index}].actor_display_name`),
        target_user_id: asNumber(item.target_user_id, `items[${index}].target_user_id`),
        detail: item.detail === null ? null : asRecord(item.detail, `items[${index}].detail`),
        created_at: asString(item.created_at, `items[${index}].created_at`),
      };
    }),
    pagination: parsePagination(payload, 'response'),
  };
}

export async function resetUserPassword(userId: number): Promise<{
  user_id: number;
  employee_no: string;
  temporary_password: string;
  must_change_password: boolean;
  version: number;
}> {
  const item = asRecord(
    await apiRequest<unknown>(`/users/${userId}/password-reset`, {
      method: 'POST',
      csrf: true,
    }),
    'user',
  );
  return {
    user_id: asNumber(item.user_id, 'user.user_id'),
    employee_no: asString(item.employee_no, 'user.employee_no'),
    temporary_password: asString(item.temporary_password, 'user.temporary_password'),
    must_change_password: asBoolean(item.must_change_password, 'user.must_change_password'),
    version: asNumber(item.version, 'user.version'),
  };
}
