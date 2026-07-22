'use client';

import { useTranslations } from 'next-intl';
import { PageHeader, Panel } from '@/components/shared';
import { useAuth } from '@/lib/auth-context';
import { canSeeAdmin, normalizeRole } from '@/lib/role-matrix';
import btnStyles from '@/components/shared/Buttons.module.css';
import styles from './page.module.css';

/**
 * /billing — subscription & payments (owner directive 2026-07-22).
 * Route-guarded: canSeeAdmin(role) (CON-6, presentation-only; server enforces).
 *
 * Subscription management lives in Stripe's hosted billing portal — this
 * page links out rather than reimplementing invoices/payment methods.
 * NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL carries the portal link (build-time
 * inlined); until a per-customer portal-session mutation exists, this is
 * the shared no-code portal login URL from the Stripe dashboard.
 * AI credit overage is served and billed, never hard-blocked (owner ruling
 * 2026-07-08) — the usage note reflects that.
 */

const PORTAL_URL = process.env.NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL;

export default function BillingPage() {
  const t = useTranslations('billing');
  const { user } = useAuth();

  const role = user?.role ?? 'employee';
  if (!canSeeAdmin(normalizeRole(role))) {
    return null;
  }

  return (
    <>
      <PageHeader title={t('title')} />

      <div className={styles.panels}>
        <Panel title={t('subscriptionTitle')}>
          <p className={styles.description}>{t('subscriptionDescription')}</p>
          {PORTAL_URL ? (
            <a
              className={`${btnStyles.primary} ${styles.portalLink}`}
              href={PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('openPortal')}
            </a>
          ) : (
            <p className={styles.notConfigured}>{t('portalNotConfigured')}</p>
          )}
        </Panel>

        <Panel title={t('usageTitle')}>
          <p className={styles.description}>{t('usageDescription')}</p>
        </Panel>
      </div>
    </>
  );
}
