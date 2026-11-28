import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape' && !loading) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel?.();
      }}
    >
      <div className={`surface-card ${styles.dialog} ${tone !== 'danger' ? styles.dialogPrimary : ''}`}>
        <div className={styles.header}>
          <div className={tone === 'danger' ? styles.iconDanger : styles.iconPrimary}>
            {tone === 'danger' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <h2 id="confirm-dialog-title" className={styles.title}>
              {title}
            </h2>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
