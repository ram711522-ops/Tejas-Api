import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounter = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback(
    ({ title, message, tone = 'info', durationMs = 4500 }) => {
      idCounter.current += 1;
      const id = `toast-${idCounter.current}`;
      setToasts((prev) => [...prev, { id, title, message, tone }]);
      if (durationMs > 0) {
        window.setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
      return id;
    },
    [dismissToast]
  );

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      dismissToast,
    }),
    [toasts, addToast, dismissToast]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}
