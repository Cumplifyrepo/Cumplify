'use client';

import { useTranslations } from 'next-intl';
import styles from './ErrorState.module.css';

/**
 * ErrorState — view-designs.md §2.
 * Body text danger tint + retry button (common.retry).
 */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const t = useTranslations('common');

  return (
    <div className={styles.wrapper}>
      <p className={styles.message}>{t('error')}</p>
      {onRetry && (
        <button className={styles.retryBtn} onClick={onRetry} type="button">
          {t('retry')}
        </button>
      )}
    </div>
  );
}
