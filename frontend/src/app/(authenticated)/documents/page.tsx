'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Documents browser lands in P2; the working M1 register serves until absorption (architecture §11).
 * Interim redirect: the new IA route must always land on a WORKING surface —
 * redirect direction flips only when the absorbing view ships its design gate.
 */
export default function DocumentsInterimRedirect() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/m1');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
