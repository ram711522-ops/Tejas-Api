import { AlertTriangle, RefreshCw } from 'lucide-react';
import styles from './ErrorState.module.css';

export function ErrorState({
  title = 'Failed to load data',
  error,
  message,
  onRetry,
  retryLabel = 'Retry',
}) {
  const displayMessage = error?.isAuthError
    ? `${message || error?.message || 'Unauthorized request.'} Verify HTTP Basic credentials in Settings → Profile & Access.`
    : message || error?.message || 'An unexpected error occurred while contacting the backend.';
  const statusTag = error?.status ? ` (HTTP ${error.status})` : '';

  return (
    <div className={styles.card} role="alert">
      <div className={styles.body}>
        <AlertTriangle size={20} className={styles.icon} />
        <div>
          <div className={styles.title}>
            {title}
            {statusTag}
          </div>
          <p className={styles.message}>{displayMessage}</p>
        </div>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw size={14} />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
