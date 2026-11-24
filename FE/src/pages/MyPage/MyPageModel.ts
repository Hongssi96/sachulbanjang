import type { AuthenticatedUser } from '../../api/auth';

export type EmployeeStatus = '재직' | '임시 비밀번호';

/** 고정 근무 조. 야간은 자정을 넘겨 25:00까지로 표기한다. */
export type ShiftKind = '주간' | '야간' | '심야';

export interface Shift {
  label: ShiftKind;
  time: string;
}

export const SHIFT_ORDER: ShiftKind[] = ['주간', '야간', '심야'];
export const SHIFTS: Record<ShiftKind, Shift> = {
  주간: { label: '주간', time: '08:00–17:00' },
  야간: { label: '야간', time: '16:00–25:00' },
  심야: { label: '심야', time: '00:00–09:00' },
};
export const shiftOptions = SHIFT_ORDER.map((shift) => ({
  value: shift,
  label: `${shift} ${SHIFTS[shift].time}`,
}));
/** 주 단위 로테이션: 주가 바뀌면 다음 조로 넘어간다. */
export function shiftForWeek(shift: ShiftKind, weekOffset: number): ShiftKind {
  const size = SHIFT_ORDER.length;
  const index = (SHIFT_ORDER.indexOf(shift) + (weekOffset % size) + size) % size;
  return SHIFT_ORDER[index];
}

export interface Employee {
  /** 아이디(사번) */
  id: string;
  name: string;
  role: AuthenticatedUser['role'];
  status: EmployeeStatus;
  /** 기준 주의 근무 조. 다른 주는 shiftForWeek로 계산한다. */
  shift: ShiftKind;
}

export const roleLabels: Record<AuthenticatedUser['role'], string> = {
  admin: '관리자',
  worker: '현장직원',
};
export const roleOptions = [
  { value: 'worker', label: '현장직원' },
  { value: 'admin', label: '관리자' },
];
export const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: `${value}:00` };
});

export const DEFAULT_START = '08';
export const DEFAULT_END = '17';

const STAFF_KEY = 'imleader.my-staff-v1';

// 직원 관리와 근무 시간은 시연용이라 브라우저에만 저장한다. 서버로 전송하지 않는다.
export const demoEmployees: Employee[] = [
  { id: 'A1001', name: '김가을', role: 'worker', status: '재직', shift: '주간' },
  { id: 'A1002', name: '황지혜', role: 'worker', status: '임시 비밀번호', shift: '야간' },
  { id: 'A1003', name: '홍태휘', role: 'worker', status: '재직', shift: '심야' },
];

export const scheduleLabel = (start: string, end: string) => `${start}:00–${end}:00`;

function isEmployee(value: unknown): value is Employee {
  if (typeof value !== 'object' || value === null) return false;
  const employee = value as Record<string, unknown>;
  return (
    typeof employee.id === 'string' &&
    typeof employee.name === 'string' &&
    (employee.role === 'admin' || employee.role === 'worker') &&
    (employee.status === '재직' || employee.status === '임시 비밀번호') &&
    (SHIFT_ORDER as string[]).includes(employee.shift as string)
  );
}

export function loadEmployees(): Employee[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STAFF_KEY) ?? 'null');
    if (Array.isArray(parsed) && parsed.every(isEmployee)) return parsed;
  } catch {
    /* 저장소를 쓸 수 없으면 예시 데이터를 쓴다. */
  }
  return demoEmployees;
}

export function persistEmployees(employees: Employee[]): boolean {
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(employees));
    return true;
  } catch {
    return false;
  }
}

/** 날짜별 조 편성 예외(그 날짜만). 키는 YYYY-MM-DD, 값은 직원 id→조. */
export type DayOverrides = Record<string, Record<string, ShiftKind>>;

const OVERRIDE_KEY = 'imleader.my-shift-overrides-v1';

export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function loadDayOverrides(): DayOverrides {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) return parsed as DayOverrides;
  } catch {
    /* 저장소를 쓸 수 없으면 예외 없이 기본 편성을 쓴다. */
  }
  return {};
}

export function persistDayOverrides(overrides: DayOverrides): boolean {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

/** 시연용 임시 비밀번호를 만든다. 실제 서버에는 저장하지 않는다. */
export function createTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}
