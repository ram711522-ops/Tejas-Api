import { Activity, AlertTriangle, CheckCircle2, Zap } from 'lucide-react';
import { formatRelativeTime, formatTimestamp } from '../../utils/date';
import styles from './ActivityFeed.module.css';

const EVENT_CONFIG = {
  alert: { icon: AlertTriangle, cls: styles.iconAlert },
  resolved: { icon: CheckCircle2, cls: styles.iconResolved },
  forecast: { icon: Zap, cls: styles.iconForecast },
  reading: { icon: Activity, cls: styles.iconReading },
};

export function ActivityFeed({ events = [] }) {
  return (
    <section className={`surface-card ${styles.panel}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Recent System Activity</h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          From forecast, reading &amp; alert timestamps
        </span>
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No recorded telemetry or alert events in the current dataset.
        </p>
      ) : (
        <div className={styles.list}>
          {events.map((event) => {
            const cfg = EVENT_CONFIG[event.type] || EVENT_CONFIG.reading;
            const Icon = cfg.icon;
            return (
              <div key={event.id} className={styles.item}>
                <div className={`${styles.iconWrap} ${cfg.cls}`}>
                  <Icon size={14} />
                </div>
                <div className={styles.content}>
                  <div className={styles.itemTitle}>{event.title}</div>
                  <div className={styles.itemDetail}>{event.detail}</div>
                </div>
                <span className={styles.time} title={formatTimestamp(event.timestamp)}>
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
