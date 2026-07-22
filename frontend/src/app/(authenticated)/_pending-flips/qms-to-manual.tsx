'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * PENDING FLIP: /qms → /manual
 *
 * DO NOT ACTIVATE until the architect issues the design-gate PASS on §8.
 * To activate: copy this file to frontend/src/app/(authenticated)/qms/page.tsx
 * replacing the current working QMS page.
 *
 * Per migration law (architecture §11): the absorbing view (/manual) must pass
 * its design gate before the old route redirects. Until then, /qms stays live.
 */
export default function QmsToManualFlip() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/manual');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
