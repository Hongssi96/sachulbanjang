import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';

export default function TabletPasswordDialog({
  password,
  onSave,
  onClose,
}: {
  password: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const dialog = form.current?.closest('dialog');
    const profile = dialog?.parentElement?.closest('dialog');
    if (!dialog || !profile) return;
    const position = () => {
      const rect = profile.getBoundingClientRect();
      Object.assign(dialog.style, {
        top: `${rect.top + 180}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${Math.max(440, rect.height - 40) - 150}px`,
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(profile);
    window.addEventListener('resize', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  }, []);
  return (
    <Modal title="비밀번호 변경" onClose={onClose}>
      <form
        ref={form}
        className="th-form th-account th-profile-password-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
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
          onSave(next);
          setCurrent('');
          setNext('');
          setConfirmation('');
          setSaved(true);
        }}
      >
        {saved ? (
          <>
            <p className="th-account-success" role="status">
              비밀번호를 변경했어요.
            </p>
            <button className="button button-primary" type="button" onClick={onClose}>
              확인
            </button>
          </>
        ) : (
          <>
            <p className="th-account-demo">
              현재 태블릿의 시연 계정에 적용되며 새로고침하면 초기화됩니다.
            </p>
            {error && (
              <p className="th-account-error" role="alert">
                {error}
              </p>
            )}
            <label>
              현재 비밀번호
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                required
              />
            </label>
            <label>
              새 비밀번호
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                aria-describedby="th-popup-password-rule"
                required
              />
            </label>
            <small id="th-popup-password-rule">영문과 숫자를 포함한 8자 이상</small>
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
            <button className="button button-primary" type="submit">
              비밀번호 변경
            </button>
          </>
        )}
      </form>
    </Modal>
  );
}
