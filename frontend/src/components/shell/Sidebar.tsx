'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { NavSection } from './NavSection';
import { NavItem } from './NavItem';
import { UserFooter } from './UserFooter';
import { useAuth } from '@/lib/auth-context';
import { canSeeAdmin } from '@/lib/role-matrix';
import styles from './Sidebar.module.css';

/**
 * Sidebar — view-designs.md §1.
 * Fixed left sidebar with section-labelled nav.
 * Role-gating is presentation-only (CON-6).
 * m6 fix: use next/link for logo, not raw <a>.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const { user } = useAuth();
  const role = user?.role ?? 'employee';

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoWrap}>
        <Link href="/dashboard" aria-label="Cumplify">
          <Image src="/brand/cumplify-logo.png" alt="Cumplify" width={120} height={43} priority />
        </Link>
      </div>

      <nav className={styles.nav} aria-label={t('mainNav')}>
        <NavSection label={t('operate')}>
          <NavItem href="/dashboard" label={t('commandCenter')} />
          <NavItem href="/ask" label={t('askCumplify')} />
        </NavSection>

        <NavSection label={t('modules')}>
          <NavItem href="/m1" label={t('documentStudio')} />
          <NavItem href="/m2" label={t('capa')} />
          <NavItem href="/m3" label={t('auditStudio')} />
          <NavItem href="/m4" label={t('records')} />
          <NavItem href="/m4/forms" label={t('forms')} />
          <NavItem href="/m5" label={t('risk')} />
          <NavItem href="/qms" label={t('qmsEngine')} />
        </NavSection>

        {canSeeAdmin(role) && (
          <NavSection label={t('admin')}>
            <NavItem href="/settings" label={t('settings')} />
          </NavSection>
        )}
      </nav>

      <UserFooter />
    </aside>
  );
}
