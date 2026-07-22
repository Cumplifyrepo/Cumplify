'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, EmptyState, ErrorState } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import { HitlCard, type HitlItem, LIST_PENDING_HITL_QUERY } from '@/components/studio';
import styles from './HitlQueuePanel.module.css';

/**
 * HITL Approval Queue — view-designs.md §3 Part 3.1.
 * S0 chassis refactor: card anatomy + actions (CARD-1..7) now live in the
 * shared studio HitlCard so every studio renders the SAME approval card;
 * this panel keeps ONLY the cross-studio inbox concerns — fetch, 15s
 * polling fallback, onHitlItemResolved subscription, and the R2 merge
 * that keeps approved items mounted while their ProvenanceLink banner
 * shows.
 */

export function HitlQueuePanel() {
  const t = useTranslations('commandCenter');
  const { query } = useGraphQL();
  const { user } = useAuth();
  const [items, setItems] = useState<HitlItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  // R2: ids with an active approval banner — exempt from removal
  const approvedIdsRef = useRef<Set<string>>(new Set());

  const role = user?.role ?? 'employee';

  const fetchItems = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{
        listPendingHitlItems: { items: HitlItem[]; nextToken: string | null };
      }>(LIST_PENDING_HITL_QUERY, { pagination: { limit: 20 } });
      // R2: keep items that have an active approval banner
      setItems((prev) => {
        const approvedIds = approvedIdsRef.current;
        const freshIds = new Set(data.listPendingHitlItems.items.map((i) => i.hitlItemId));
        const keptApproved = prev.filter(
          (i) => approvedIds.has(i.hitlItemId) && !freshIds.has(i.hitlItemId),
        );
        return [...data.listPendingHitlItems.items, ...keptApproved];
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 15s polling fallback (CON-10: kept until architect verifies live WSS)
  useEffect(() => {
    const interval = setInterval(fetchItems, 15_000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  // Subscription: remove resolved items — R2: exempt items with active approval banner
  useTenantSubscription<{ onHitlItemResolved: { hitlItemId: string } }>({
    query: `subscription OnHitlResolved($tenantId: ID!) {
      onHitlItemResolved(tenantId: $tenantId) { hitlItemId decision }
    }`,
    onData: (data) => {
      const resolvedId = data.onHitlItemResolved?.hitlItemId;
      if (resolvedId && !approvedIdsRef.current.has(resolvedId)) {
        setItems((prev) => prev.filter((i) => i.hitlItemId !== resolvedId));
      }
    },
  });

  function handleApproved(hitlItemId: string) {
    approvedIdsRef.current.add(hitlItemId);
  }

  function handleRemove(hitlItemId: string) {
    approvedIdsRef.current.delete(hitlItemId);
    setItems((prev) => prev.filter((i) => i.hitlItemId !== hitlItemId));
  }

  if (error)
    return (
      <Panel title={t('hitlQueue')}>
        <ErrorState onRetry={fetchItems} />
      </Panel>
    );

  return (
    <Panel title={t('hitlQueue')} aria-label={t('hitlQueue')}>
      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState message={t('noItems')} />
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.hitlItemId} className={styles.listItem}>
              <HitlCard
                item={item}
                role={role}
                onApproved={handleApproved}
                onRemove={handleRemove}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
