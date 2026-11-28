import { LoadingState } from '../feedback/LoadingState';
import { EmptyState } from '../feedback/EmptyState';
import { ErrorState } from '../feedback/ErrorState';
import styles from './ChartCard.module.css';

export function ChartCard({
  title,
  subtitle,
  actions,
  loading = false,
  error = null,
  isEmpty = false,
  emptyTitle = 'No chart data in range',
  emptyDescription,
  onRetry,
  height = 280,
  children,
}) {
  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div
        className={styles.body}
        style={loading || (!error && !isEmpty) ? { minHeight: `${height}px` } : undefined}
      >
        {loading ? (
          <LoadingState message="Preparing chart series..." />
        ) : error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : (
          children
        )}
      </div>
    </section>
  );
}
