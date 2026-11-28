import styles from './PageHeader.module.css';

export function PageHeader({ title, subtitle, breadcrumb, actions }) {
  return (
    <div className={styles.header}>
      <div>
        {breadcrumb ? <div className={styles.meta}>{breadcrumb}</div> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
