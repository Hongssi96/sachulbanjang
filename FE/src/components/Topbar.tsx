import { useEffect, useState } from 'react';
import { Bell, Moon, Sun } from 'lucide-react';

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
  dark: boolean;
  onToggleDark: () => void;
  onBell: () => void;
  extended: boolean;
  onToggleExtended: () => void;
  sessionEnded: boolean;
  sessionFired: boolean;
  onSessionEnd: () => void;
  onLogout: () => void;
  onRelogin: () => void;
}
export default function Topbar({
  title,
  dark,
  onToggleDark,
  onBell,
  extended,
  onToggleExtended,
  sessionEnded,
  sessionFired,
  onSessionEnd,
  onLogout,
  onRelogin,
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
      <strong className="topbar-title">{title}</strong>
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
        <span className="avatar">민</span>
        <span className="user-greeting">
          박민규 님{' '}
          {sessionEnded ? '로그아웃됨' : extended ? '오늘 야근 중이에요' : offWorkCountdown(now)}
        </span>
        <button
          className="button button-white topbar-extend"
          onClick={sessionEnded ? onRelogin : extended ? onLogout : onToggleExtended}
        >
          {sessionEnded ? '다시 로그인' : extended ? '퇴근하기' : '오늘 야근'}
        </button>
      </div>
    </header>
  );
}
