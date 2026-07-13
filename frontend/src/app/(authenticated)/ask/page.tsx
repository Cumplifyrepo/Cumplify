'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shared';
import { AskPanel } from '@/components/ask';
import styles from './page.module.css';

/**
 * Full-page /ask route — §4: "full page at /ask".
 * Same AskPanel component, rendered full-height in the main column.
 */
export default function AskPage() {
  const t = useTranslations('ask');

  return (
    <>
      <PageHeader title={t('title')} />
      <div className={styles.container}>
        <AskPanel />
      </div>
    </>
  );
}
