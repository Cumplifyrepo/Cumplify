'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useGraphQL } from '@/lib/api';
import styles from './LocaleSwitcher.module.css';

const LOCALES = ['en', 'es', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

/**
 * Per-user locale select → calls updateProfile(locale).
 * Locale change re-renders via next-intl immediately (ACC-5).
 * Mounted in UserFooter AND /settings (one component, two mounts — §10).
 * Trivial fix: mutate wrapped in try/catch (unhandled rejection prevention).
 */
export function LocaleSwitcher() {
  const t = useTranslations('profile');
  const { user, refreshLocale } = useAuth();
  const { mutate } = useGraphQL();

  const currentLocale = user?.locale ?? 'en';

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value as Locale;
    if (locale === currentLocale) return;

    // Optimistic: update UI immediately
    refreshLocale(locale);

    try {
      await mutate(
        `mutation UpdateProfile($input: UpdateProfileInput!) {
          updateProfile(input: $input) { userId locale updatedAt }
        }`,
        { input: { locale } },
      );
    } catch {
      // Revert on failure
      refreshLocale(currentLocale);
    }
  }

  return (
    <div className={styles.wrapper}>
      <label htmlFor="locale-select" className={styles.label}>
        {t('locale')}
      </label>
      <select
        id="locale-select"
        value={currentLocale}
        onChange={handleChange}
        className={styles.select}
        aria-label={t('locale')}
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {loc.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
