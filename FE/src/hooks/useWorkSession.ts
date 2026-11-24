import { useCallback, useState } from 'react';
import { fetchWorkSession, extendWorkSession } from '../api/workSession';
import type { WorkSession } from '../api/workSession';
import { useApiQuery } from './useApiQuery';

export function useWorkSession() {
  const {
    data: session,
    loading,
    error,
    reload,
  } = useApiQuery('/work-session', fetchWorkSession, {
    pollMs: 60_000,
  });
  const [extending, setExtending] = useState(false);

  const extend = useCallback(
    async (kind: 'automatic' | 'manual', endsAt?: string) => {
      if (!session) throw new Error('근무 세션을 불러오는 중입니다.');
      setExtending(true);
      try {
        const updated = await extendWorkSession({
          kind,
          expectedEndsAt: session.ends_at,
          endsAt,
        });
        reload();
        return updated;
      } finally {
        setExtending(false);
      }
    },
    [session, reload],
  );

  return {
    session,
    loading,
    error,
    extending,
    reload,
    extend,
  };
}

export type { WorkSession };
