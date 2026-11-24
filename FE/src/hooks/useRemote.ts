import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { errorMessage } from '../api/business';

export default function useRemote<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    load()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(errorMessage(reason));
        if (reason instanceof ApiError && reason.status === 401)
          window.dispatchEvent(new Event('imleader-session-expired'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, revision]);
  return { data, error, loading, reload };
}
