'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /guide — Clause Registry Guide (P2 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function GuidePage() {
  const t = useTranslations('guide');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
