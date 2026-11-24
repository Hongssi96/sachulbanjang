import type { UserListItem, UserRole } from '../../api/users';

export type EmployeeStatus = '재직' | '임시 비밀번호' | '비활성';

/** 고정 근무 조. 야간은 자정을 넘겨 25:00까지로 표기한다. */
export type ShiftKind = '주간' | '야간' | '심야';

export interface Shift {
  label: ShiftKind;
  /** 화면에 보여 주는 원래 표기. */
  time: string;
  /** 서버에 저장하는 시작·종료 시각(HH:MM). 야간 종료는 자정(00:00)으로 저장한다. */
  start: string;
  end: string;
}

export const SHIFT_ORDER: ShiftKind[] = ['주간', '야간', '심야'];
export const SHIFTS: Record<ShiftKind, Shift> = {
  주간: { label: '주간', time: '08:00–17:00', start: '08:00', end: '17:00' },
  야간: { label: '야간', time: '16:00–25:00', start: '16:00', end: '00:00' },
  심야: { label: '심야', time: '00:00–09:00', start: '00:00', end: '09:00' },
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

/** API의 직원 목록·상세를 화면에서 쓰는 형태로 합친다. */
export interface Employee {
  /** 서버 user_id */
  id: number;
  /** 사번(아이디) */
  employeeNo: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  /** HH:MM:SS */
  shiftStart: string;
  /** HH:MM:SS */
  shiftEnd: string;
  version: number;
}

export function toEmployee(item: UserListItem, mustChangePassword: boolean): Employee {
  return {
    id: item.user_id,
    employeeNo: item.employee_no,
    name: item.display_name,
    role: item.role,
    isActive: item.is_active,
    mustChangePassword,
    shiftStart: item.shift_start_local,
    shiftEnd: item.shift_end_local,
    version: item.version,
  };
}

export function employeeStatus(employee: Employee): EmployeeStatus {
  if (!employee.isActive) return '비활성';
  return employee.mustChangePassword ? '임시 비밀번호' : '재직';
}

export const roleLabels: Record<UserRole, string> = {
  admin: '관리자',
  worker: '현장직원',
};
export const roleOptions = [
  { value: 'worker', label: '현장직원' },
  { value: 'admin', label: '관리자' },
];
export const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`;
  return { value, label: value };
});

export const DEFAULT_START = '08:00';
export const DEFAULT_END = '17:00';

/** "08:30:00" → "08:30" */
export const timeInputValue = (value: string) => value.slice(0, 5);

/** "08:30" → "08:30:00" */
export const toApiTime = (value: string) => (value.length === 5 ? `${value}:00` : value);

export const scheduleLabel = (start: string, end: string) =>
  `${timeInputValue(start)}–${timeInputValue(end)}`;

/** 현재 시각(분 단위)이 정시가 아니면 그 값을 선택지에 함께 넣어 그대로 저장할 수 있게 한다. */
export function timeOptions(current?: string) {
  const value = current ? timeInputValue(current) : '';
  if (!value || hourOptions.some((option) => option.value === value)) return hourOptions;
  return [...hourOptions, { value, label: value }].sort((left, right) =>
    left.value.localeCompare(right.value),
  );
}

/**
 * 서버 근무 시간을 화면 시연용 조로 묶는다.
 * 정확히 일치하는 조가 없으면 시작 시각 기준으로 가장 가까운 조를 쓴다.
 */
export function shiftKindForTimes(start: string, end: string): ShiftKind {
  const startValue = timeInputValue(start);
  const endValue = timeInputValue(end);
  const matched = SHIFT_ORDER.find(
    (shift) => SHIFTS[shift].start === startValue && SHIFTS[shift].end === endValue,
  );
  if (matched) return matched;
  const hour = Number(startValue.slice(0, 2));
  if (!Number.isFinite(hour)) return '주간';
  if (hour < 8) return '심야';
  if (hour >= 16) return '야간';
  return '주간';
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
