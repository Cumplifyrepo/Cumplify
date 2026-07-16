'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, ErrorState } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import styles from './ReadinessPanel.module.css';

/**
 * Readiness Score panel — CC-1, CC-6.
 * getAuditReadiness(standard) × 3 standards on mount (m6: Promise.all).
 * Big numeric (pageTitle size) + TrendIndicator per standard (M7).
 * CC-6: refetch on any onFindingRecorded/onCAPAStatusChanged event.
 * M7: delta computed client-side between consecutive fetches, attribution text
 * from the CC-6 event that triggered the refetch. positive=success, negative=danger.
 */

const STANDARDS = ['ISO9001', 'ISO14001', 'ISO45001'] as const;

interface ReadinessData {
  standard: string;
  score: number;
  delta: number | null;
  attribution: string | null;
}

const READINESS_QUERY = `query GetReadiness($standard: Standard!) {
  getAuditReadiness(standard: $standard) { score }
}`;

export function ReadinessPanel() {
  const t = useTranslations('commandCenter');
  const { query } = useGraphQL();
  const [scores, setScores] = useState<ReadinessData[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevScores = useRef<Map<string, number>>(new Map());
  const lastAttribution = useRef<string | null>(null);

  const fetchReadiness = useCallback(
    async (attribution?: string) => {
      try {
        setError(false);
        if (attribution) lastAttribution.current = attribution;

        // m6 fix: fetch all 3 standards in parallel with Promise.all
        const results = await Promise.all(
          STANDARDS.map(async (standard) => {
            const data = await query<{ getAuditReadiness: Array<{ score: number }> }>(
              READINESS_QUERY,
              { standard },
            );
            const avg =
              data.getAuditReadiness.length > 0
                ? data.getAuditReadiness.reduce((sum, r) => sum + r.score, 0) /
                  data.getAuditReadiness.length
                : 0;
            return { standard, score: Math.round(avg * 100) / 100 };
          }),
        );

        // M7: compute delta from previous fetch
        const withDelta: ReadinessData[] = results.map(({ standard, score }) => {
          const prev = prevScores.current.get(standard);
          const delta = prev != null ? Math.round((score - prev) * 100) / 100 : null;
          prevScores.current.set(standard, score);
          return {
            standard,
            score,
            delta,
            attribution: delta != null && delta !== 0 ? lastAttribution.current : null,
          };
        });

        setScores(withDelta);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  // CC-6: refetch on real-time events with attribution
  useTenantSubscription({
    query: `subscription OnFinding($tenantId: ID!) {
      onFindingRecorded(tenantId: $tenantId) { id }
    }`,
    onData: () => fetchReadiness(t('trendFinding')),
  });

  useTenantSubscription({
    query: `subscription OnCAPA($tenantId: ID!) {
      onCAPAStatusChanged(tenantId: $tenantId) { id }
    }`,
    onData: () => fetchReadiness(t('trendCapa')),
  });

  if (error)
    return (
      <Panel title={t('readinessScore')}>
        <ErrorState onRetry={() => fetchReadiness()} />
      </Panel>
    );

  return (
    <Panel title={t('readinessScore')} aria-label={t('readinessScore')}>
      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : (
        <div className={styles.scores}>
          {scores.map((s) => (
            <div key={s.standard} className={styles.scoreCard}>
              <span className={styles.scoreValue}>{s.score}</span>
              <span className={styles.standardLabel}>{s.standard.replace('ISO', 'ISO ')}</span>
              {/* M7: TrendIndicator */}
              {s.delta != null && s.delta !== 0 && (
                <span className={s.delta > 0 ? styles.trendPositive : styles.trendNegative}>
                  {s.delta > 0 ? '+' : ''}
                  {s.delta}
                  {s.attribution && (
                    <span className={styles.trendAttribution}>{s.attribution}</span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
