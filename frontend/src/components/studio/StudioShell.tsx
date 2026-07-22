'use client';

import { type ReactNode } from 'react';
import styles from './StudioShell.module.css';

/**
 * StudioShell — the studio layout law (S0 chassis): workspace on the
 * left, agent rail on the right. Every studio surface (CAPA, Document,
 * Manual, Audit) mounts this so the agent is structurally beside the
 * work, never on a separate page. Rail collapses under the workspace on
 * narrow viewports.
 */

export interface StudioShellProps {
  children: ReactNode;
  /** Agent rail content: AgentRunButtons, inline HitlCards, run history. */
  rail: ReactNode;
  railLabel: string;
}

export function StudioShell({ children, rail, railLabel }: StudioShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.workspace}>{children}</div>
      <aside className={styles.rail} aria-label={railLabel}>
        {rail}
      </aside>
    </div>
  );
}
