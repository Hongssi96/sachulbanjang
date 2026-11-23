import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import profileAvatar from './profile-avatar.svg';
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
  password: string;
  onPasswordChange: (value: string) => void;
  page?: boolean;
}

export default function TabletAccountDialog({
  onClose,
  onLoginOpen,
  password,
  onPasswordChange,
  page = false,
}: AccountProps) {
  const [screen, setScreen] = useState<Screen>(page ? 'login' : 'profile');
  const [account, setAccount] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupId, setSignupId] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmation, setSignupConfirmation] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [choosingCharacter, setChoosingCharacter] = useState(false);
  const [characterId, setCharacterId] = useState(() => {
    try {
      const saved = localStorage.getItem('tablet-profile-character');
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
      if (
        event.target instanceof Node &&
        !element.contains(event.target) &&
        !trigger.contains(event.target)
      )
        onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
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
                      localStorage.setItem('tablet-profile-character', character.id);
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
            <strong>박민규</strong>
            <p>현장을 살피는 든든한 반장</p>
          </div>
        </div>
      )}
      {!page && (
        <p className="th-account-demo">
          시연용 화면입니다. 실제 계정과 연결되지 않으며 새로고침하면 변경 내용이 초기화됩니다.
        </p>
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
              <dd>leader</dd>
            </div>
            <div>
              <dt>근무 시간</dt>
              <dd>08:00–17:00</dd>
            </div>
            <div>
              <dt>담당 업무</dt>
              <dd>현장 관리 · 설비 점검</dd>
            </div>
          </dl>
          <button className="button button-primary" onClick={() => go('login')}>
            로그인 화면으로
          </button>
          <button className="button button-white" onClick={onLoginOpen}>
            <LogOut size={18} />
            로그아웃
          </button>
        </>
      ) : screen === 'signup' ? (
        <form
          className="th-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setMessage('');
            if (!signupName.trim() || !/^[A-Za-z0-9_-]{4,20}$/.test(signupId)) {
              setError(
                '이름과 아이디를 확인해 주세요. 아이디는 영문·숫자·밑줄·하이픈 4~20자로 입력해 주세요.',
              );
              return;
            }
            if (
              signupPassword.length < 8 ||
              !/[A-Za-z]/.test(signupPassword) ||
              !/[0-9]/.test(signupPassword)
            ) {
              setError('비밀번호는 영문과 숫자를 포함한 8자 이상으로 입력해 주세요.');
              return;
            }
            if (signupPassword !== signupConfirmation) {
              setError('비밀번호 확인이 일치하지 않습니다.');
              return;
            }
            setSignupPassword('');
            setSignupConfirmation('');
            setMessage(
              '입력 정보를 확인했어요. 아직 서버와 연결되지 않아 계정은 생성되지 않습니다.',
            );
          }}
        >
          <label>
            이름
            <input
              autoComplete="name"
              placeholder="이름을 입력해 주세요"
              maxLength={50}
              value={signupName}
              onChange={(event) => setSignupName(event.target.value)}
              required
            />
          </label>
          <label>
            아이디
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="영문·숫자 4~20자"
              minLength={4}
              maxLength={20}
              value={signupId}
              onChange={(event) => setSignupId(event.target.value)}
              required
              aria-describedby="th-signup-id-help"
            />
          </label>
          <small id="th-signup-id-help">영문·숫자·밑줄(_)·하이픈(-)을 사용할 수 있어요.</small>
          <label>
            비밀번호
            <input
              type="password"
              autoComplete="new-password"
              placeholder="영문·숫자 포함 8자 이상"
              minLength={8}
              value={signupPassword}
              onChange={(event) => setSignupPassword(event.target.value)}
              required
            />
          </label>
          <label>
            비밀번호 확인
            <input
              type="password"
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력해 주세요"
              value={signupConfirmation}
              onChange={(event) => setSignupConfirmation(event.target.value)}
              required
            />
          </label>
          <button className="button button-primary" type="submit">
            회원가입
          </button>
          <button
            className="button button-white"
            type="button"
            onClick={() => {
              setSignupPassword('');
              setSignupConfirmation('');
              go('login');
            }}
          >
            로그인으로 돌아가기
          </button>
        </form>
      ) : (
        <form
          className="th-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setMessage('');
            if (screen === 'login') {
              if (account !== 'leader' || current !== password) {
                setError('아이디 또는 비밀번호를 확인해 주세요.');
                return;
              }
              if (page) {
                onClose();
                return;
              }
              go('profile');
              setMessage('시연 계정으로 로그인했어요.');
              return;
            }
            if (current !== password) {
              setError('현재 비밀번호가 일치하지 않습니다.');
              return;
            }
            if (next.length < 8 || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
              setError('새 비밀번호는 영문과 숫자를 포함해 8자 이상 입력해 주세요.');
              return;
            }
            if (next === current) {
              setError('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
              return;
            }
            if (next !== confirmation) {
              setError('새 비밀번호 확인이 일치하지 않습니다.');
              return;
            }
            onPasswordChange(next);
            go('login');
            setMessage('비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.');
          }}
        >
          {screen === 'login' && (
            <>
              <p className="th-account-hint">시연 아이디: leader · 초기 비밀번호: Tablet123!</p>
              <label>
                아이디
                <input
                  placeholder="아이디를 입력해 주세요"
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
          <button className="button button-primary" type="submit">
            {screen === 'login' ? '로그인' : '비밀번호 변경하고 로그인'}
          </button>
          <button
            className="button button-white"
            type="button"
            onClick={() => go(screen === 'login' ? 'password' : 'profile')}
          >
            {screen === 'login' ? '비밀번호 변경' : '프로필로 돌아가기'}
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
          ? '회원가입'
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
            ? '현장 업무에 사용할 계정 정보를 입력해 주세요.'
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
    </dialog>
  );
}
