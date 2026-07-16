'use client';

import { type ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import styles from './DataTable.module.css';

/**
 * DataTable — view-designs.md §2.
 * Header row surfaceRaised + labelSmall textMuted; rows border-bottom borderSubtle,
 * hover surfaceHover; body text textBody; empty state = EmptyState component (G8).
 */

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  /** Optional width hint (CSS value) */
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor */
  rowKey: (item: T) => string;
  /** Click handler for a row */
  onRowClick?: (item: T) => void;
  /** Empty state message (rendered when data is empty) */
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyMessage,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyMessage) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr className={styles.headerRow}>
          {columns.map((col) => (
            <th
              key={col.key}
              className={styles.headerCell}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr
            key={rowKey(item)}
            className={styles.row}
            onClick={() => onRowClick?.(item)}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onRowClick(item);
              }
            }}
          >
            {columns.map((col) => (
              <td key={col.key} className={styles.cell}>
                {col.render(item)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
