import { useEffect, useState } from 'react';
import { Bell, Moon, Sun } from 'lucide-react';
import type { AuthenticatedUser } from '../api/auth';

// 주간 근무 08:00–17:00 기준 퇴근 시각(분 단위)
const WORK_END_MINUTES = 17 * 60;

function offWorkCountdown(now: Date) {
  const remaining = WORK_END_MINUTES - (now.getHours() * 60 + now.getMinutes());
  if (remaining >= 60) return '퇴근까지 60분!';
  if (remaining > 0) return `퇴근까지 ${remaining}분!`;
  return '퇴근 시간이에요!';
}

interface TopbarProps {
  title: string;
  /** 제목 옆 보조 정보(예: 실시간 공정의 마지막 갱신 시각) */
  meta?: string;
  user: AuthenticatedUser;
  dark: boolean;
  onToggleDark: () => void;
  onBell: () => void;
  extended: boolean;
  onToggleExtended: () => void;
  sessionEnded: boolean;
  sessionFired: boolean;
  onSessionEnd: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}
export default function Topbar({
  title,
  meta,
  user,
  dark,
  onToggleDark,
  onBell,
  extended,
  onToggleExtended,
  sessionEnded,
  sessionFired,
  onSessionEnd,
  onLogout,
  loggingOut,
}: TopbarProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const remaining = WORK_END_MINUTES - (now.getHours() * 60 + now.getMinutes());
    if (remaining <= 0 && !sessionFired && !extended) onSessionEnd();
  }, [now, sessionFired, extended, onSessionEnd]);
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <strong className="topbar-title">{title}</strong>
        {meta && <span className="topbar-meta">{meta}</span>}
      </div>
      <div className="topbar-actions">
        <button
          className="icon-button"
          onClick={onToggleDark}
          aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {dark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button
          className="icon-button notification-button"
          aria-label="알림 3건 보기"
          onClick={onBell}
        >
          <Bell size={20} />
          <i />
        </button>
        <span className="avatar" aria-hidden="true">
          {user.display_name.trim().charAt(0) || '?'}
        </span>
        <span className="user-greeting">
          {user.display_name} 님{' '}
          {sessionEnded ? '퇴근 완료' : extended ? '오늘 야근 중이에요' : offWorkCountdown(now)}
        </span>
        <button
          className="button button-white topbar-extend"
          onClick={extended ? onLogout : onToggleExtended}
          disabled={loggingOut}
        >
          {extended ? '퇴근하기' : '오늘 야근'}
        </button>
      </div>
    </header>
  );
}
