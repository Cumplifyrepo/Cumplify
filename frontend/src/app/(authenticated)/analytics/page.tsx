'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /analytics — Analytics & KPIs (P4 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function AnalyticsPage() {
  const t = useTranslations('analytics');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
