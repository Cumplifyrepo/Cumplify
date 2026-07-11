'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';

export default function DashboardPage() {
  const t = useTranslations('commandCenter');

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <Image src="/brand/cumplify-logo.png" alt="Cumplify" width={120} height={43} priority />
        <h1>{t('title')}</h1>
      </header>

      <main className="dashboard-grid">
        {/* Panel 1: Readiness Score */}
        <section className="panel readiness-panel" aria-label={t('readinessScore')}>
          <h2>{t('readinessScore')}</h2>
          <div className="score-placeholder">
            {/* TODO: fetch getAuditReadiness(standard) per standard */}
            <p>{t('loading')}</p>
          </div>
        </section>

        {/* Panel 2: HITL Approval Queue */}
        <section className="panel hitl-panel" aria-label={t('hitlQueue')}>
          <h2>{t('hitlQueue')}</h2>
          <div className="queue-placeholder">
            {/* TODO: fetch listPendingHitlItems, render Part 3.2 card anatomy */}
            <p>{t('noItems')}</p>
          </div>
        </section>

        {/* Panel 3: Agents Working Now (live feed) */}
        <section className="panel agents-panel" aria-label={t('agentsFeed')}>
          <h2>{t('agentsFeed')}</h2>
          <div className="feed-placeholder">
            {/* TODO: subscribe to onDocumentStatusChanged, onCAPAStatusChanged, etc. */}
            <p>{t('loading')}</p>
          </div>
        </section>

        {/* Panel 4: Top Risks */}
        <section className="panel risks-panel" aria-label={t('topRisks')}>
          <h2>{t('topRisks')}</h2>
          <div className="risks-placeholder">
            {/* TODO: fetch getCrossRegisterRiskView */}
            <p>{t('loading')}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
