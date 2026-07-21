'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /setup — Setup Wizard (P1 stub, builds in P2+).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function SetupPage() {
  const t = useTranslations('setup');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
