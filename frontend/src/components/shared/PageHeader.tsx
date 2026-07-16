'use client';

import { type ReactNode } from 'react';
import styles from './PageHeader.module.css';

/**
 * PageHeader — view-designs.md §1 Main area.
 * Page title (pageTitle size) + optional actions slot (top-right).
 */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
