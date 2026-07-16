'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, ClauseChip, EmptyState } from '@/components/shared';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import styles from './AgentsFeedPanel.module.css';

/**
 * Agents Working Now — CC-3.
 * useTenantSubscription on onDocumentStatusChanged, onCAPAStatusChanged,
 * onFindingRecorded, onRiskEscalated; append-only feed (max 50, newest first).
 * Row: dot (accent, pulse while <60s old), event label, ClauseChip, relative time.
 *
 * m2 fix: event labels via t() keys (not hardcoded English) + 30s tick.
 */

interface FeedEvent {
  id: string;
  typeKey: string;
  clauseRef?: string;
  standard?: string;
  timestamp: number;
}

const MAX_EVENTS = 50;

export function AgentsFeedPanel() {
  const t = useTranslations('commandCenter');
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [, setTick] = useState(0);
  const counter = useRef(0);

  // m2 fix: 30s tick to update relative times and pulse state
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  function addEvent(typeKey: string, data: Record<string, unknown>) {
    counter.current += 1;
    const event: FeedEvent = {
      id: `evt-${counter.current}`,
      typeKey,
      clauseRef: (data.clauseRef as string) ?? undefined,
      standard: (data.standard as string) ?? undefined,
      timestamp: Date.now(),
    };
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
  }

  useTenantSubscription<{ onDocumentStatusChanged: Record<string, unknown> }>({
    query: `subscription OnDoc($tenantId: ID!) {
      onDocumentStatusChanged(tenantId: $tenantId) { id status standard }
    }`,
    onData: (data) => addEvent('eventDocument', data.onDocumentStatusChanged ?? {}),
  });

  useTenantSubscription<{ onCAPAStatusChanged: Record<string, unknown> }>({
    query: `subscription OnCAPA($tenantId: ID!) {
      onCAPAStatusChanged(tenantId: $tenantId) { id status }
    }`,
    onData: (data) => addEvent('eventCapa', data.onCAPAStatusChanged ?? {}),
  });

  useTenantSubscription<{ onFindingRecorded: Record<string, unknown> }>({
    query: `subscription OnFinding($tenantId: ID!) {
      onFindingRecorded(tenantId: $tenantId) { id clauseRef }
    }`,
    onData: (data) => addEvent('eventFinding', data.onFindingRecorded ?? {}),
  });

  useTenantSubscription<{ onRiskEscalated: Record<string, unknown> }>({
    query: `subscription OnRisk($tenantId: ID!) {
      onRiskEscalated(tenantId: $tenantId) { id standard category riskRating }
    }`,
    onData: (data) => addEvent('eventRisk', data.onRiskEscalated ?? {}),
  });

  return (
    <Panel title={t('agentsFeed')} aria-label={t('agentsFeed')}>
      {events.length === 0 ? (
        <EmptyState message={t('noAgentActivity')} />
      ) : (
        <ul className={styles.list}>
          {events.map((evt) => {
            const isRecent = Date.now() - evt.timestamp < 60_000;
            return (
              <li key={evt.id} className={styles.row}>
                <span className={`${styles.dot} ${isRecent ? styles.pulse : ''}`} />
                <span className={styles.label}>{t(evt.typeKey)}</span>
                {evt.clauseRef && <ClauseChip standard={evt.standard} clauseRef={evt.clauseRef} />}
                <span className={styles.time}>{formatRelative(evt.timestamp)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function formatRelative(ts: number): string {
  const diff = Math.round((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  return `${Math.round(diff / 3600)}h`;
}
