'use client';

import { type ReactNode } from 'react';
import styles from './NavSection.module.css';

/**
 * Nav section with a labelSmall heading (OPERATE / MODULES / ADMIN).
 */
export function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <span className={styles.label}>{label}</span>
      <ul className={styles.list}>{children}</ul>
    </div>
  );
}
