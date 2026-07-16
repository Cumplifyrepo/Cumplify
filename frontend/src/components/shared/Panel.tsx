'use client';

import { type ReactNode } from 'react';
import styles from './Panel.module.css';

/**
 * Panel — view-designs.md §2: Card 1 language.
 * bg surface, radius card, border 1px border, padding cardPad–panelPad.
 * Optional title (panelTitle) + subtitle (small, textMuted) + header-right slot.
 */
interface PanelProps {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

export function Panel({
  title,
  subtitle,
  headerRight,
  children,
  className,
  'aria-label': ariaLabel,
}: PanelProps) {
  return (
    <section className={`${styles.panel} ${className ?? ''}`} aria-label={ariaLabel ?? title}>
      {(title || headerRight) && (
        <div className={styles.header}>
          <div>
            {title && <h2 className={styles.title}>{title}</h2>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {headerRight && <div className={styles.headerRight}>{headerRight}</div>}
        </div>
      )}
      <div className={styles.content}>{children}</div>
    </section>
  );
}
