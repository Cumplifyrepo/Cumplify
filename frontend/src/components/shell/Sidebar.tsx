'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { NavSection } from './NavSection';
import { NavItem } from './NavItem';
import { StandardSwitch } from './StandardSwitch';
import { UserFooter } from './UserFooter';
import { useAuth } from '@/lib/auth-context';
import { topItem, navSections } from './nav-config';
import styles from './Sidebar.module.css';

/**
 * Sidebar — view-designs.md §1 + ims-experience/view-designs.md §1.
 * Fixed left sidebar with section-labelled nav.
 * §10 IA: Command Center (top) / DOCUMENTS / AUDIT & READINESS / OPERATIONS / ADMIN.
 * Role-gating is presentation-only (CON-6).
 * Ask Cumplify removed from nav — accessible via overlay only (ASK-1).
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

      <StandardSwitch />

      <nav className={styles.nav} aria-label={t('mainNav')}>
        {/* Top item — Command Center, no section header */}
        <ul className={styles.topList}>
          <NavItem href={topItem.href} label={t(topItem.labelKey)} />
        </ul>

        {/* §10 IA sections */}
        {navSections.map((section) => {
          if (section.roleGate && !section.roleGate(role)) return null;
          return (
            <NavSection key={section.labelKey} label={t(section.labelKey)}>
              {section.items.map((item) => (
                <NavItem key={item.href} href={item.href} label={t(item.labelKey)} />
              ))}
            </NavSection>
          );
        })}
      </nav>

      <UserFooter />
    </aside>
  );
}
