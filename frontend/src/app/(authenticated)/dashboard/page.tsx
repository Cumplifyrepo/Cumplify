'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shared';
import { ReadinessPanel } from './_panels/ReadinessPanel';
import { HitlQueuePanel } from './_panels/HitlQueuePanel';
import { AgentsFeedPanel } from './_panels/AgentsFeedPanel';
import { TopRisksPanel } from './_panels/TopRisksPanel';
import styles from './page.module.css';

/**
 * Command Center — view-designs.md §3.
 * Four panels: Readiness Score, HITL Approval Queue, Agents Working Now, Top Risks.
 * Task 11 completion: all panels bound to live GraphQL data.
 */
export default function DashboardPage() {
  const t = useTranslations('commandCenter');

  return (
    <>
      <PageHeader title={t('title')} />
      <div className={styles.grid}>
        <ReadinessPanel />
        <HitlQueuePanel />
        <AgentsFeedPanel />
        <TopRisksPanel />
      </div>
    </>
  );
}
