import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import profileAvatar from './profile-avatar.svg';
import TabletPasswordDialog from './TabletPasswordDialog';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router';
import { errorMessage } from '../../api/business';
import './TabletAccountDialog.css';

type Screen = 'profile' | 'login' | 'password' | 'signup';

const characters = [
  { id: 'leader', name: '안전 반장', emoji: '' },
  { id: 'bear', name: '든든한 곰', emoji: '🐻' },
  { id: 'fox', name: '똑똑한 여우', emoji: '🦊' },
  { id: 'robot', name: '도우미 로봇', emoji: '🤖' },
  { id: 'cat', name: '꼼꼼한 고양이', emoji: '🐱' },
  { id: 'dog', name: '친근한 강아지', emoji: '🐶' },
  { id: 'rabbit', name: '빠른 토끼', emoji: '🐰' },
  { id: 'panda', name: '차분한 판다', emoji: '🐼' },
];

interface AccountProps {
  onClose: () => void;
  onLoginOpen: () => void;
  password?: string;
  onPasswordChange?: (value: string) => void;
  page?: boolean;
}

export default function TabletAccountDialog({ onClose, onLoginOpen, page = false }: AccountProps) {
  const { user, login, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [screen, setScreen] = useState<Screen>(page ? 'login' : 'profile');
  const [account, setAccount] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [choosingCharacter, setChoosingCharacter] = useState(false);
  const [characterId, setCharacterId] = useState(() => {
    try {
      const saved = localStorage.getItem(`tablet-profile-character-${user?.id ?? 'guest'}`);
      return characters.some((character) => character.id === saved) ? saved : 'leader';
    } catch {
      return 'leader';
    }
  });
  const selectedCharacter =
    characters.find((character) => character.id === characterId) ?? characters[0];
  const popup = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (page) return;
    const element = popup.current;
    const trigger = document.querySelector<HTMLElement>('.th-profile-trigger');
    if (!element || !trigger) return;
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      element.style.top = `${rect.bottom + 12}px`;
      element.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
    };
    const dismiss = (event: PointerEvent) => {
      if (element.querySelector('.th-profile-password-form')) return;
      if (
        event.target instanceof Node &&
        !element.contains(event.target) &&
        !trigger.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !element.querySelector('.th-profile-password-form')) onClose();
    };
    position();
    element.show();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    window.addEventListener('resize', position);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      element.close();
      window.removeEventListener('resize', position);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
      trigger.focus();
    };
  }, [page, onClose]);
  const go = (target: Screen) => {
    if (target === 'login' && !page) {
      onLoginOpen();
      return;
    }
    setScreen(target);
    setCurrent('');
    setNext('');
    setConfirmation('');
    setMessage('');
    setError('');
  };

  if (page && screen === 'password')
    return (
      <div className="th-login-page">
        <TabletPasswordDialog
          onSave={refreshUser}
          onClose={() => {
            if (!user?.must_change_password) onClose();
          }}
        />
      </div>
    );

  const content = (
    <div className="th-account">
      {!page && (
        <div className="th-account-person">
          <button
            className="th-character-trigger"
            aria-label={`프로필 캐릭터 선택: ${selectedCharacter.name}`}
            aria-expanded={choosingCharacter}
            aria-controls="th-character-picker"
            onClick={() => setChoosingCharacter(!choosingCharacter)}
          >
            {selectedCharacter.emoji ? (
              <span aria-hidden="true">{selectedCharacter.emoji}</span>
            ) : (
              <img className="th-profile-photo" src={profileAvatar} alt="" />
            )}
          </button>
          {choosingCharacter && (
            <div
              className="th-character-picker"
              id="th-character-picker"
              role="group"
              aria-label="프로필 캐릭터"
            >
              {characters.map((character) => (
                <button
                  key={character.id}
                  aria-label={character.name}
                  aria-pressed={character.id === characterId}
                  onClick={() => {
                    setCharacterId(character.id);
                    try {
                      localStorage.setItem(
                        `tablet-profile-character-${user?.id ?? 'guest'}`,
                        character.id,
                      );
                    } catch {
                      /* 저장이 제한된 환경에서도 현재 선택은 유지한다. */
                    }
                    setChoosingCharacter(false);
                  }}
                >
                  {character.emoji ? (
                    <span aria-hidden="true">{character.emoji}</span>
                  ) : (
                    <img src={profileAvatar} alt="" />
                  )}
                  <small>{character.name}</small>
                </button>
              ))}
            </div>
          )}
          <div>
            <strong>{user?.display_name}</strong>
            <p>{user?.role === 'admin' ? '관리자' : '현장 근무자'}</p>
          </div>
        </div>
      )}
      {message && (
        <p className="th-account-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="th-account-error" role="alert">
          {error}
        </p>
      )}
      {screen === 'profile' ? (
        <>
          <dl className="th-account-details">
            <div>
              <dt>아이디</dt>
              <dd>{user?.employee_no}</dd>
            </div>
            <div>
              <dt>계정 권한</dt>
              <dd>{user?.role === 'admin' ? '관리자' : '현장 근무자'}</dd>
            </div>
            <div>
              <dt>근무 종료</dt>
              <dd>상단의 서버 근무 시각 확인</dd>
            </div>
          </dl>
          <button className="button button-primary" onClick={() => setPasswordOpen(true)}>
            비밀번호 변경
          </button>
          <button className="button button-white" onClick={onLoginOpen}>
            <LogOut size={18} />
            로그아웃
          </button>
          {user?.role === 'admin' && (
            <Link className="button button-white" to="/users" onClick={onClose}>
              사번 계정 발급
            </Link>
          )}
        </>
      ) : screen === 'signup' ? (
        <div className="live-form">
          <p>사출반장은 사내에서 발급한 사번 계정으로 이용합니다.</p>
          <p>
            공개 회원가입은 제공하지 않습니다. 이름·소속·담당 업무를 사내 계정 관리자에게 전달하고
            계정을 발급받아 주세요.
          </p>
          <button className="button button-primary" onClick={() => go('login')}>
            로그인으로 돌아가기
          </button>
        </div>
      ) : (
        <form
          className="th-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting) return;
            setError('');
            setMessage('');
            if (screen === 'login') {
              setSubmitting(true);
              try {
                const loggedIn = await login(account.trim(), current);
                if (loggedIn.must_change_password) go('password');
                else onClose();
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setSubmitting(false);
              }
              return;
            }
            setError('로그인 후 프로필에서 비밀번호를 변경해 주세요.');
          }}
        >
          {screen === 'login' && (
            <>
              <p className="th-account-hint">발급받은 사번으로 로그인해 주세요.</p>
              <label>
                아이디
                <input
                  placeholder="사번을 입력해 주세요"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoComplete="username"
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  required
                />
              </label>
            </>
          )}
          <label>
            {screen === 'login' ? '비밀번호' : '현재 비밀번호'}
            <input
              type="password"
              placeholder="비밀번호를 입력해 주세요"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          {screen === 'password' && (
            <>
              <label>
                새 비밀번호
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  required
                  aria-describedby="th-password-rule"
                />
              </label>
              <small id="th-password-rule">영문과 숫자를 포함한 8자 이상</small>
              <label>
                새 비밀번호 확인
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </label>
            </>
          )}
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? '로그인 중…' : screen === 'login' ? '로그인' : '비밀번호 변경하고 로그인'}
          </button>

          {page && screen === 'login' && (
            <button className="button button-white" type="button" onClick={() => go('signup')}>
              회원가입
            </button>
          )}
        </form>
      )}
    </div>
  );
  const title =
    screen === 'profile'
      ? '개인 프로필'
      : screen === 'login'
        ? '로그인'
        : screen === 'signup'
          ? '계정 발급 안내'
          : '비밀번호 변경';
  return page ? (
    <main className={`th-login-page ${screen === 'login' ? 'th-login-screen' : ''}`}>
      <section className="th-login-card" aria-labelledby="th-login-title">
        <span className="th-login-symbol">
          <LogIn size={26} />
        </span>
        <h1 id="th-login-title">{title}</h1>
        <p className="th-login-description">
          {screen === 'signup'
            ? '사내 계정 발급 절차를 확인해 주세요.'
            : '현장 업무를 시작하려면 아이디와 비밀번호를 입력해 주세요.'}
        </p>
        {content}
        <p className="th-login-support">
          계정 발급이나 비밀번호 확인이 필요하면 사내 계정 관리자에게 문의해 주세요.
        </p>
        <button className="th-login-back" onClick={onClose}>
          홈으로 돌아가기
        </button>
      </section>
    </main>
  ) : (
    <dialog
      ref={popup}
      className={`th-profile-popup ${screen === 'profile' ? 'th-profile-scenic' : ''}`}
      aria-labelledby="th-profile-title"
    >
      <div className="th-profile-heading">
        <h2 id="th-profile-title">{title}</h2>
        <button className="icon-button" aria-label="프로필 닫기" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {content}
      {passwordOpen && (
        <TabletPasswordDialog onSave={refreshUser} onClose={() => setPasswordOpen(false)} />
      )}
    </dialog>
  );
}
