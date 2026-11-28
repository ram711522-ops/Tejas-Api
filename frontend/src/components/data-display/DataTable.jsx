import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '../feedback/EmptyState';
import { LoadingState } from '../feedback/LoadingState';
import styles from './DataTable.module.css';

export function DataTable({
  columns,
  rows = [],
  rowKey = (row) => row.id,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  pagination,
}) {
  if (loading) {
    return <LoadingState variant="skeleton" rows={5} />;
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={`surface-card ${styles.wrapper}`}>
      <div className={styles.scrollArea}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.align === 'right' ? styles.alignRight : ''}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowKey(row, rowIndex)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${col.align === 'right' ? styles.alignRight : ''} ${
                      col.mono ? 'mono' : col.numeric ? 'tabular-nums' : ''
                    }`}
                  >
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <div className={styles.pagination}>
          <span className="tabular-nums">
            Showing {pagination.skip + 1}–{pagination.skip + rows.length}
          </span>
          <div className={styles.pageButtons}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={pagination.skip === 0}
              onClick={pagination.onPrev}
            >
              <ChevronLeft size={14} />
              Prev
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!pagination.hasMore}
              onClick={pagination.onNext}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
