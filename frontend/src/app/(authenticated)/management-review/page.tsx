'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /management-review — Management Review (P4 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function ManagementReviewPage() {
  const t = useTranslations('managementReview');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
