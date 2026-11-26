import { createContext, useContext, useEffect } from 'react';

interface PageEntryState {
  onReady: () => void;
  contentLoading: boolean;
  preparing?: boolean;
}

export const PageEntryContext = createContext<PageEntryState | null>(null);

/** 각 페이지의 최초 필수 데이터가 성공하거나 오류로 종료됐을 때 알린다. */
export function usePageEntryReady(ready: boolean): void {
  const onReady = useContext(PageEntryContext)?.onReady;
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);
}

export function usePageContentLoading(): boolean {
  return useContext(PageEntryContext)?.contentLoading ?? false;
}

export function usePageLoadingComplete(): boolean {
  return useContext(PageEntryContext)?.preparing === false;
}
