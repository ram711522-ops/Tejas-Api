import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'No data available',
  description,
  action,
}) {
  return (
    <div className={`surface-card ${styles.empty}`}>
      <div className={styles.iconWrap}>
        <Icon size={22} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
