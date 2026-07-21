'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Risk view migrates in P1-follow-on; the working M5 register serves until absorption (architecture §11).
 * Interim redirect: the new IA route must always land on a WORKING surface —
 * redirect direction flips only when the absorbing view ships its design gate.
 */
export default function RiskInterimRedirect() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/m5');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
