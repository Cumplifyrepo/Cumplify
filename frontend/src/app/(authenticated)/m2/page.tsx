'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Legacy /m2 route — client-redirect to /capa (§10 IA, §11 migration law).
 * CAPA Studio absorbed the M2 register in studio wave S1 (2026-07-22):
 * same register + detail, plus the agent front door (runNcIntake) and the
 * stage-aware analysis rail. Static export compatible (no server redirects).
 */
export default function M2Redirect() {
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    router.replace('/capa');
  }, [router]);

  return (
    <p style={{ color: 'var(--color-text-muted)', padding: 'var(--space-xl)' }}>
      {t('redirecting')}
    </p>
  );
}
