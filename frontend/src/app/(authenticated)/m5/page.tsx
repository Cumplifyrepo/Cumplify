'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Legacy /m5 route — client-redirect to /risk (§10 IA, §11 migration law).
 * The absorbing view at /risk passed its design gate — direction flips.
 * Static export compatible (no server redirects).
 */
export default function M5Redirect() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/risk');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
