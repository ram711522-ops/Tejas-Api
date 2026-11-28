import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncData(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const execute = useCallback(async (force = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher(controller.signal, { force });
      if (!controller.signal.aborted) {
        setData(result);
      }
      return result;
    } catch (err) {
      if (!controller.signal.aborted && !err?.isCanceled) {
        setError(err);
      }
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) {
      execute(false);
    }
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [execute, immediate]);

  const refetch = useCallback(() => execute(true), [execute]);

  return { data, loading, error, refetch, setData };
}
