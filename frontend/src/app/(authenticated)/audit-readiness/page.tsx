'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /audit-readiness — Stage 1/2 Readiness Checklist (P3 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function AuditReadinessPage() {
  const t = useTranslations('auditReadinessPage');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
