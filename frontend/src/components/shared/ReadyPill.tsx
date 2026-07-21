'use client';

import { useTranslations } from 'next-intl';
import styles from './ReadyPill.module.css';

/**
 * ReadyPill — honest-state readiness indicator with four states.
 * Per ims-experience/view-designs.md §3.3.
 * Styled exclusively from design-tokens.ts (CSS variables).
 */

export type ReadyState = 'ready' | 'partial' | 'not-ready' | 'unknown';

export interface ReadyPillProps {
  state: ReadyState;
  /** Optional override for the default label text */
  label?: string;
}

export function ReadyPill({ state, label }: ReadyPillProps) {
  const t = useTranslations('shared');

  const defaultLabels: Record<ReadyState, string> = {
    ready: t('readyReady'),
    partial: t('readyPartial'),
    'not-ready': t('readyNotReady'),
    unknown: t('readyUnknown'),
  };

  const displayLabel = label ?? defaultLabels[state];

  return (
    <span className={`${styles.pill} ${styles[state === 'not-ready' ? 'notReady' : state]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {displayLabel}
    </span>
  );
}
