'use client';

import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import styles from './AppShell.module.css';

/**
 * App Shell — view-designs.md §1.
 * Grid: 260px sidebar | 1fr main; height 100vh.
 * All authenticated views render inside this component.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
