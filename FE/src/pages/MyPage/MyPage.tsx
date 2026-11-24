import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Modal from '../../components/Modal';
import FilterSelect from '../../components/FilterSelect';
import ApiErrorState from '../../components/ApiErrorState';
import LoadingState from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import type { AuthenticatedUser } from '../../api/auth';
import { changePassword } from '../../api/auth';
import {
  createUser,
  deactivateUser,
  fetchUser,
  fetchUserAuditEvents,
  fetchUsers,
  reactivateUser,
  resetUserPassword,
  updateUser as updateEmployeeAccount,
} from '../../api/users';
import type { UserDetail, UserListItem, UserRole, UserUpdateInput } from '../../api/users';
import type { Pagination } from '../../api/types';
import { useAuth } from '../../hooks/useAuth';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useWorkSession } from '../../hooks/useWorkSession';
import { formatDateTime } from '../../utils/dateFormat';
import {
  DEFAULT_END,
  DEFAULT_START,
  SHIFTS,
  SHIFT_ORDER,
  dayKey,
  employeeStatus,
  loadDayOverrides,
  persistDayOverrides,
  roleLabels,
  roleOptions,
  scheduleLabel,
  shiftForWeek,
  shiftKindForTimes,
  shiftOptions,
  timeInputValue,
  timeOptions,
  toApiTime,
  toEmployee,
} from './MyPageModel';
import type { DayOverrides, Employee, ShiftKind } from './MyPageModel';
import './MyPage.css';

interface MyPageProps {
  onToast: (message: string) => void;
  onLogout: () => void;
  loggingOut: boolean;
  dark: boolean;
  onToggleDark: () => void;
}

const NOTIFY_KEY = 'imleader.my-notifications';
function loadNotifications(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) !== 'off';
  } catch {
    return true;
  }
}

const PAGE_SIZE = 10;

interface EmployeePageData {
  employees: Employee[];
  pagination: Pagination;
}

/** 목록에서 버전을 받고, 상태 표시를 위해 각 직원의 상세(must_change_password)를 함께 읽는다. */
async function fetchEmployeePage(page: number): Promise<EmployeePageData> {
  const list = await fetchUsers({ includeInactive: true, page, pageSize: PAGE_SIZE });
  const details = await Promise.all(list.items.map((item) => fetchUser(item.user_id)));
  return {
    employees: list.items.map((item, index) =>
      toEmployee(item, details[index].must_change_password),
    ),
    pagination: list.pagination,
  };
}

const AUDIT_LABELS: Record<string, string> = {
  user_created: '직원 등록',
  user_updated: '직원 정보 수정',
  user_deactivated: '비활성화',
  user_reactivated: '재활성화',
  password_reset: '비밀번호 초기화',
};
const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action;

const toAuthUser = (detail: UserDetail): AuthenticatedUser => ({
  id: detail.user_id,
  employee_no: detail.employee_no,
  display_name: detail.display_name,
  role: detail.role,
  must_change_password: detail.must_change_password,
});

const describeError = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

const parseRole = (value: string): UserRole => (value === 'admin' ? 'admin' : 'worker');
const parseShiftKind = (value: string): ShiftKind =>
  value === '야간' ? '야간' : value === '심야' ? '심야' : '주간';

type Dialog =
  | { kind: 'password' }
  | { kind: 'self-worktime' }
  | { kind: 'register' }
  | { kind: 'credentials'; employee: Employee; mode: 'setup' | 'reset' }
  | { kind: 'edit'; employee: Employee }
  | { kind: 'employee-worktime'; employee: Employee }
  | { kind: 'delete'; employee: Employee }
  | { kind: 'day-shift'; dateKey: string; label: string }
  | null;

interface FieldErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

export default function MyPage({ onToast, onLogout, loggingOut, dark, onToggleDark }: MyPageProps) {
  const { user, updateUser: updateAuthUser } = useAuth();
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const currentErrorId = useId();
  const nextErrorId = useId();
  const confirmErrorId = useId();

  const [dialog, setDialog] = useState<Dialog>(null);
  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // 근무 시간(본인)
  const [selfStart, setSelfStart] = useState(DEFAULT_START);
  const [selfEnd, setSelfEnd] = useState(DEFAULT_END);
  const [selfWorkError, setSelfWorkError] = useState('');
  const [selfSaving, setSelfSaving] = useState(false);
  // 직원 관리
  const [page, setPage] = useState(1);
  const [newName, setNewName] = useState('');
  const [newEmployeeNo, setNewEmployeeNo] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('worker');
  const [regShift, setRegShift] = useState<ShiftKind>('주간');
  const [registerError, setRegisterError] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  // 아이디·비밀번호 모달
  const [credPassword, setCredPassword] = useState('');
  const [credIssued, setCredIssued] = useState(false);
  const [credSubmitting, setCredSubmitting] = useState(false);
  const [credError, setCredError] = useState('');
  const [credNotice, setCredNotice] = useState('');
  // 직원 수정
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('worker');
  const [editStart, setEditStart] = useState(DEFAULT_START);
  const [editEnd, setEditEnd] = useState(DEFAULT_END);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  // 직원 근무 시간
  const [empShift, setEmpShift] = useState<ShiftKind>('주간');
  const [empError, setEmpError] = useState('');
  const [empSubmitting, setEmpSubmitting] = useState(false);
  // 직원 비활성화
  const [deleteError, setDeleteError] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);
  // 설정
  const [notifications, setNotifications] = useState(loadNotifications);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOverrides, setDayOverrides] = useState<DayOverrides>(loadDayOverrides);
  const [dayShifts, setDayShifts] = useState<Record<string, ShiftKind>>({});

  const userId = user?.id ?? 0;
  const isAdmin = user?.role === 'admin';

  const selfQuery = useApiQuery(`self:${userId}`, () => fetchUser(userId), {
    enabled: isAdmin && userId > 0,
  });
  const employeeQuery = useApiQuery(`employees:${page}`, () => fetchEmployeePage(page), {
    enabled: isAdmin,
  });
  const workerQuery = useApiQuery('workers', () => fetchUsers({ role: 'worker', pageSize: 100 }), {
    enabled: isAdmin,
  });
  const workSession = useWorkSession();
  const auditEmployeeId = dialog?.kind === 'edit' ? dialog.employee.id : 0;
  const auditQuery = useApiQuery(
    `audit:${auditEmployeeId}`,
    () => fetchUserAuditEvents(auditEmployeeId, { pageSize: 10 }),
    { enabled: auditEmployeeId > 0 },
  );

  useEffect(() => {
    const totalPages = employeeQuery.data?.pagination.total_pages ?? 0;
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [employeeQuery.data, page]);

  useEffect(() => {
    if (dialog?.kind !== 'self-worktime' || !selfQuery.data) return;
    setSelfStart(timeInputValue(selfQuery.data.shift_start_local));
    setSelfEnd(timeInputValue(selfQuery.data.shift_end_local));
  }, [dialog, selfQuery.data]);

  if (!user) return null;

  const initial = user.display_name.trim().charAt(0) || '?';
  const employees = employeeQuery.data?.employees ?? [];
  const pagination = employeeQuery.data?.pagination;
  const totalPages = pagination?.total_pages ?? 0;
  const employeesPageMatches = pagination?.page === page;
  const workers = workerQuery.data?.items ?? [];
  const selfShiftText =
    isAdmin && selfQuery.data
      ? scheduleLabel(selfQuery.data.shift_start_local, selfQuery.data.shift_end_local)
      : '—';
  const sessionEndText = workSession.session ? formatDateTime(workSession.session.ends_at) : '—';
  const selfStartOptions = selfQuery.data
    ? timeOptions(selfQuery.data.shift_start_local)
    : [{ value: '', label: '—' }];
  const selfEndOptions = selfQuery.data
    ? timeOptions(selfQuery.data.shift_end_local)
    : [{ value: '', label: '—' }];
  // 대상이 바뀌었을 때 이전 직원의 이력이 잠깐 보이지 않도록 대상 id로 한 번 더 거른다.
  const auditEvents = (auditQuery.data?.items ?? []).filter(
    (event) => event.target_user_id === auditEmployeeId,
  );

  const reloadEmployees = () => {
    employeeQuery.reload();
    workerQuery.reload();
    selfQuery.reload();
  };
  const copyText = async (text: string) => {
    setCredError('');
    try {
      await navigator.clipboard.writeText(text);
      setCredNotice('임시 비밀번호를 복사했어요.');
    } catch {
      setCredNotice('');
      setCredError('복사하지 못했어요. 값을 직접 선택해 복사해 주세요.');
    }
  };

  const openPassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError('');
    setFieldErrors({});
    setShowCurrent(false);
    setShowNew(false);
    setDialog({ kind: 'password' });
  };
  const openSelfWorkTime = () => {
    setSelfStart(selfQuery.data ? timeInputValue(selfQuery.data.shift_start_local) : '');
    setSelfEnd(selfQuery.data ? timeInputValue(selfQuery.data.shift_end_local) : '');
    setSelfWorkError('');
    setDialog({ kind: 'self-worktime' });
  };
  const openRegister = () => {
    setNewName('');
    setNewEmployeeNo('');
    setNewRole('worker');
    setRegShift('주간');
    setRegisterError('');
    setDialog({ kind: 'register' });
  };
  const openCredentials = (employee: Employee, mode: 'setup' | 'reset') => {
    setCredPassword('');
    setCredIssued(false);
    setCredSubmitting(false);
    setCredError('');
    setCredNotice('');
    setDialog({ kind: 'credentials', employee, mode });
  };
  const openEdit = (employee: Employee) => {
    setEditName(employee.name);
    setEditRole(employee.role);
    setEditStart(timeInputValue(employee.shiftStart));
    setEditEnd(timeInputValue(employee.shiftEnd));
    setEditError('');
    setDialog({ kind: 'edit', employee });
  };
  const openEmployeeWorkTime = (employee: Employee) => {
    setEmpShift(shiftKindForTimes(employee.shiftStart, employee.shiftEnd));
    setEmpError('');
    setDialog({ kind: 'employee-worktime', employee });
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!currentPassword) nextErrors.current = '현재 비밀번호를 입력해 주세요.';
    if (!newPassword) nextErrors.next = '새 비밀번호를 입력해 주세요.';
    else if (newPassword === currentPassword)
      nextErrors.next = '새 비밀번호는 현재 비밀번호와 달라야 합니다.';
    if (!confirmPassword) nextErrors.confirm = '새 비밀번호를 한 번 더 입력해 주세요.';
    else if (confirmPassword !== newPassword) nextErrors.confirm = '새 비밀번호가 서로 달라요.';
    setFieldErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const updated = await changePassword(currentPassword, newPassword);
      updateAuthUser(updated);
      setDialog(null);
      onToast('비밀번호를 변경했어요.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CURRENT_PASSWORD_MISMATCH') {
        setFieldErrors({ current: '현재 비밀번호가 올바르지 않습니다.' });
      } else if (error instanceof ApiError && error.code === 'PASSWORD_UNCHANGED') {
        setFieldErrors({ next: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
      } else {
        setFormError(describeError(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const applySelfWorkTime = async () => {
    if (!isAdmin) {
      setSelfWorkError('근무 시간 변경은 관리자만 할 수 있어요. 관리자에게 요청해 주세요.');
      return;
    }
    const detail = selfQuery.data;
    if (!detail) {
      setSelfWorkError('근무 시간을 불러오지 못해 저장할 수 없어요.');
      return;
    }
    if (!selfStart || !selfEnd) {
      setSelfWorkError('근무 시작·종료 시각을 선택해 주세요.');
      return;
    }
    setSelfSaving(true);
    setSelfWorkError('');
    try {
      await updateEmployeeAccount(detail.user_id, {
        version: detail.version,
        shiftStartLocal: toApiTime(selfStart),
        shiftEndLocal: toApiTime(selfEnd),
      });
      setDialog(null);
      reloadEmployees();
      onToast(`근무 시간을 ${scheduleLabel(selfStart, selfEnd)}로 변경했어요.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setDialog(null);
        reloadEmployees();
        onToast('다른 변경이 먼저 저장되었어요. 최신 정보를 새로 불러왔으니 다시 시도해 주세요.');
      } else {
        setSelfWorkError(describeError(error));
      }
    } finally {
      setSelfSaving(false);
    }
  };

  const submitRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    const employeeNo = newEmployeeNo.trim();
    if (!name || !employeeNo) {
      setRegisterError('이름과 사번을 입력해 주세요.');
      return;
    }
    const shift = SHIFTS[regShift];
    setRegisterError('');
    setRegisterSubmitting(true);
    try {
      const result = await createUser({
        employeeNo,
        displayName: name,
        role: newRole,
        shiftStartLocal: toApiTime(shift.start),
        shiftEndLocal: toApiTime(shift.end),
      });
      setDialog(null);
      reloadEmployees();
      setCredPassword(result.temporary_password);
      setCredIssued(true);
      setCredError('');
      setCredNotice('');
      setDialog({
        kind: 'credentials',
        employee: {
          id: result.user_id,
          employeeNo: result.employee_no,
          name: result.display_name,
          role: result.role,
          isActive: true,
          mustChangePassword: result.must_change_password,
          shiftStart: result.shift_start_local,
          shiftEnd: result.shift_end_local,
          version: result.version,
        },
        mode: 'setup',
      });
      onToast(`${name} 님을 등록했어요.`);
    } catch (error) {
      setRegisterError(describeError(error));
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const issueResetPassword = async () => {
    const target = dialog;
    if (!target || target.kind !== 'credentials' || target.mode !== 'reset') return;
    setCredSubmitting(true);
    setCredError('');
    setCredNotice('');
    try {
      const result = await resetUserPassword(target.employee.id);
      setCredPassword(result.temporary_password);
      setCredIssued(true);
      setCredNotice('임시 비밀번호를 발급했어요. 이 화면에서 한 번만 표시됩니다.');
      reloadEmployees();
      onToast(`${target.employee.name} 님의 비밀번호를 초기화했어요.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USER_NOT_FOUND') {
        setCredError('비활성화된 계정은 초기화할 수 없어요. 먼저 재활성화해 주세요.');
        reloadEmployees();
      } else {
        setCredError(describeError(error));
      }
    } finally {
      setCredSubmitting(false);
    }
  };

  const submitCredentials = () => {
    if (!dialog || dialog.kind !== 'credentials') return;
    if (dialog.mode === 'reset' && !credIssued) {
      void issueResetPassword();
      return;
    }
    setDialog(null);
  };

  const submitEdit = async () => {
    const target = dialog;
    if (!target || target.kind !== 'edit') return;
    const name = editName.trim();
    if (!name) {
      setEditError('이름을 입력해 주세요.');
      return;
    }
    if (!editStart || !editEnd) {
      setEditError('근무 시작·종료 시각을 선택해 주세요.');
      return;
    }
    const input: UserUpdateInput = { version: target.employee.version };
    if (name !== target.employee.name) input.displayName = name;
    if (target.employee.id !== user.id && editRole !== target.employee.role) {
      input.role = editRole;
    }
    if (editStart !== timeInputValue(target.employee.shiftStart)) {
      input.shiftStartLocal = toApiTime(editStart);
    }
    if (editEnd !== timeInputValue(target.employee.shiftEnd)) {
      input.shiftEndLocal = toApiTime(editEnd);
    }
    if (Object.keys(input).length === 1) {
      setEditError('변경된 내용이 없어요.');
      return;
    }

    setEditSubmitting(true);
    setEditError('');
    try {
      const updated = await updateEmployeeAccount(target.employee.id, input);
      if (updated.user_id === user.id) updateAuthUser(toAuthUser(updated));
      setDialog(null);
      reloadEmployees();
      onToast(`${updated.display_name} 님의 정보를 수정했어요.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setDialog(null);
        reloadEmployees();
        onToast('다른 변경이 먼저 저장되었어요. 최신 정보를 새로 불러왔으니 다시 시도해 주세요.');
      } else {
        setEditError(describeError(error));
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  const applyEmployeeWorkTime = async () => {
    const target = dialog;
    if (!target || target.kind !== 'employee-worktime') return;
    const shift = SHIFTS[empShift];
    setEmpSubmitting(true);
    setEmpError('');
    try {
      await updateEmployeeAccount(target.employee.id, {
        version: target.employee.version,
        shiftStartLocal: toApiTime(shift.start),
        shiftEndLocal: toApiTime(shift.end),
      });
      setDialog(null);
      reloadEmployees();
      onToast(
        `${target.employee.name} 님의 근무 조를 ${empShift}(${scheduleLabel(shift.start, shift.end)})로 변경했어요.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setDialog(null);
        reloadEmployees();
        onToast('다른 변경이 먼저 저장되었어요. 최신 정보를 새로 불러왔으니 다시 시도해 주세요.');
      } else {
        setEmpError(describeError(error));
      }
    } finally {
      setEmpSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    const target = dialog;
    if (!target || target.kind !== 'delete') return;
    if (target.employee.id === user.id) {
      setDeleteError('본인 계정은 비활성화할 수 없습니다.');
      return;
    }
    setDeleteSubmitting(true);
    setDeleteError('');
    try {
      await deactivateUser(target.employee.id, target.employee.version);
      setDialog(null);
      reloadEmployees();
      onToast(`${target.employee.name} 님을 비활성화했어요.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setDialog(null);
        reloadEmployees();
        onToast('다른 변경이 먼저 저장되었어요. 최신 정보를 새로 불러왔으니 다시 시도해 주세요.');
      } else {
        setDeleteError(describeError(error));
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleReactivate = async (employee: Employee) => {
    setReactivatingId(employee.id);
    try {
      await reactivateUser(employee.id, employee.version);
      reloadEmployees();
      onToast(`${employee.name} 님을 다시 활성화했어요.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        reloadEmployees();
        onToast('다른 변경이 먼저 저장되었어요. 최신 정보를 새로 불러왔으니 다시 시도해 주세요.');
      } else {
        onToast(describeError(error));
      }
    } finally {
      setReactivatingId(null);
    }
  };

  const toggleNotifications = (next: boolean) => {
    setNotifications(next);
    try {
      localStorage.setItem(NOTIFY_KEY, next ? 'on' : 'off');
    } catch {
      onToast('브라우저 저장소를 사용할 수 없어 새로고침하면 되돌아갑니다.');
    }
  };

  const resetDemo = () => {
    reloadEmployees();
    onToast('목록을 새로 불러왔어요.');
  };

  // 주간 스케줄: 주 단위 로테이션 편성을 조별로 보여준다(화면 시연용).
  const bandPill: Record<ShiftKind, string> = {
    주간: 'pill-green',
    야간: 'pill-violet',
    심야: 'pill-neutral',
  };
  const today = new Date();
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + weekOffset * 7);
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const baseShift = (employee: UserListItem) =>
    shiftKindForTimes(employee.shift_start_local, employee.shift_end_local);
  const shiftOn = (employee: UserListItem, key: string) =>
    dayOverrides[key]?.[String(employee.user_id)] ?? shiftForWeek(baseShift(employee), weekOffset);
  const membersOn = (key: string, band: ShiftKind) =>
    workers.filter((employee) => shiftOn(employee, key) === band);
  const weekDays = Array.from({ length: 7 }, (_, position) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + position);
    return {
      key: dayKey(date),
      day: date.getDate(),
      weekday: date.getDay(),
      isToday: date.toDateString() === today.toDateString(),
      label: `${date.getMonth() + 1}월 ${date.getDate()}일`,
    };
  });

  const openDayShift = (key: string, label: string) => {
    const base: Record<string, ShiftKind> = {};
    workers.forEach((employee) => {
      base[String(employee.user_id)] = shiftOn(employee, key);
    });
    setDayShifts(base);
    setDialog({ kind: 'day-shift', dateKey: key, label });
  };
  const saveDayShift = () => {
    if (!dialog || dialog.kind !== 'day-shift') return;
    const next = { ...dayOverrides, [dialog.dateKey]: dayShifts };
    setDayOverrides(next);
    setDialog(null);
    onToast(
      persistDayOverrides(next)
        ? `${dialog.label} 조 편성을 변경했어요.`
        : '조 편성을 변경했지만 브라우저 저장에 실패했어요.',
    );
  };
  const resetDayShift = () => {
    if (!dialog || dialog.kind !== 'day-shift') return;
    const next = { ...dayOverrides };
    delete next[dialog.dateKey];
    setDayOverrides(next);
    setDialog(null);
    onToast(
      persistDayOverrides(next)
        ? `${dialog.label} 조 편성을 기본값으로 되돌렸어요.`
        : '기본값으로 되돌렸지만 브라우저 저장에 실패했어요.',
    );
  };
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekLabel = `${weekStart.getFullYear()}년 ${weekStart.getMonth() + 1}월`;
  const weekRange = `${weekStart.getMonth() + 1}.${weekStart.getDate()} – ${weekEnd.getMonth() + 1}.${weekEnd.getDate()}`;

  return (
    <div className="my-page">
      <h1 className="sr-only">관리</h1>
      <div className={`my-layout ${isAdmin ? '' : 'is-single'}`}>
        <section className="card my-profile" aria-labelledby="my-profile-heading">
          <div className="my-card-header">
            <h2 id="my-profile-heading">내 정보</h2>
          </div>
          <div className="my-profile-top">
            <span className="my-avatar" aria-hidden="true">
              {initial}
            </span>
            <div className="my-profile-copy">
              <strong className="my-profile-name">{user.display_name}</strong>
              <span className={`pill ${user.role === 'admin' ? 'pill-violet' : 'pill-neutral'}`}>
                {roleLabels[user.role]}
              </span>
            </div>
          </div>
          {user.must_change_password && (
            <div className="my-notice" role="status">
              <TriangleAlert size={18} />
              <span>임시 비밀번호를 사용 중이에요. 비밀번호를 변경해 주세요.</span>
            </div>
          )}
          <dl className="my-info">
            <div>
              <dt>사번</dt>
              <dd>{user.employee_no}</dd>
            </div>
            <div>
              <dt>역할</dt>
              <dd>{roleLabels[user.role]}</dd>
            </div>
            <div>
              <dt>근무 종료 예정</dt>
              <dd>{sessionEndText}</dd>
            </div>
          </dl>
          {workSession.error && (
            <p className="my-field-error" role="alert">
              {workSession.error.message}
            </p>
          )}
          <div className="my-settings">
            <div className="my-setting">
              <span className="my-setting-label">근무 시간</span>
              <span className="my-setting-value">{selfShiftText}</span>
              <button className="my-link" onClick={openSelfWorkTime}>
                변경
              </button>
            </div>
            <div className="my-setting">
              <span className="my-setting-label">비밀번호</span>
              <span className="my-setting-value">••••••••</span>
              <button className="my-link" onClick={openPassword}>
                변경
              </button>
            </div>
          </div>
          {isAdmin && selfQuery.loading && !selfQuery.data && (
            <LoadingState compact label="근무 시간을 불러오는 중이에요" />
          )}
          {isAdmin && selfQuery.error && (
            <ApiErrorState compact error={selfQuery.error} onRetry={selfQuery.reload} />
          )}
          <div className="my-section">
            <h3 className="my-section-title">설정</h3>
            <div className="my-toggle-list">
              <div className="my-toggle-row">
                <div className="my-toggle-copy">
                  <strong>알림</strong>
                  <small>새 보고·일정 알림을 받아요</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifications}
                  aria-label="알림"
                  className={`my-switch ${notifications ? 'is-on' : ''}`}
                  onClick={() => toggleNotifications(!notifications)}
                >
                  <span />
                </button>
              </div>
              <div className="my-toggle-row">
                <div className="my-toggle-copy">
                  <strong>다크 모드</strong>
                  <small>어두운 화면 테마</small>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dark}
                  aria-label="다크 모드"
                  className={`my-switch ${dark ? 'is-on' : ''}`}
                  onClick={onToggleDark}
                >
                  <span />
                </button>
              </div>
            </div>
          </div>
          <button
            className="button button-white my-logout"
            onClick={onLogout}
            disabled={loggingOut}
          >
            <LogOut size={17} />
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </section>

        {isAdmin && (
          <section className="card my-staff" aria-labelledby="my-staff-heading">
            <div className="my-card-header">
              <div className="heading-inline">
                <h2 id="my-staff-heading">직원 관리</h2>
              </div>
              <button className="button button-primary button-sm" onClick={openRegister}>
                <Plus size={16} />
                직원 등록
              </button>
            </div>
            <div className="my-table-scroll">
              <table className="my-table">
                <caption className="sr-only">현장직원 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">이름</th>
                    <th scope="col">사번</th>
                    <th scope="col">역할</th>
                    <th scope="col">근무 시간</th>
                    <th scope="col">상태</th>
                    <th scope="col">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeQuery.error ? (
                    <tr>
                      <td colSpan={6}>
                        <ApiErrorState
                          compact
                          error={employeeQuery.error}
                          onRetry={employeeQuery.reload}
                        />
                      </td>
                    </tr>
                  ) : !employeesPageMatches ? (
                    <tr>
                      <td colSpan={6}>
                        <LoadingState compact label="직원 목록을 불러오는 중이에요" />
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="my-muted">
                        등록된 직원이 없어요.
                      </td>
                    </tr>
                  ) : (
                    employees.map((employee) => {
                      const status = employeeStatus(employee);
                      const statusClass =
                        status === '재직'
                          ? 'pill-green'
                          : status === '임시 비밀번호'
                            ? 'pill-amber'
                            : 'pill-neutral';
                      return (
                        <tr key={employee.id}>
                          <td>
                            <strong>{employee.name}</strong>
                          </td>
                          <td className="my-muted">{employee.employeeNo}</td>
                          <td>{roleLabels[employee.role]}</td>
                          <td className="my-muted">
                            {scheduleLabel(employee.shiftStart, employee.shiftEnd)}
                          </td>
                          <td>
                            <span className={`pill ${statusClass}`}>{status}</span>
                          </td>
                          <td>
                            <div className="my-row-actions">
                              <button
                                className="my-row-button"
                                aria-label={`${employee.name} 아이디·비밀번호 설정`}
                                onClick={() => openCredentials(employee, 'setup')}
                              >
                                아이디·비번
                              </button>
                              <button
                                className="my-row-button"
                                aria-label={`${employee.name} 비밀번호 초기화`}
                                title={
                                  employee.id === user.id
                                    ? '본인 비밀번호는 내 정보에서 직접 변경해 주세요.'
                                    : undefined
                                }
                                disabled={!employee.isActive || employee.id === user.id}
                                onClick={() => openCredentials(employee, 'reset')}
                              >
                                초기화
                              </button>
                              <button
                                className="my-row-button"
                                aria-label={`${employee.name} 근무 시간 변경`}
                                onClick={() => openEmployeeWorkTime(employee)}
                              >
                                근무 시간
                              </button>
                              <button
                                className="my-row-button is-danger"
                                aria-label={`${employee.name} 삭제`}
                                title={
                                  employee.id === user.id
                                    ? '본인 계정은 비활성화할 수 없습니다.'
                                    : undefined
                                }
                                disabled={!employee.isActive || employee.id === user.id}
                                onClick={() => {
                                  setDeleteError('');
                                  setDialog({ kind: 'delete', employee });
                                }}
                              >
                                삭제
                              </button>
                              <button
                                className="my-row-button"
                                aria-label={`${employee.name} 정보 수정`}
                                onClick={() => openEdit(employee)}
                              >
                                수정
                              </button>
                              {!employee.isActive && (
                                <button
                                  className="my-row-button"
                                  aria-label={`${employee.name} 재활성화`}
                                  disabled={reactivatingId === employee.id}
                                  onClick={() => void handleReactivate(employee)}
                                >
                                  {reactivatingId === employee.id ? '처리 중…' : '재활성화'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="my-table-footer">
              <span>
                전체 {pagination?.total_items ?? employees.length}명 · 현장직원{' '}
                {workerQuery.data?.pagination.total_items ?? workers.length}명
              </span>
              <div className="my-footer-right">
                {totalPages > 1 && (
                  <div className="my-pager">
                    <button
                      type="button"
                      className="my-row-button"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={page <= 1}
                    >
                      이전
                    </button>
                    <span>
                      {page} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="my-row-button"
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                      disabled={page >= totalPages}
                    >
                      다음
                    </button>
                  </div>
                )}
                <button className="my-link" onClick={resetDemo}>
                  <RotateCcw size={13} /> 목록 초기화
                </button>
              </div>
            </div>
            <section className="my-schedule" aria-labelledby="my-schedule-heading">
              <div className="my-card-header">
                <div className="heading-inline">
                  <h2 id="my-schedule-heading">주간 스케줄</h2>
                  <span className="pill pill-neutral">{weekLabel}</span>
                  <span className="pill pill-neutral">화면 시연용</span>
                </div>
                <div className="my-week-nav">
                  {weekOffset !== 0 && (
                    <button type="button" className="my-link" onClick={() => setWeekOffset(0)}>
                      이번 주
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="이전 주"
                    onClick={() => setWeekOffset((value) => value - 1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="my-week-range" aria-live="polite">
                    {weekRange}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="다음 주"
                    onClick={() => setWeekOffset((value) => value + 1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <p className="my-disclaimer">
                현장직원 이름은 서버에서 불러오고, 조 편성은 화면 시연용으로 이 브라우저에만
                저장됩니다.
              </p>
              {workerQuery.error ? (
                <ApiErrorState compact error={workerQuery.error} onRetry={workerQuery.reload} />
              ) : workerQuery.loading && !workerQuery.data ? (
                <LoadingState compact label="현장직원을 불러오는 중이에요" />
              ) : (
                <>
                  {workers.length === 0 && (
                    <p className="my-disclaimer">
                      등록된 현장직원이 없어 조 편성을 표시할 수 없어요.
                    </p>
                  )}
                  <div className="my-week-grid">
                    {weekDays.map((day) => (
                      <button
                        type="button"
                        key={day.key}
                        className={`my-day ${day.isToday ? 'is-today' : ''} ${day.weekday === 0 ? 'is-sunday' : ''}`}
                        aria-label={`${day.label} 조 편성 변경`}
                        onClick={() => openDayShift(day.key, day.label)}
                      >
                        <span className="my-day-head">
                          <span className="my-day-weekday">{WEEKDAYS[day.weekday]}</span>
                          <strong className="my-day-date">{day.day}</strong>
                          {dayOverrides[day.key] && (
                            <i className="my-day-edited" aria-hidden="true" />
                          )}
                        </span>
                        <span className="my-day-shifts">
                          {SHIFT_ORDER.map((band) => {
                            const names = membersOn(day.key, band).map(
                              (employee) => employee.display_name,
                            );
                            return (
                              <span className="my-day-shift" key={band}>
                                <span className={`pill ${bandPill[band]}`}>{band}</span>
                                <span
                                  className="my-day-names"
                                  title={names.join(', ') || '배정 없음'}
                                >
                                  {names.length === 0
                                    ? '—'
                                    : names.length > 2
                                      ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
                                      : names.join(', ')}
                                </span>
                              </span>
                            );
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          </section>
        )}
      </div>

      {dialog?.kind === 'password' && (
        <Modal title="비밀번호 변경" onClose={() => setDialog(null)}>
          <form className="my-form" onSubmit={submitPassword}>
            <div className={`my-field ${fieldErrors.current ? 'has-error' : ''}`}>
              <label htmlFor={currentId}>현재 비밀번호</label>
              <div className="my-input">
                <input
                  id={currentId}
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  maxLength={1024}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.current)}
                  aria-describedby={fieldErrors.current ? currentErrorId : undefined}
                />
                <button
                  type="button"
                  className="my-toggle"
                  onClick={() => setShowCurrent((visible) => !visible)}
                  aria-label={showCurrent ? '현재 비밀번호 숨기기' : '현재 비밀번호 보기'}
                  aria-pressed={showCurrent}
                  disabled={submitting}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.current && (
                <p className="my-field-error" id={currentErrorId}>
                  {fieldErrors.current}
                </p>
              )}
            </div>
            <div className={`my-field ${fieldErrors.next ? 'has-error' : ''}`}>
              <label htmlFor={nextId}>새 비밀번호</label>
              <div className="my-input">
                <input
                  id={nextId}
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  maxLength={1024}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.next)}
                  aria-describedby={fieldErrors.next ? nextErrorId : undefined}
                />
                <button
                  type="button"
                  className="my-toggle"
                  onClick={() => setShowNew((visible) => !visible)}
                  aria-label={showNew ? '새 비밀번호 숨기기' : '새 비밀번호 보기'}
                  aria-pressed={showNew}
                  disabled={submitting}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.next && (
                <p className="my-field-error" id={nextErrorId}>
                  {fieldErrors.next}
                </p>
              )}
            </div>
            <div className={`my-field ${fieldErrors.confirm ? 'has-error' : ''}`}>
              <label htmlFor={confirmId}>새 비밀번호 확인</label>
              <input
                id={confirmId}
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={1024}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.confirm)}
                aria-describedby={fieldErrors.confirm ? confirmErrorId : undefined}
              />
              {fieldErrors.confirm && (
                <p className="my-field-error" id={confirmErrorId}>
                  {fieldErrors.confirm}
                </p>
              )}
            </div>
            {formError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {formError}
              </p>
            )}
            <button className="button button-primary my-submit" type="submit" disabled={submitting}>
              <KeyRound size={17} />
              {submitting ? '변경 중…' : '비밀번호 변경'}
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'self-worktime' && (
        <Modal title="근무 시간 변경" onClose={() => setDialog(null)}>
          <div className="my-form">
            {isAdmin && selfQuery.loading && !selfQuery.data && (
              <LoadingState compact label="근무 시간을 불러오는 중이에요" />
            )}
            {isAdmin && selfQuery.error && (
              <ApiErrorState compact error={selfQuery.error} onRetry={selfQuery.reload} />
            )}
            {!isAdmin && (
              <p className="my-disclaimer">
                근무 시간 변경은 관리자만 할 수 있어요. 관리자에게 요청해 주세요.
              </p>
            )}
            {isAdmin && selfQuery.data && (
              <p className="my-disclaimer">
                본인 근무 시간은 직원 관리의 ‘수정’에서도 변경할 수 있어요. 본인 역할은 서버에서
                변경할 수 없습니다.
              </p>
            )}
            <fieldset
              className="my-time-fieldset"
              disabled={!isAdmin || !selfQuery.data || selfSaving}
            >
              <legend className="sr-only">근무 시간</legend>
              <div className="my-time-row">
                <div className="my-field">
                  <label>시작</label>
                  <FilterSelect
                    label="근무 시작 시각"
                    value={selfStart}
                    options={selfStartOptions}
                    onChange={setSelfStart}
                  />
                </div>
                <span className="my-time-dash" aria-hidden="true">
                  –
                </span>
                <div className="my-field">
                  <label>종료</label>
                  <FilterSelect
                    label="근무 종료 시각"
                    value={selfEnd}
                    options={selfEndOptions}
                    onChange={setSelfEnd}
                  />
                </div>
              </div>
            </fieldset>
            {selfWorkError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {selfWorkError}
              </p>
            )}
            <button
              className="button button-primary my-submit"
              onClick={() => void applySelfWorkTime()}
              disabled={selfSaving || !isAdmin || !selfQuery.data}
            >
              <Timer size={16} />
              {selfSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'register' && (
        <Modal title="직원 등록" onClose={() => setDialog(null)}>
          <form className="my-form" onSubmit={submitRegister}>
            <div className="my-field">
              <label htmlFor="my-new-name">이름</label>
              <input
                id="my-new-name"
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  setRegisterError('');
                }}
                maxLength={50}
                placeholder="이름을 입력해 주세요"
                disabled={registerSubmitting}
              />
            </div>
            <div className="my-field">
              <label htmlFor="my-new-no">사번(아이디)</label>
              <input
                id="my-new-no"
                value={newEmployeeNo}
                onChange={(event) => {
                  setNewEmployeeNo(event.target.value);
                  setRegisterError('');
                }}
                maxLength={20}
                placeholder="사번을 입력해 주세요"
                disabled={registerSubmitting}
              />
            </div>
            <div className="my-field">
              <label>역할</label>
              <FilterSelect
                label="역할 선택"
                value={newRole}
                options={roleOptions}
                onChange={(value) => setNewRole(parseRole(value))}
              />
            </div>
            <div className="my-field">
              <label>근무 조</label>
              <FilterSelect
                label="근무 조 선택"
                value={regShift}
                options={shiftOptions}
                onChange={(value) => setRegShift(parseShiftKind(value))}
              />
            </div>
            <p className="my-disclaimer">
              선택한 조의 기본 근무 시간으로 등록되며, 야간 조는 자정(00:00) 종료로 저장됩니다.
            </p>
            {registerError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {registerError}
              </p>
            )}
            <button
              className="button button-primary my-submit"
              type="submit"
              disabled={registerSubmitting}
            >
              <Plus size={16} />
              {registerSubmitting ? '등록 중…' : '등록'}
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'credentials' && (
        <Modal
          title={dialog.mode === 'setup' ? '아이디·비밀번호 설정' : '비밀번호 초기화'}
          onClose={() => {
            // 발급 요청 중에 닫으면 한 번만 표시되는 임시 비밀번호를 놓칠 수 있다.
            if (!credSubmitting) setDialog(null);
          }}
        >
          <div className="my-form">
            <p className="my-cred-target">
              <strong>{dialog.employee.name}</strong> 님
            </p>
            {dialog.mode === 'setup' && !credIssued && (
              <p className="my-disclaimer">
                아이디(사번)는 등록 후 변경할 수 없어요. 임시 비밀번호는 [비밀번호 초기화]에서 한
                번만 발급됩니다.
              </p>
            )}
            <div className="my-field">
              <label htmlFor="my-cred-id">아이디(사번)</label>
              <input id="my-cred-id" value={dialog.employee.employeeNo} readOnly />
            </div>
            <div className="my-field">
              <label htmlFor="my-cred-pw">임시 비밀번호</label>
              <div className="my-input">
                <input id="my-cred-pw" value={credPassword || '—'} readOnly />
                <button
                  type="button"
                  className="my-toggle"
                  aria-label="임시 비밀번호 복사"
                  disabled={!credPassword}
                  onClick={() => {
                    if (credPassword) void copyText(credPassword);
                  }}
                >
                  <Copy size={17} />
                </button>
              </div>
            </div>
            <button
              type="button"
              className="my-link my-regenerate"
              onClick={() => {
                if (dialog.mode === 'reset') void issueResetPassword();
              }}
              disabled={credSubmitting || dialog.mode !== 'reset'}
              title={
                dialog.mode === 'reset'
                  ? undefined
                  : '등록 시 발급된 임시 비밀번호는 다시 생성할 수 없어요. 비밀번호 초기화를 사용해 주세요.'
              }
            >
              <RotateCcw size={13} /> 임시 비밀번호 다시 생성
            </button>
            <p className="my-disclaimer">임시 비밀번호는 이 화면에서 한 번만 표시됩니다.</p>
            {dialog.mode === 'reset' && !credIssued && (
              <p className="my-disclaimer">
                ‘적용’을 누르면 임시 비밀번호가 발급되고 기존 로그인 세션이 종료됩니다.
              </p>
            )}
            {credError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {credError}
              </p>
            )}
            {credNotice && (
              <p className="my-form-notice" role="status">
                <Check size={15} />
                {credNotice}
              </p>
            )}
            <button
              className="button button-primary my-submit"
              onClick={submitCredentials}
              disabled={credSubmitting}
            >
              <Check size={16} />
              {dialog.mode === 'reset' && !credIssued
                ? credSubmitting
                  ? '발급 중…'
                  : '적용'
                : '닫기'}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'edit' && (
        <Modal title="직원 수정" onClose={() => setDialog(null)}>
          <div className="my-form">
            <p className="my-cred-target">
              <strong>{dialog.employee.name}</strong> · {dialog.employee.employeeNo}
            </p>
            <div className="my-field">
              <label htmlFor="my-edit-name">이름</label>
              <input
                id="my-edit-name"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value);
                  setEditError('');
                }}
                maxLength={100}
                disabled={editSubmitting}
              />
            </div>
            <div className="my-field">
              <label>역할</label>
              {dialog.employee.id === user.id ? (
                <span className="my-readonly-value">{roleLabels[editRole]}</span>
              ) : (
                <FilterSelect
                  label="역할 선택"
                  value={editRole}
                  options={roleOptions}
                  onChange={(value) => setEditRole(parseRole(value))}
                />
              )}
            </div>
            {dialog.employee.id === user.id && (
              <p className="my-disclaimer">본인 역할은 변경할 수 없습니다.</p>
            )}
            <fieldset className="my-time-fieldset" disabled={editSubmitting}>
              <legend className="sr-only">근무 시간</legend>
              <div className="my-time-row">
                <div className="my-field">
                  <label>시작</label>
                  <FilterSelect
                    label="근무 시작 시각"
                    value={editStart}
                    options={timeOptions(dialog.employee.shiftStart)}
                    onChange={setEditStart}
                  />
                </div>
                <span className="my-time-dash" aria-hidden="true">
                  –
                </span>
                <div className="my-field">
                  <label>종료</label>
                  <FilterSelect
                    label="근무 종료 시각"
                    value={editEnd}
                    options={timeOptions(dialog.employee.shiftEnd)}
                    onChange={setEditEnd}
                  />
                </div>
              </div>
            </fieldset>
            <section className="my-audit" aria-labelledby="my-audit-heading">
              <h3 className="my-section-title" id="my-audit-heading">
                감사 이력
              </h3>
              {auditQuery.loading ? (
                <LoadingState compact label="감사 이력을 불러오는 중이에요" />
              ) : auditQuery.error ? (
                <ApiErrorState compact error={auditQuery.error} onRetry={auditQuery.reload} />
              ) : auditEvents.length === 0 ? (
                <p className="my-disclaimer">감사 이력이 없어요.</p>
              ) : (
                <ul className="my-audit-list">
                  {auditEvents.map((event) => (
                    <li className="my-audit-item" key={event.event_id}>
                      <span className="my-audit-action">{auditLabel(event.action)}</span>
                      <span className="my-audit-meta">
                        {event.actor_display_name} · {formatDateTime(event.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {editError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {editError}
              </p>
            )}
            <button
              className="button button-primary my-submit"
              onClick={() => void submitEdit()}
              disabled={editSubmitting}
            >
              <Check size={16} />
              {editSubmitting ? '저장 중…' : '저장'}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal title="직원 삭제" plain onClose={() => setDialog(null)}>
          <div className="confirm-dialog">
            <p>이 직원을 삭제할까요? 삭제하면 목록에서 사라집니다.</p>
            <strong>
              {dialog.employee.name} · {dialog.employee.employeeNo}
            </strong>
            <p className="my-disclaimer">
              계정은 삭제되지 않고 비활성화되며, 필요하면 다시 활성화할 수 있어요.
            </p>
            {dialog.employee.id === user.id && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                본인 계정은 비활성화할 수 없습니다.
              </p>
            )}
            {deleteError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {deleteError}
              </p>
            )}
            <div className="confirm-actions">
              <button
                className="button button-white"
                onClick={() => setDialog(null)}
                disabled={deleteSubmitting}
              >
                취소
              </button>
              <button
                className="button button-primary"
                onClick={() => void confirmDelete()}
                disabled={deleteSubmitting || dialog.employee.id === user.id}
              >
                <Trash2 size={16} />
                {deleteSubmitting ? '처리 중…' : '삭제'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'day-shift' && (
        <Modal title={`${dialog.label} 조 편성`} onClose={() => setDialog(null)}>
          <div className="my-form">
            {workerQuery.loading && !workerQuery.data ? (
              <LoadingState compact label="현장직원을 불러오는 중이에요" />
            ) : workerQuery.error ? (
              <ApiErrorState compact error={workerQuery.error} onRetry={workerQuery.reload} />
            ) : (
              <>
                {workers.length === 0 && (
                  <p className="my-disclaimer">등록된 현장직원이 없어 조를 바꿀 수 없어요.</p>
                )}
                {workers.map((employee) => (
                  <div className="my-field" key={employee.user_id}>
                    <label>{employee.display_name}</label>
                    <FilterSelect
                      label={`${employee.display_name} 근무 조`}
                      value={dayShifts[String(employee.user_id)] ?? '주간'}
                      options={shiftOptions}
                      onChange={(value) =>
                        setDayShifts((previous) => ({
                          ...previous,
                          [String(employee.user_id)]: parseShiftKind(value),
                        }))
                      }
                    />
                  </div>
                ))}
              </>
            )}
            {dayOverrides[dialog.dateKey] && (
              <button className="my-link my-regenerate" onClick={resetDayShift}>
                <RotateCcw size={13} /> 기본값으로 되돌리기
              </button>
            )}
            <p className="my-disclaimer">
              이 날짜에만 적용됩니다. 다른 날은 기존 주간 편성을 따라요.
            </p>
            <p className="my-disclaimer">화면 시연용이며 서버에는 저장되지 않아요.</p>
            <button className="button button-primary my-submit" onClick={saveDayShift}>
              <Check size={16} />
              저장
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'employee-worktime' && (
        <Modal title="직원 근무 시간 변경" onClose={() => setDialog(null)}>
          <div className="my-form">
            <p className="my-cred-target">
              <strong>{dialog.employee.name}</strong> · {dialog.employee.employeeNo}
            </p>
            <div className="my-field">
              <label>근무 조</label>
              <FilterSelect
                label="근무 조 선택"
                value={empShift}
                options={shiftOptions}
                onChange={(value) => setEmpShift(parseShiftKind(value))}
              />
            </div>
            <p className="my-disclaimer">
              현재 {scheduleLabel(dialog.employee.shiftStart, dialog.employee.shiftEnd)} · 선택한
              조의 기본 시간으로 저장됩니다.
            </p>
            {empError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {empError}
              </p>
            )}
            <button
              className="button button-primary my-submit"
              onClick={() => void applyEmployeeWorkTime()}
              disabled={empSubmitting}
            >
              <Timer size={16} />
              {empSubmitting ? '저장 중…' : '저장'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
