import { useCallback, useEffect, useRef, useState } from 'react';

export interface ApiQueryResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

interface ApiQueryOptions {
  /** 주어진 간격(ms)으로 다시 조회한다. 완료 후 다음 조회를 예약한다. */
  pollMs?: number;
  enabled?: boolean;
}

/**
 * 화면 데이터를 API에서 읽어 로딩·오류·빈 결과를 처리한다.
 * key가 바뀌면 다시 조회하며, fetcher는 매 렌더의 최신 함수를 사용한다.
 */
export function useApiQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: ApiQueryOptions = {},
): ApiQueryResult<T> {
  const { pollMs, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: number | undefined;

    const run = async (showLoading: boolean) => {
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetcherRef.current();
        if (!active) return;
        setData(result);
        setError(null);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught : new Error('데이터를 불러오지 못했습니다.'));
      } finally {
        if (active) {
          setLoading(false);
          if (pollMs) timer = window.setTimeout(() => void run(false), pollMs);
        }
      }
    };

    void run(true);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [key, enabled, pollMs, nonce]);

  return { data, error, loading, reload };
}
