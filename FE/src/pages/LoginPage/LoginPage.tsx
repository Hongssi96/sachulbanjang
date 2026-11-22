import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import {
  Activity,
  ArrowRightLeft,
  Eye,
  EyeOff,
  Factory,
  FileChartColumn,
  LoaderCircle,
  LogIn,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import logoMark from '../../assets/logo-mark.png';
import LoadingState from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { consumeLoggedOut } from '../../utils/logoutNotice';
import './LoginPage.css';

interface FieldErrors {
  employeeNo?: string;
  password?: string;
}

function resolveReturnPath(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as { from?: unknown }).from;
    if (
      typeof from === 'string' &&
      from.startsWith('/') &&
      !from.startsWith('//') &&
      !from.startsWith('/login')
    ) {
      return from;
    }
  }
  return '/';
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ACCOUNT_LOCKED' && error.retryAfterSeconds !== undefined) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return `로그인 시도가 제한되었습니다. 약 ${minutes}분 후 다시 시도해 주세요.`;
    }
    return error.message;
  }
  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export default function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const employeeId = useId();
  const passwordId = useId();
  const employeeErrorId = useId();
  const passwordErrorId = useId();
  const errorRef = useRef<HTMLDivElement>(null);

  const [employeeNo, setEmployeeNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);

  const returnPath = resolveReturnPath(location.state);

  useEffect(() => {
    document.title = '사출반장 · 로그인';
  }, []);

  useEffect(() => {
    if (consumeLoggedOut()) setLoggedOut(true);
  }, []);

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  if (status === 'authenticated') return <Navigate to={returnPath} replace />;
  if (status === 'checking') {
    return (
      <div className="login-page login-page-loading">
        <LoadingState label="로그인 상태를 확인하는 중이에요" />
      </div>
    );
  }

  const updateEmployeeNo = (value: string) => {
    setEmployeeNo(value);
    setFieldErrors((previous) => ({ ...previous, employeeNo: undefined }));
    setSubmitError('');
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    setFieldErrors((previous) => ({ ...previous, password: undefined }));
    setSubmitError('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    if (!employeeNo.trim()) nextErrors.employeeNo = '사번을 입력해 주세요.';
    if (!password) nextErrors.password = '비밀번호를 입력해 주세요.';
    if (nextErrors.employeeNo || nextErrors.password) {
      setFieldErrors(nextErrors);
      setSubmitError('');
      return;
    }

    setFieldErrors({});
    setSubmitError('');
    setSubmitting(true);
    try {
      await login(employeeNo.trim(), password);
    } catch (error) {
      setSubmitError(loginErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand" aria-label="사출반장 소개">
        <div className="login-brand-top">
          <img className="login-logo" src={logoMark} alt="" />
          <span className="login-brand-name">
            사출반장
            <small>YOUR FACTORY PARTNER</small>
          </span>
        </div>

        <div className="login-brand-copy">
          <p className="login-eyebrow">사출성형 현장 파트너</p>
          <h1>
            오늘의 공장을
            <br />
            한눈에.
          </h1>
          <p>
            실시간 공정부터 품질, 재고, 인수인계까지. 현장에서 필요한 정보를 한 곳에서 빠르게
            확인하세요.
          </p>
        </div>

        <ul className="login-points">
          <li>
            <Activity size={19} aria-hidden="true" />
            <span>
              <strong>실시간 공정</strong>
              <span>설비 상태와 생산 흐름을 한 화면에서 확인</span>
            </span>
          </li>
          <li>
            <FileChartColumn size={19} aria-hidden="true" />
            <span>
              <strong>품질 리포트</strong>
              <span>검사 기록과 불량 추이를 빠르게 파악</span>
            </span>
          </li>
          <li>
            <ArrowRightLeft size={19} aria-hidden="true" />
            <span>
              <strong>인수인계</strong>
              <span>교대 근무 사이 필요한 내용을 놓치지 않게</span>
            </span>
          </li>
        </ul>

        <p className="login-brand-foot">업무 화면은 시연 데이터로 제공됩니다.</p>
      </section>

      <main className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-mark">
              <Factory size={22} aria-hidden="true" />
            </span>
            <h2>로그인</h2>
            <p>사번과 비밀번호를 입력해 주세요.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {loggedOut && (
              <p className="login-notice" role="status">
                로그아웃되었습니다. 오늘 하루 수고하셨어요!
              </p>
            )}

            {submitError && (
              <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}>
                <TriangleAlert size={18} aria-hidden="true" />
                <span>{submitError}</span>
              </div>
            )}

            <div className={`login-field ${fieldErrors.employeeNo ? 'has-error' : ''}`}>
              <label htmlFor={employeeId}>사번</label>
              <input
                id={employeeId}
                name="employeeNo"
                type="text"
                value={employeeNo}
                onChange={(event) => updateEmployeeNo(event.target.value)}
                placeholder="사번을 입력해 주세요"
                autoComplete="username"
                maxLength={50}
                autoFocus
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.employeeNo)}
                aria-describedby={fieldErrors.employeeNo ? employeeErrorId : undefined}
              />
              {fieldErrors.employeeNo && (
                <p className="login-field-error" id={employeeErrorId}>
                  {fieldErrors.employeeNo}
                </p>
              )}
            </div>

            <div className={`login-field ${fieldErrors.password ? 'has-error' : ''}`}>
              <label htmlFor={passwordId}>비밀번호</label>
              <div className="login-input-wrap has-toggle">
                <input
                  id={passwordId}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => updatePassword(event.target.value)}
                  placeholder="비밀번호를 입력해 주세요"
                  autoComplete="current-password"
                  maxLength={1024}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showPassword}
                  disabled={submitting}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="login-field-error" id={passwordErrorId}>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <LoaderCircle className="login-spinner" size={18} aria-hidden="true" />
                  로그인 중...
                </>
              ) : (
                <>
                  <LogIn size={18} aria-hidden="true" />
                  로그인
                </>
              )}
            </button>
          </form>

          <p className="login-help">
            <ShieldCheck size={15} aria-hidden="true" />
            계정이 없거나 비밀번호를 잊으셨다면 관리자에게 문의해 주세요.
          </p>
        </div>

        <p className="login-panel-foot">
          <span>사출반장</span>
          <span aria-hidden="true">·</span>
          <span>YOUR FACTORY PARTNER</span>
        </p>
      </main>
    </div>
  );
}
