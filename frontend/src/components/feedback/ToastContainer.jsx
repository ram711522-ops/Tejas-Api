import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import styles from './ToastContainer.module.css';

const TONE_ICONS = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: XCircle,
  info: Info,
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack} aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = TONE_ICONS[toast.tone] || Info;
        return (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.tone] || styles.info}`}>
            <Icon size={18} />
            <div className={styles.content}>
              {toast.title ? <div className={styles.title}>{toast.title}</div> : null}
              {toast.message ? <div className={styles.message}>{toast.message}</div> : null}
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
