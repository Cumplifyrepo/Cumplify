'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * CAPA Studio lands in P4; the working M2 CAPA/NC register serves until absorption (architecture §11).
 * Interim redirect: the new IA route must always land on a WORKING surface —
 * redirect direction flips only when the absorbing view ships its design gate.
 */
export default function CapaInterimRedirect() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/m2');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
