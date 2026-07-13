'use client';

import { type ReactNode } from 'react';
import styles from './EmptyState.module.css';

/**
 * EmptyState — view-designs.md §2.
 * Centered, textMuted body + optional action button.
 */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.wrapper}>
      <p className={styles.message}>{message}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
