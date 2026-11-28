import styles from './LoadingState.module.css';

export function LoadingState({
  message = 'Acquiring telemetry...',
  variant = 'spinner',
  rows = 4,
  cards = 4,
}) {
  if (variant === 'cards') {
    return (
      <div className={styles.skeletonCardGrid} aria-busy="true" aria-label={message}>
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className={styles.skeletonCard}>
            <div className={`skeleton ${styles.skeletonKpiTitle}`} />
            <div className={`skeleton ${styles.skeletonKpiValue}`} />
            <div className={`skeleton ${styles.skeletonKpiSub}`} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={`surface-card ${styles.skeletonChart}`} aria-busy="true" aria-label={message}>
        <div className={`skeleton ${styles.skeletonChartHeader}`} />
        <div className={`skeleton ${styles.skeletonChartBody}`} />
      </div>
    );
  }

  if (variant === 'skeleton') {
    return (
      <div className={`surface-card ${styles.skeletonList}`} aria-busy="true" aria-label={message}>
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={`skeleton ${index % 2 === 1 ? styles.skeletonRowShort : styles.skeletonRow}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <svg className={styles.orbitSvg} viewBox="0 0 64 64" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="rgba(245, 158, 11, 0.25)"
          strokeWidth="1.5"
          strokeDasharray="10 8"
          className={styles.ringOuter}
        />
        <circle
          cx="32"
          cy="32"
          r="17"
          fill="none"
          stroke="rgba(56, 189, 248, 0.35)"
          strokeWidth="1.25"
          strokeDasharray="6 6"
          className={styles.ringInner}
        />
        <circle cx="32" cy="32" r="7" fill="var(--color-accent)" className={styles.sunCore} />
      </svg>
      <span className={styles.label}>{message}</span>
    </div>
  );
}
