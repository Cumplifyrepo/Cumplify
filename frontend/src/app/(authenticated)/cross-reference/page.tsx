'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /cross-reference — Clause Cross-Reference Matrix (P2 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function CrossReferencePage() {
  const t = useTranslations('crossReference');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
