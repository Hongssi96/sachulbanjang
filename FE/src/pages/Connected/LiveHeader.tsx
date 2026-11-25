import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import useRemote from '../../hooks/useRemote';
import { useAuth } from '../../hooks/useAuth';
import { date, errorMessage, read, text, write } from '../../api/business';
import TabletAccountDialog from '../TabletHomePage/TabletAccountDialog';

export default function LiveHeader({
  title,
  tablet = false,
}: {
  title?: string;
  tablet?: boolean;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(false);
  const closeProfile = useCallback(() => setProfile(false), []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    document.title = `사출반장${title ? ` · ${title}` : ''}${tablet ? ' · iPad' : ''}`;
  }, [title, tablet]);
  const session = useRemote(
    useCallback(async () => {
      const data = await read('/work-session');
      return {
        ends_at: text(data.ends_at),
        server_time: text(data.server_time),
        receivedAt: Date.now(),
      };
    }, []),
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = session.data
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(text(session.data.ends_at)) -
            Date.parse(text(session.data.server_time)) -
            Math.max(0, now - session.data.receivedAt)) /
            60000,
        ),
      )
    : null;
  const reloadSession = session.reload;
  useEffect(() => {
    if (remaining === 0) reloadSession();
  }, [remaining, reloadSession]);
  async function leave() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className={tablet ? 'th-header' : 'topbar'}>
        {title ? (
          <div className="th-header-location">
            <strong>{title}</strong>
          </div>
        ) : null}
        <div className="live-toolbar">
          <span className="live-muted">
            {remaining === null
              ? session.error || '근무 시간 조회 중…'
              : `퇴근까지 ${remaining}분 · ${date(session.data?.ends_at)}`}
          </span>
          <button
            className="th-profile-trigger"
            onClick={() => setProfile(!profile)}
            aria-label="개인 프로필 열기"
          >
            <span className="th-user-avatar">{user?.display_name.charAt(0)}</span>
            <strong>{user?.display_name}</strong>
          </button>
          <button
            className="button button-white"
            disabled={busy || !session.data}
            onClick={async () => {
              if (busy || !session.data) return;
              setBusy(true);
              setError('');
              try {
                await write('/work-session/extensions', 'POST', {
                  kind: 'manual',
                  expected_ends_at: session.data.ends_at,
                });
                session.reload();
              } catch (reason) {
                setError(errorMessage(reason));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '처리 중…' : '로그인 연장'}
          </button>
          <button className="button button-white" disabled={busy} onClick={() => void leave()}>
            로그아웃
          </button>
        </div>
      </header>
      {error && (
        <div className="live-error" role="alert">
          {error}
        </div>
      )}
      {profile && (
        <TabletAccountDialog
          onClose={closeProfile}
          onLoginOpen={() => void leave()}
          remainingMinutes={remaining}
          endsAt={session.data?.ends_at ?? null}
        />
      )}
    </>
  );
}
