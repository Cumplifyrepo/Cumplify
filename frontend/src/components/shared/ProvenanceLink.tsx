'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import styles from './ProvenanceLink.module.css';

/**
 * ProvenanceLink — view-designs.md §2, MOD-9.
 * Any number/date/state with a sealed audit event renders with a subtle
 * chain-link icon suffix (accentMuted). Click → /m4?trail=<entityId>#<eventId>.
 * Tooltip: t('provenance.sealed').
 */
export function ProvenanceLink({
  entityId,
  auditEventId,
  children,
}: {
  entityId?: string;
  auditEventId?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('provenance');

  if (!entityId && !auditEventId) {
    return <>{children}</>;
  }

  const href = entityId
    ? `/m4?trail=${entityId}${auditEventId ? `#${auditEventId}` : ''}`
    : '#';

  return (
    <Link href={href} className={styles.link} title={t('sealed')}>
      {children}
      <svg
        className={styles.icon}
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 3L3 3C2.44772 3 2 3.44772 2 4L2 12C2 12.5523 2.44772 13 3 13L11 13C11.5523 13 12 12.5523 12 12L12 9M9 2L14 2L14 7M14 2L7 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
