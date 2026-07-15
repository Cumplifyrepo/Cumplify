'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SecondaryButton, ErrorState } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import styles from './page.module.css';

// ─── GraphQL ─────────────────────────────────────────────────────────────────

const GET_DOCUMENT_VERSION_DIFF = `query GetDocumentVersionDiff($v1: ID!, $v2: ID!) {
  getDocumentVersionDiff(v1: $v1, v2: $v2) { additions deletions content }
}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DiffResult {
  additions: number;
  deletions: number;
  content: string;
}

interface SectionDiff {
  added: string[];
  removed: string[];
  kindChange?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DiffViewProps {
  v1: string;
  v2: string;
  onBack: () => void;
}

export function DiffView({ v1, v2, onBack }: DiffViewProps) {
  const t = useTranslations('qms.docViewer');
  const { query } = useGraphQL();

  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [parsedContent, setParsedContent] = useState<Record<string, SectionDiff> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await query<{ getDocumentVersionDiff: DiffResult | null }>(
        GET_DOCUMENT_VERSION_DIFF, { v1, v2 }
      );
      if (!data.getDocumentVersionDiff) {
        setError('unavailable');
      } else {
        setDiff(data.getDocumentVersionDiff);
        try {
          const parsed = JSON.parse(data.getDocumentVersionDiff.content) as Record<string, SectionDiff>;
          setParsedContent(parsed);
        } catch {
          setParsedContent(null);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('CONTENT_UNAVAILABLE')) setError('unavailable');
      else setError('load');
    } finally { setLoading(false); }
  }, [v1, v2, query]);

  useEffect(() => { fetchDiff(); }, [fetchDiff]);

  if (loading) return <p className={styles.loading}>{t('diffTitle')}</p>;
  if (error === 'load') return <ErrorState onRetry={fetchDiff} />;

  return (
    <div className={styles.diffView} data-testid="diff-view">
      <div className={styles.viewerHeader}>
        <SecondaryButton onClick={onBack} data-testid="diff-back">{t('back')}</SecondaryButton>
        <h2 className={styles.viewerTitle}>{t('diffTitle')}</h2>
      </div>

      {error === 'unavailable' && (
        <div className={styles.errorPanel} data-testid="diff-unavailable">
          <p className={styles.errorMsg}>{t('diffUnavailable')}</p>
        </div>
      )}

      {diff && (
        <>
          <div className={styles.diffSummary} data-testid="diff-summary">
            <span className={styles.diffAdditions}>+{diff.additions} {t('additions')}</span>
            <span className={styles.diffDeletions}>-{diff.deletions} {t('deletions')}</span>
          </div>

          {parsedContent && Object.keys(parsedContent).length > 0 && (
            <div className={styles.diffContent}>
              {Object.entries(parsedContent).map(([key, sectionDiff]) => (
                <div key={key} className={styles.diffSection} data-testid={`diff-section-${key}`}>
                  <div className={styles.diffSectionHeader}>
                    <span className={styles.sectionKey}>{key}</span>
                    {sectionDiff.kindChange && (
                      <span className={styles.kindChangeLabel}>{t('kindChange')}: {sectionDiff.kindChange}</span>
                    )}
                  </div>
                  {sectionDiff.removed.map((line, i) => (
                    <div key={`r-${i}`} className={styles.diffRemoved}>{line}</div>
                  ))}
                  {sectionDiff.added.map((line, i) => (
                    <div key={`a-${i}`} className={styles.diffAdded}>{line}</div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {parsedContent && Object.keys(parsedContent).length === 0 && (
            <div className={styles.emptyMsg}>
              <p>{t('noVersions')}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
