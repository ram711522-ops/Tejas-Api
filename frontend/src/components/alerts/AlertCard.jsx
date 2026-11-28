import { formatRelativeTime, formatTimestamp } from '../../utils/date';
import { StatusIndicator } from '../data-display/StatusIndicator';
import styles from './AlertCard.module.css';

const SEVERITY_TONE = {
  high: 'high',
  medium: 'warning',
  low: 'neutral',
};

const STATUS_TONE = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
};

const SEVERITY_BORDER = {
  high: styles.severityHigh,
  medium: styles.severityMedium,
  low: styles.severityLow,
};

export function AlertCard({ alert }) {
  const severity = String(alert.severity || 'medium').toLowerCase();
  const status = String(alert.status || 'open').toLowerCase();

  return (
    <article className={`${styles.card} ${SEVERITY_BORDER[severity] || ''}`}>
      <div className={styles.topRow}>
        <div className={styles.badges}>
          <StatusIndicator
            tone={SEVERITY_TONE[severity] || 'warning'}
            label={severity.toUpperCase()}
          />
          <code className={`mono ${styles.plantCode}`}>{alert.plant_id}</code>
        </div>
        <StatusIndicator tone={STATUS_TONE[status] || 'neutral'} label={status} />
      </div>

      <p className={styles.message}>{alert.message}</p>

      <div className={styles.bottomRow}>
        <span className="tabular-nums">
          Pred {Number(alert.predicted_power_kw).toFixed(0)} kW vs Actual{' '}
          {Number(alert.actual_power_kw).toFixed(0)} kW
          {alert.deviation_percent !== null && alert.deviation_percent !== undefined
            ? ` (${Number(alert.deviation_percent).toFixed(1)}% dev)`
            : ''}
        </span>
        <span title={formatTimestamp(alert.triggered_at)}>
          {formatRelativeTime(alert.triggered_at)}
        </span>
      </div>
    </article>
  );
}
