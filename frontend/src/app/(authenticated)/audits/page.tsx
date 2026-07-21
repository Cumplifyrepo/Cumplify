'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /audits — Audit Studio (P3 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function AuditsPage() {
  const t = useTranslations('audits');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
