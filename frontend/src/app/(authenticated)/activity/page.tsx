'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /activity — Activity Log (P3 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function ActivityPage() {
  const t = useTranslations('activity');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
