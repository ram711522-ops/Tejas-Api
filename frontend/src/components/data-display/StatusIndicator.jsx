import styles from './StatusIndicator.module.css';

export function StatusIndicator({ tone = 'neutral', label, showDot = true, title }) {
  return (
    <span className={`${styles.badge} ${styles[tone] || styles.neutral}`} title={title}>
      {showDot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span>{label}</span>
    </span>
  );
}
