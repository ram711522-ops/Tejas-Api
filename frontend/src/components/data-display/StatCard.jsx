import styles from './StatCard.module.css';

const TONE_CLASSES = {
  accent: '',
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
};

const LINE_CLASSES = {
  accent: '',
  success: styles.lineSuccess,
  warning: styles.lineWarning,
  danger: styles.lineDanger,
  info: styles.lineInfo,
};

export function StatCard({
  label,
  value,
  unit,
  subtext,
  trend,
  icon: Icon,
  tone = 'accent',
  highlight = false,
  loading = false,
}) {
  return (
    <article className={`${styles.card} ${highlight ? styles.subtleGlow : ''}`}>
      <div className={`${styles.accentLine} ${LINE_CLASSES[tone] || ''}`} aria-hidden="true" />

      <div className={styles.topRow}>
        <span className={styles.label}>{label}</span>
        {Icon ? (
          <div className={`${styles.iconBox} ${TONE_CLASSES[tone] || ''}`}>
            <Icon size={16} />
          </div>
        ) : null}
      </div>

      {loading ? (
        <>
          <div className={`skeleton ${styles.skeletonValue}`} />
          <div className={`skeleton ${styles.skeletonSub}`} />
        </>
      ) : (
        <>
          <div className={styles.valueRow}>
            <div className={styles.valueMain}>
              <span className={`tabular-nums ${styles.value}`}>{value ?? '—'}</span>
              {unit ? <span className={styles.unit}>{unit}</span> : null}
            </div>
            {trend ? <span className={`mono ${styles.trend}`}>{trend}</span> : null}
          </div>
          {subtext ? <div className={styles.subtext}>{subtext}</div> : null}
        </>
      )}
    </article>
  );
}
