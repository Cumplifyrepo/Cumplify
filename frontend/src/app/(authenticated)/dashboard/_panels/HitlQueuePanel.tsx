'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, EmptyState, ErrorState, SecondaryButton } from '@/components/shared';
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
 *
 * HITL-REACH-1: load-more pagination — consumes nextToken via an explicit
 * "Load more" button until drained. Design choice: explicit load-more over
 * infinite scroll (user controls fetch cadence; no scroll-jank on large
 * queues; deterministic test surface).
 *
 * Poll/pagination contract (HR1-POLL-1/HR1-DUP-1): the 15s poll refreshes
 * the PAGE-1 WINDOW ONLY — it merges by hitlItemId (fresh page 1 first,
 * then every previously-loaded item not in it) and never clobbers a deeper
 * nextToken while pagination is open. Once the queue is drained
 * (nextToken null), the poll may re-adopt page-1's token so items that
 * slid past the loaded window become reachable again (re-walk is
 * dedup-safe). Removal of resolved items is owned by the subscription and
 * the card's own remove path; while paginated, the poll cannot distinguish
 * "resolved" from "pushed off page 1", so it deliberately keeps the tail.
 */

const PAGE_SIZE = 20;

/** `first` in order, then `rest` minus anything already in `first` — no dup ids. */
function mergeById(first: HitlItem[], rest: HitlItem[]): HitlItem[] {
  const firstIds = new Set(first.map((i) => i.hitlItemId));
  return [...first, ...rest.filter((i) => !firstIds.has(i.hitlItemId))];
}

export function HitlQueuePanel() {
  const t = useTranslations('commandCenter');
  const { query } = useGraphQL();
  const { user } = useAuth();
  const [items, setItems] = useState<HitlItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextToken, setNextTokenState] = useState<string | null>(null);
  // Refs mirror pagination state so fetchItems keeps stable deps (the 15s
  // interval must not reset on every page turn).
  const nextTokenRef = useRef<string | null>(null);
  const hasLoadedMoreRef = useRef(false);
  // R2: ids with an active approval banner — exempt from removal
  const approvedIdsRef = useRef<Set<string>>(new Set());

  const role = user?.role ?? 'employee';

  const setNextToken = useCallback((token: string | null) => {
    nextTokenRef.current = token;
    setNextTokenState(token);
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{
        listPendingHitlItems: { items: HitlItem[]; nextToken: string | null };
      }>(LIST_PENDING_HITL_QUERY, { pagination: { limit: PAGE_SIZE } });
      const fresh = data.listPendingHitlItems;
      // Token policy: adopt page-1's token unless pagination is open at a
      // deeper cursor (drained ⇒ re-adopt, so new overflow is reachable).
      if (!hasLoadedMoreRef.current || nextTokenRef.current === null) {
        setNextToken(fresh.nextToken);
      }
      setItems((prev) => {
        if (hasLoadedMoreRef.current) {
          // Paginated: refresh the page-1 window, keep the loaded tail
          // (includes R2 approved-banner items by construction).
          return mergeById(fresh.items, prev);
        }
        // Single-page mode (original R2 semantics): replace, keeping only
        // items with an active approval banner.
        const approvedIds = approvedIdsRef.current;
        const freshIds = new Set(fresh.items.map((i) => i.hitlItemId));
        const keptApproved = prev.filter(
          (i) => approvedIds.has(i.hitlItemId) && !freshIds.has(i.hitlItemId),
        );
        return [...fresh.items, ...keptApproved];
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query, setNextToken]);

  const fetchMore = useCallback(async () => {
    const token = nextTokenRef.current;
    if (!token || loadingMore) return;
    setLoadingMore(true);
    // Flag BEFORE the await so a concurrent poll tick cannot clobber the
    // deeper cursor mid-flight; restore on failure if this was page 1.
    const wasDeep = hasLoadedMoreRef.current;
    hasLoadedMoreRef.current = true;
    try {
      const data = await query<{
        listPendingHitlItems: { items: HitlItem[]; nextToken: string | null };
      }>(LIST_PENDING_HITL_QUERY, { pagination: { limit: PAGE_SIZE, nextToken: token } });
      setNextToken(data.listPendingHitlItems.nextToken);
      setItems((prev) => mergeById(prev, data.listPendingHitlItems.items));
    } catch {
      // Load-more failure is non-fatal — existing items stay visible
      hasLoadedMoreRef.current = wasDeep;
    } finally {
      setLoadingMore(false);
    }
  }, [query, loadingMore, setNextToken]);

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
        <>
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
          {nextToken && (
            <div className={styles.loadMore}>
              <SecondaryButton onClick={fetchMore} disabled={loadingMore}>
                {loadingMore ? t('loadingMore') : t('loadMore')}
              </SecondaryButton>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
