import { useEffect, useRef } from 'react';

export function usePolling(callback, intervalMs) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return undefined;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        savedCallback.current();
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);
}
