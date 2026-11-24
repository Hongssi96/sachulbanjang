import { useId, useState } from 'react';
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
import { ApiError } from '../../api/client';
import type { AuthenticatedUser } from '../../api/auth';
import { changePassword } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import {
  DEFAULT_END,
  DEFAULT_START,
  SHIFTS,
  SHIFT_ORDER,
  createTemporaryPassword,
  demoEmployees,
  hourOptions,
  loadEmployees,
  persistEmployees,
  roleLabels,
  roleOptions,
  scheduleLabel,
  dayKey,
  loadDayOverrides,
  persistDayOverrides,
  shiftForWeek,
  shiftOptions,
} from './MyPageModel';
import type { DayOverrides, Employee, EmployeeStatus, ShiftKind } from './MyPageModel';
import { setWorkTime, useWorkTime } from '../../services/workTimeStore';
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

type Dialog =
  | { kind: 'password' }
  | { kind: 'self-worktime' }
  | { kind: 'register' }
  | { kind: 'credentials'; employee: Employee; mode: 'setup' | 'reset' }
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
  const { user, updateUser } = useAuth();
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
  const selfWorkTime = useWorkTime();
  const [selfStart, setSelfStart] = useState(DEFAULT_START);
  const [selfEnd, setSelfEnd] = useState(DEFAULT_END);
  // 직원 관리
  const [employees, setEmployees] = useState<Employee[]>(loadEmployees);
  const [newName, setNewName] = useState('');
  const [newEmployeeNo, setNewEmployeeNo] = useState('');
  const [newRole, setNewRole] = useState<AuthenticatedUser['role']>('worker');
  const [regShift, setRegShift] = useState<ShiftKind>('주간');
  const [credOriginalId, setCredOriginalId] = useState('');
  const [credName, setCredName] = useState('');
  const [credId, setCredId] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [empShift, setEmpShift] = useState<ShiftKind>('주간');
  const [notifications, setNotifications] = useState(loadNotifications);
  const [registerError, setRegisterError] = useState('');
  const [credError, setCredError] = useState('');
  const [credNotice, setCredNotice] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOverrides, setDayOverrides] = useState<DayOverrides>(loadDayOverrides);
  const [dayShifts, setDayShifts] = useState<Record<string, ShiftKind>>({});

  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const initial = user.display_name.trim().charAt(0) || '?';

  const commitEmployees = (next: Employee[], message: string) => {
    setEmployees(next);
    onToast(persistEmployees(next) ? message : `${message} 브라우저 저장에 실패했어요.`);
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
    setSelfStart(selfWorkTime.start);
    setSelfEnd(selfWorkTime.end);
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
    setCredOriginalId(employee.id);
    setCredName(employee.name);
    setCredId(employee.id);
    setCredPassword(createTemporaryPassword());
    setCredError('');
    setCredNotice('');
    setDialog({ kind: 'credentials', employee, mode });
  };
  const openEmployeeWorkTime = (employee: Employee) => {
    setEmpShift(employee.shift);
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
      updateUser(updated);
      setDialog(null);
      onToast('비밀번호를 변경했어요.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CURRENT_PASSWORD_MISMATCH') {
        setFieldErrors({ current: '현재 비밀번호가 올바르지 않습니다.' });
      } else if (error instanceof ApiError && error.code === 'PASSWORD_UNCHANGED') {
        setFieldErrors({ next: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : '비밀번호를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const applySelfWorkTime = () => {
    const next = { start: selfStart, end: selfEnd };
    setWorkTime(next);
    setDialog(null);
    onToast(`근무 시간을 ${scheduleLabel(next.start, next.end)}로 변경했어요.`);
  };

  const submitRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    const employeeNo = newEmployeeNo.trim();
    if (!name || !employeeNo) {
      setRegisterError('이름과 사번을 입력해 주세요.');
      return;
    }
    if (employees.some((employee) => employee.id === employeeNo)) {
      setRegisterError('같은 사번의 직원이 이미 있어요.');
      return;
    }
    setRegisterError('');
    commitEmployees(
      [
        ...employees,
        {
          id: employeeNo,
          name,
          role: newRole,
          status: '임시 비밀번호',
          shift: regShift,
        },
      ],
      `${name} 님을 등록했어요.`,
    );
    setDialog(null);
  };

  const applyCredentials = () => {
    if (!dialog || dialog.kind !== 'credentials') return;
    const id = credId.trim();
    if (!id) {
      setCredError('아이디를 입력해 주세요.');
      return;
    }
    if (employees.some((employee) => employee.id === id && employee.id !== credOriginalId)) {
      setCredError('같은 아이디의 직원이 이미 있어요.');
      return;
    }
    setCredError('');
    setCredNotice('');
    commitEmployees(
      employees.map((employee) =>
        employee.id === credOriginalId
          ? { ...employee, id, status: '임시 비밀번호' as EmployeeStatus }
          : employee,
      ),
      dialog.mode === 'setup'
        ? `${credName} 님의 아이디·비밀번호를 설정했어요.`
        : `${credName} 님의 비밀번호를 임시 비밀번호로 초기화했어요.`,
    );
    setDialog(null);
  };

  const applyEmployeeWorkTime = () => {
    if (!dialog || dialog.kind !== 'employee-worktime') return;
    commitEmployees(
      employees.map((employee) =>
        employee.id === dialog.employee.id ? { ...employee, shift: empShift } : employee,
      ),
      `${dialog.employee.name} 님의 근무 조를 ${empShift}(${SHIFTS[empShift].time})로 변경했어요.`,
    );
    setDialog(null);
  };

  const confirmDelete = () => {
    if (!dialog || dialog.kind !== 'delete') return;
    commitEmployees(
      employees.filter((employee) => employee.id !== dialog.employee.id),
      `${dialog.employee.name} 님을 삭제했어요.`,
    );
    setDialog(null);
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
    commitEmployees(demoEmployees, '목록을 처음 상태로 되돌렸어요.');
  };

  // 주간 스케줄: 주 단위 로테이션 편성을 조별로 보여준다(시연).
  const bandPill: Record<ShiftKind, string> = {
    주간: 'pill-green',
    야간: 'pill-violet',
    심야: 'pill-neutral',
  };
  const today = new Date();
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + weekOffset * 7);
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const workers = employees.filter((employee) => employee.role === 'worker');
  const employeeShift = (employee: Employee) => shiftForWeek(employee.shift, weekOffset);
  const shiftOn = (employee: Employee, key: string) =>
    dayOverrides[key]?.[employee.id] ?? shiftForWeek(employee.shift, weekOffset);
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
      base[employee.id] = shiftOn(employee, key);
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
          </dl>
          <div className="my-settings">
            <div className="my-setting">
              <span className="my-setting-label">근무 시간</span>
              <span className="my-setting-value">
                {scheduleLabel(selfWorkTime.start, selfWorkTime.end)}
              </span>
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
                  {employees.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <strong>{employee.name}</strong>
                      </td>
                      <td className="my-muted">{employee.id}</td>
                      <td>{roleLabels[employee.role]}</td>
                      <td className="my-muted">
                        {`${employeeShift(employee)} ${SHIFTS[employeeShift(employee)].time}`}
                      </td>
                      <td>
                        <span
                          className={`pill ${employee.status === '재직' ? 'pill-green' : 'pill-amber'}`}
                        >
                          {employee.status}
                        </span>
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
                            onClick={() => setDialog({ kind: 'delete', employee })}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="my-table-footer">
              <span>
                전체 {employees.length}명 · 현장직원{' '}
                {employees.filter((employee) => employee.role === 'worker').length}명
              </span>
              <button className="my-link" onClick={resetDemo}>
                <RotateCcw size={13} /> 목록 초기화
              </button>
            </div>
            <section className="my-schedule" aria-labelledby="my-schedule-heading">
              <div className="my-card-header">
                <div className="heading-inline">
                  <h2 id="my-schedule-heading">주간 스케줄</h2>
                  <span className="pill pill-neutral">{weekLabel}</span>
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
                      {dayOverrides[day.key] && <i className="my-day-edited" aria-hidden="true" />}
                    </span>
                    <span className="my-day-shifts">
                      {SHIFT_ORDER.map((band) => {
                        const names = membersOn(day.key, band).map((employee) => employee.name);
                        return (
                          <span className="my-day-shift" key={band}>
                            <span className={`pill ${bandPill[band]}`}>{band}</span>
                            <span className="my-day-names" title={names.join(', ') || '배정 없음'}>
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
            <div className="my-time-row">
              <div className="my-field">
                <label>시작</label>
                <FilterSelect
                  label="근무 시작 시각"
                  value={selfStart}
                  options={hourOptions}
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
                  options={hourOptions}
                  onChange={setSelfEnd}
                />
              </div>
            </div>
            <button className="button button-primary my-submit" onClick={applySelfWorkTime}>
              <Timer size={16} />
              저장
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
              />
            </div>
            <div className="my-field">
              <label>역할</label>
              <FilterSelect
                label="역할 선택"
                value={newRole}
                options={roleOptions}
                onChange={(value) => setNewRole(value as AuthenticatedUser['role'])}
              />
            </div>
            <div className="my-field">
              <label>근무 조</label>
              <FilterSelect
                label="근무 조 선택"
                value={regShift}
                options={shiftOptions}
                onChange={(value) => setRegShift(value as ShiftKind)}
              />
            </div>
            {registerError && (
              <p className="my-form-error" role="alert">
                <TriangleAlert size={15} />
                {registerError}
              </p>
            )}
            <button className="button button-primary my-submit" type="submit">
              <Plus size={16} />
              등록
            </button>
          </form>
        </Modal>
      )}

      {dialog?.kind === 'credentials' && (
        <Modal
          title={dialog.mode === 'setup' ? '아이디·비밀번호 설정' : '비밀번호 초기화'}
          onClose={() => setDialog(null)}
        >
          <div className="my-form">
            <p className="my-cred-target">
              <strong>{credName}</strong> 님
            </p>
            <div className="my-field">
              <label htmlFor="my-cred-id">아이디(사번)</label>
              <input
                id="my-cred-id"
                value={credId}
                onChange={(event) => {
                  setCredId(event.target.value);
                  setCredError('');
                }}
                maxLength={20}
                readOnly={dialog.mode === 'reset'}
              />
            </div>
            <div className="my-field">
              <label htmlFor="my-cred-pw">임시 비밀번호</label>
              <div className="my-input">
                <input id="my-cred-pw" value={credPassword} readOnly />
                <button
                  type="button"
                  className="my-toggle"
                  aria-label="임시 비밀번호 복사"
                  onClick={() => void copyText(credPassword)}
                >
                  <Copy size={17} />
                </button>
              </div>
            </div>
            <button
              className="my-link my-regenerate"
              onClick={() => {
                setCredPassword(createTemporaryPassword());
                setCredNotice('');
                setCredError('');
              }}
            >
              <RotateCcw size={13} /> 임시 비밀번호 다시 생성
            </button>
            <p className="my-disclaimer">임시 비밀번호는 이 화면에서 한 번만 표시됩니다.</p>
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
            <button className="button button-primary my-submit" onClick={applyCredentials}>
              <Check size={16} />
              적용
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal title="직원 삭제" plain onClose={() => setDialog(null)}>
          <div className="confirm-dialog">
            <p>이 직원을 삭제할까요? 삭제하면 목록에서 사라집니다.</p>
            <strong>
              {dialog.employee.name} · {dialog.employee.id}
            </strong>
            <div className="confirm-actions">
              <button className="button button-white" onClick={() => setDialog(null)}>
                취소
              </button>
              <button className="button button-primary" onClick={confirmDelete}>
                <Trash2 size={16} />
                삭제
              </button>
            </div>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'day-shift' && (
        <Modal title={`${dialog.label} 조 편성`} onClose={() => setDialog(null)}>
          <div className="my-form">
            {workers.length === 0 && (
              <p className="my-disclaimer">등록된 현장직원이 없어 조를 바꿀 수 없어요.</p>
            )}
            {workers.map((employee) => (
              <div className="my-field" key={employee.id}>
                <label>{employee.name}</label>
                <FilterSelect
                  label={`${employee.name} 근무 조`}
                  value={dayShifts[employee.id] ?? '주간'}
                  options={shiftOptions}
                  onChange={(value) =>
                    setDayShifts((previous) => ({ ...previous, [employee.id]: value as ShiftKind }))
                  }
                />
              </div>
            ))}
            {dayOverrides[dialog.dateKey] && (
              <button className="my-link my-regenerate" onClick={resetDayShift}>
                <RotateCcw size={13} /> 기본값으로 되돌리기
              </button>
            )}
            <p className="my-disclaimer">
              이 날짜에만 적용됩니다. 다른 날은 기존 주간 편성을 따라요.
            </p>
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
              <strong>{dialog.employee.name}</strong> · {dialog.employee.id}
            </p>
            <div className="my-field">
              <label>근무 조</label>
              <FilterSelect
                label="근무 조 선택"
                value={empShift}
                options={shiftOptions}
                onChange={(value) => setEmpShift(value as ShiftKind)}
              />
            </div>
            <button className="button button-primary my-submit" onClick={applyEmployeeWorkTime}>
              <Timer size={16} />
              저장
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
