'use client';

import styles from './StatTile.module.css';

/**
 * StatTile — numeric-highlight card for KPIs / readiness scores / counts.
 * Per ims-experience/view-designs.md §3.1.
 * Styled exclusively from design-tokens.ts (CSS variables).
 */

export interface StatTileProps {
  /** i18n'd metric label */
  label: string;
  /** The big number (e.g. "42%", "12") */
  value: string | number;
  /** Optional trend indicator */
  trend?: { delta: string; label: string };
  /** Colors the value text */
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatTile({ label, value, trend, variant = 'default' }: StatTileProps) {
  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${styles[variant]}`}>{value}</span>
      {trend && (
        <span className={styles.trend}>
          <span className={trend.delta.startsWith('-') ? styles.trendNeg : styles.trendPos}>
            {trend.delta}
          </span>{' '}
          {trend.label}
        </span>
      )}
    </div>
  );
}
