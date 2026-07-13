'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { roleLabel } from '@/lib/role-matrix';
import { LocaleSwitcher } from './LocaleSwitcher';
import styles from './UserFooter.module.css';

/**
 * UserFooter — avatar initial, role label, locale switcher, sign-out.
 * Per view-designs.md §1.
 */
export function UserFooter() {
  const t = useTranslations('shell');
  const { user, signOut } = useAuth();

  const initial = user?.email?.charAt(0).toUpperCase() ?? '?';
  const role = user?.role ?? 'employee';

  return (
    <div className={styles.footer}>
      <div className={styles.userRow}>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <div className={styles.info}>
          <span className={styles.email}>{user?.email ?? ''}</span>
          <span className={styles.role}>{roleLabel(role)}</span>
        </div>
      </div>
      <LocaleSwitcher />
      <button className={styles.signOutBtn} onClick={signOut} type="button">
        {t('signOut')}
      </button>
    </div>
  );
}
