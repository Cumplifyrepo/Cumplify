'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, EmptyState } from '@/components/shared';

/**
 * /ai-review — AI Review Queue (P3 build).
 * Stub page per ims-experience/view-designs.md §5.
 */
export default function AiReviewPage() {
  const t = useTranslations('aiReview');
  return (
    <>
      <PageHeader title={t('title')} />
      <EmptyState message={t('comingSoon')} />
    </>
  );
}
