'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * PENDING FLIP: /m1 → /documents
 *
 * DO NOT ACTIVATE until the architect issues the design-gate PASS on §10.
 * To activate: copy this file to frontend/src/app/(authenticated)/m1/page.tsx
 * replacing the current working M1 page.
 *
 * Per migration law (architecture §11): the absorbing view (/documents) must
 * pass its design gate before the old route redirects. Until then, /m1 stays live.
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
