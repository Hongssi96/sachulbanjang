import { useEffect, useState } from 'react';
import { usePageLoadingComplete } from '../PageEntry/PageEntryContext';
import {
  TABLET_LOADING_FINISH_MS,
  TABLET_LOADING_PROGRESS_PER_MS,
} from './TabletLoading.constants';
import './TabletLoading.css';

interface TabletLoadingProps {
  label?: string;
  fullScreen?: boolean;
  complete?: boolean;
}

export default function TabletLoading({
  label = '화면을 준비중',
  fullScreen = false,
  complete: completeProp,
}: TabletLoadingProps) {
  const pageComplete = usePageLoadingComplete();
  const complete = completeProp ?? pageComplete;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (complete) return;
    const startedAt = performance.now();
    // API에 진행률이 없으므로 대기 중 표시만 95%까지 늘린다. 완료 시점은 PageEntry가 정한다.
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      setProgress(Math.min(95, elapsed * TABLET_LOADING_PROGRESS_PER_MS));
    }, 100);
    return () => window.clearInterval(timer);
  }, [complete]);

  const displayedProgress = complete ? 100 : progress;
  const transitionDuration = complete
    ? `${Math.min(TABLET_LOADING_FINISH_MS, (100 - progress) / TABLET_LOADING_PROGRESS_PER_MS)}ms`
    : undefined;

  return (
    <div
      className={`tablet-loading${fullScreen ? ' is-full-screen' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="tablet-loading-content" aria-hidden="true">
        <div className="tablet-loading-percentage">
          <span style={{ left: `${displayedProgress}%`, transitionDuration }}>
            {Math.round(displayedProgress)}%
          </span>
        </div>
        <div className="tablet-loading-track">
          <div
            className="tablet-loading-fill"
            style={{ width: `${displayedProgress}%`, transitionDuration }}
          />
        </div>
        <p>화면을 준비중</p>
      </div>
    </div>
  );
}
