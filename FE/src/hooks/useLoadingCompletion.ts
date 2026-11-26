import { useEffect, useState } from 'react';

/** 준비 완료를 표시할 짧은 시간만 유지한 뒤 로딩을 닫는다. */
export function useLoadingCompletion(loading: boolean, finishDelayMs: number): boolean {
  const [finished, setFinished] = useState(!loading);

  useEffect(() => {
    if (finishDelayMs === 0) return;
    if (loading) {
      setFinished(false);
      return;
    }
    const timer = window.setTimeout(() => setFinished(true), finishDelayMs);
    return () => window.clearTimeout(timer);
  }, [loading, finishDelayMs]);

  return loading || (finishDelayMs > 0 && !finished);
}
