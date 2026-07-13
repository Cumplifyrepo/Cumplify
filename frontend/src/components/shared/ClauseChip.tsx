'use client';

import styles from './ClauseChip.module.css';

/**
 * ClauseChip — view-designs.md §2.
 * Pill chip: "{standard} · {clauseRef}"; bg surfaceRaised, text textSecondary, labelSmall.
 */
export function ClauseChip({
  standard,
  clauseRef,
}: {
  standard?: string | null;
  clauseRef?: string | null;
}) {
  if (!standard && !clauseRef) return null;

  const label = [standard?.replace('ISO', 'ISO '), clauseRef]
    .filter(Boolean)
    .join(' \u00B7 ');

  return <span className={styles.chip}>{label}</span>;
}
