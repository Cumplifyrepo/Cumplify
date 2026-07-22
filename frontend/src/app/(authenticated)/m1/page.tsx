'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Legacy /m1 route — client-redirect to /documents (§10 IA, §11 migration law).
 * The absorbing view at /documents passed its design gate 2026-07-22
 * (architect PASS, evidence: design-gate-p2-surfaces.md) — direction flips.
 * Static export compatible (no server redirects).
 */
export default function M1ToDocumentsFlip() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/documents');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
