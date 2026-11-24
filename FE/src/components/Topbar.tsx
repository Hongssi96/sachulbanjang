import { useEffect, useRef, useState } from 'react';
import { Bell, Moon, Sun } from 'lucide-react';
import type { AuthenticatedUser } from '../api/auth';
import { useWorkSession } from '../hooks/useWorkSession';

/** 브라우저 시간대와 무관하게 근무 시각은 한국(Asia/Seoul) 기준으로 계산한다. */
function seoulClock(date: Date): { minutes: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '0';
  return {
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
    dateKey: `${part('year')}-${part('month')}-${part('day')}`,
  };
}

function seoulEndMinutes(value: string | undefined): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return seoulClock(date).minutes;
}

function offWorkCountdown(now: Date, endMinutes: number) {
  const remaining = endMinutes - seoulClock(now).minutes;
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
  onProfile: () => void;
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
  onProfile,
  onLogout,
  loggingOut,
}: TopbarProps) {
  const [now, setNow] = useState(() => new Date());
  const { session } = useWorkSession();
  const endMinutes = seoulEndMinutes(session?.ends_at) ?? 17 * 60;
  // 근무 종료 시각을 넘어가는 순간에만 퇴근 알림을 띄운다.
  // (이미 지난 시각으로 설정하거나, 앱을 늦게 열어도 알림이 곧바로 뜨지 않게 한다.)
  const crossing = useRef<{ key: string; remaining: number } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const clock = seoulClock(now);
    const remaining = endMinutes - clock.minutes;
    const key = `${clock.dateKey}-${endMinutes}`;
    const previous = crossing.current;
    if (
      previous &&
      previous.key === key &&
      previous.remaining > 0 &&
      remaining <= 0 &&
      !sessionFired &&
      !extended
    ) {
      onSessionEnd();
    }
    crossing.current = { key, remaining };
  }, [now, sessionFired, extended, onSessionEnd, endMinutes]);
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
        <button type="button" className="topbar-profile" onClick={onProfile} aria-label="관리 열기">
          <span className="avatar" aria-hidden="true">
            {user.display_name.trim().charAt(0) || '?'}
          </span>
          <span className="user-greeting">
            {user.display_name} 님{' '}
            {sessionEnded
              ? '퇴근 완료'
              : extended
                ? '오늘 야근 중이에요'
                : offWorkCountdown(now, endMinutes)}
          </span>
        </button>
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
