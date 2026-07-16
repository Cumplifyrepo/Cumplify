'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Panel,
  StatusBadge,
  ClauseChip,
  EmptyState,
  ErrorState,
  ProvenanceLink,
} from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import Link from 'next/link';
import styles from './TopRisksPanel.module.css';

/**
 * Top Risks panel — CC-5.
 * getCrossRegisterRiskView() top 5 by riskRating.
 * Row: title, StatusBadge(severity: ≥15 danger, ≥8 warning, else success),
 * rating number w/ ProvenanceLink (M2: entityId = risk.id), standard chip.
 * "View all →" → /m5.
 */

interface Risk {
  id: string;
  description: string;
  riskRating: number;
  standard: string;
  category: string;
  status: string;
}

const RISK_QUERY = `query TopRisks {
  getCrossRegisterRiskView { id description riskRating standard category status }
}`;

function ratingToStatus(rating: number): string {
  if (rating >= 15) return 'CRITICAL';
  if (rating >= 8) return 'MEDIUM';
  return 'LOW';
}

export function TopRisksPanel() {
  const t = useTranslations('commandCenter');
  const { query } = useGraphQL();
  const [risks, setRisks] = useState<Risk[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRisks = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{ getCrossRegisterRiskView: Risk[] }>(RISK_QUERY);
      const sorted = (data.getCrossRegisterRiskView ?? [])
        .sort((a, b) => b.riskRating - a.riskRating)
        .slice(0, 5);
      setRisks(sorted);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  if (error)
    return (
      <Panel title={t('topRisks')}>
        <ErrorState onRetry={fetchRisks} />
      </Panel>
    );

  return (
    <Panel
      title={t('topRisks')}
      aria-label={t('topRisks')}
      headerRight={
        <Link href="/m5" className={styles.viewAll}>
          {t('viewAll')} →
        </Link>
      }
    >
      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : risks.length === 0 ? (
        <EmptyState message={t('noRisks')} />
      ) : (
        <ul className={styles.list}>
          {risks.map((risk) => (
            <li key={risk.id} className={styles.row}>
              <span className={styles.title}>{risk.description}</span>
              <StatusBadge status={ratingToStatus(risk.riskRating)} />
              <ProvenanceLink entityId={risk.id}>
                <span className={styles.rating}>{risk.riskRating}</span>
              </ProvenanceLink>
              <ClauseChip standard={risk.standard} clauseRef={null} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
