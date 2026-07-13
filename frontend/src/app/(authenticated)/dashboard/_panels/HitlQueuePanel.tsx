'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Panel, StatusBadge, ClauseChip, EmptyState, ErrorState, PrimaryButton, SecondaryButton, ProvenanceLink } from '@/components/shared';
import { useGraphQL } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTenantSubscription } from '@/lib/use-tenant-subscription';
import { canApprove } from '@/lib/role-matrix';
import styles from './HitlQueuePanel.module.css';

/**
 * HITL Approval Queue — view-designs.md §3 Part 3.1.
 * listPendingHitlItems + onHitlItemResolved subscription.
 * CARD-1..7 anatomy.
 * R1/CARD-3: three actions — Approve, Edit & approve (inline args editor), Send back.
 * R2/CARD-5: ProvenanceLink banner (10s, user-dismissible), items exempt from removal.
 * CARD-6: full guardrailEvidence slots.
 * M4: per-module role gating + error handling.
 * CARD-7 (CON-8): flagged items require justification before approve mutation.
 * 15s polling fallback alongside subscription.
 */

interface Citation {
  clauseRef: string;
  sourceChunk: string | null;
  score: number | null;
}

interface GuardrailEvidence {
  groundingScore: number | null;
  arVerdict: string | null;
  arDetails: string | null;
  citations: Citation[] | null;
}

interface HitlItem {
  hitlItemId: string;
  agentName: string;
  clauseRef: string | null;
  standard: string | null;
  module: string;
  draftBody: string;
  status: string;
  createdAt: string;
  guardrailEvidence: GuardrailEvidence | null;
}

interface ApprovalResult {
  hitlItemId: string;
  auditEventId: string;
  auditEventTimestamp: string;
}

const LIST_QUERY = `query ListPending($pagination: PaginationInput) {
  listPendingHitlItems(pagination: $pagination) {
    items {
      hitlItemId agentName clauseRef standard module draftBody status createdAt
      guardrailEvidence { groundingScore arVerdict arDetails citations { clauseRef sourceChunk score } }
    }
    nextToken
  }
}`;

const APPROVE_MUTATION = `mutation Approve($input: ApproveHitlItemInput!) {
  approveHitlItem(input: $input) { hitlItemId tenantId decision auditEventId auditEventTimestamp resolvedBy resolvedAt }
}`;

/** Try to parse draftBody as JSON and extract .args. Returns null if unparseable. */
function tryParseArgs(draftBody: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(draftBody);
    if (parsed && typeof parsed === 'object' && 'args' in parsed) {
      return parsed.args as Record<string, unknown>;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function HitlQueuePanel() {
  const t = useTranslations('commandCenter');
  const tCard = useTranslations('hitlCard');
  const { query, mutate } = useGraphQL();
  const { user } = useAuth();
  const [items, setItems] = useState<HitlItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});
  const [approvedLinks, setApprovedLinks] = useState<Record<string, ApprovalResult>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});
  // R1: edit mode state per item
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [editText, setEditText] = useState<Record<string, string>>({});
  const [editParseError, setEditParseError] = useState<Record<string, string>>({});
  // R2: track approved items to prevent premature removal
  const approvedLinksRef = useRef(approvedLinks);
  approvedLinksRef.current = approvedLinks;

  const role = user?.role ?? 'employee';

  const fetchItems = useCallback(async () => {
    try {
      setError(false);
      const data = await query<{
        listPendingHitlItems: { items: HitlItem[]; nextToken: string | null };
      }>(LIST_QUERY, { pagination: { limit: 20 } });
      // R2: keep items that have an active approval banner
      setItems((prev) => {
        const approvedIds = new Set(Object.keys(approvedLinksRef.current));
        const freshIds = new Set(data.listPendingHitlItems.items.map((i) => i.hitlItemId));
        // Merge: fresh items + any currently-approved items that would otherwise vanish
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
      if (resolvedId && !approvedLinksRef.current[resolvedId]) {
        setItems((prev) => prev.filter((i) => i.hitlItemId !== resolvedId));
      }
    },
  });

  /** R2: dismiss the approval banner and remove the item */
  function dismissApproval(hitlItemId: string) {
    setApprovedLinks((prev) => {
      const next = { ...prev };
      delete next[hitlItemId];
      return next;
    });
    setItems((prev) => prev.filter((i) => i.hitlItemId !== hitlItemId));
  }

  // CARD-3: Approve action
  async function handleApprove(item: HitlItem) {
    const isFlagged = !!item.guardrailEvidence;
    const note = noteInput[item.hitlItemId] ?? '';

    // CARD-7 enforcement (CON-8): flagged items MUST have justification
    if (isFlagged && !note.trim()) return;

    setActionError((prev) => ({ ...prev, [item.hitlItemId]: '' }));
    try {
      const data = await mutate<{ approveHitlItem: ApprovalResult }>(APPROVE_MUTATION, {
        input: {
          hitlItemId: item.hitlItemId,
          decision: 'APPROVE',
          justification: isFlagged ? note : undefined,
        },
      });
      // R2/CARD-5: store approval result — item exempt from removal for 10s
      setApprovedLinks((prev) => ({ ...prev, [item.hitlItemId]: data.approveHitlItem }));
      setTimeout(() => dismissApproval(item.hitlItemId), 10_000);
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [item.hitlItemId]: (err as Error).message || tCard('actionError'),
      }));
    }
  }

  // R1/CARD-3: Enter edit mode
  function enterEditMode(item: HitlItem) {
    const args = tryParseArgs(item.draftBody);
    setEditText((prev) => ({
      ...prev,
      [item.hitlItemId]: JSON.stringify(args, null, 2),
    }));
    setEditParseError((prev) => ({ ...prev, [item.hitlItemId]: '' }));
    setEditMode((prev) => ({ ...prev, [item.hitlItemId]: true }));
  }

  // R1/CARD-3: Confirm edit & approve
  async function handleConfirmEditApprove(item: HitlItem) {
    const isFlagged = !!item.guardrailEvidence;
    const note = noteInput[item.hitlItemId] ?? '';

    if (isFlagged && !note.trim()) return;

    // Parse the edited text as JSON
    let editedArgs: unknown;
    try {
      editedArgs = JSON.parse(editText[item.hitlItemId] ?? '{}');
    } catch {
      setEditParseError((prev) => ({
        ...prev,
        [item.hitlItemId]: tCard('editParseError'),
      }));
      return;
    }

    setActionError((prev) => ({ ...prev, [item.hitlItemId]: '' }));
    setEditParseError((prev) => ({ ...prev, [item.hitlItemId]: '' }));

    try {
      const data = await mutate<{ approveHitlItem: ApprovalResult }>(APPROVE_MUTATION, {
        input: {
          hitlItemId: item.hitlItemId,
          decision: 'APPROVE',
          editedPayload: editedArgs,
          justification: isFlagged ? note : undefined,
        },
      });
      setEditMode((prev) => ({ ...prev, [item.hitlItemId]: false }));
      setApprovedLinks((prev) => ({ ...prev, [item.hitlItemId]: data.approveHitlItem }));
      setTimeout(() => dismissApproval(item.hitlItemId), 10_000);
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [item.hitlItemId]: (err as Error).message || tCard('actionError'),
      }));
    }
  }

  // CARD-3: Send back with note
  async function handleSendBack(item: HitlItem) {
    setActionError((prev) => ({ ...prev, [item.hitlItemId]: '' }));
    try {
      await mutate(APPROVE_MUTATION, {
        input: {
          hitlItemId: item.hitlItemId,
          decision: 'SEND_BACK',
          note: noteInput[item.hitlItemId] || undefined,
        },
      });
      setItems((prev) => prev.filter((i) => i.hitlItemId !== item.hitlItemId));
    } catch (err) {
      setActionError((prev) => ({
        ...prev,
        [item.hitlItemId]: (err as Error).message || tCard('actionError'),
      }));
    }
  }

  if (error) return <Panel title={t('hitlQueue')}><ErrorState onRetry={fetchItems} /></Panel>;

  return (
    <Panel title={t('hitlQueue')} aria-label={t('hitlQueue')}>
      {loading ? (
        <p className={styles.loading}>{t('loading')}</p>
      ) : items.length === 0 ? (
        <EmptyState message={t('noItems')} />
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const isFlagged = !!item.guardrailEvidence;
            const canAct = canApprove(role, item.module);
            const approved = approvedLinks[item.hitlItemId];
            const isEditing = editMode[item.hitlItemId];
            // R1: hide Edit & approve if draftBody is not parseable JSON
            const isParseable = tryParseArgs(item.draftBody) !== null;

            return (
              <li key={item.hitlItemId} className={styles.card} data-testid={`hitl-card-${item.hitlItemId}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.agentName}>{item.agentName}</span>
                  <StatusBadge status={item.status} />
                </div>
                {item.clauseRef && (
                  <ClauseChip standard={item.standard} clauseRef={item.clauseRef} />
                )}
                <p className={styles.body}>{item.draftBody}</p>

                {/* CARD-6: Full guardrail evidence display */}
                {isFlagged && item.guardrailEvidence && (
                  <div className={styles.evidence}>
                    <p className={styles.evidenceLabel}>{tCard('guardrailEvidence')}</p>
                    {item.guardrailEvidence.groundingScore != null && (
                      <p className={styles.evidenceRow}>
                        {tCard('groundingScore')}: {(item.guardrailEvidence.groundingScore * 100).toFixed(0)}%
                      </p>
                    )}
                    {item.guardrailEvidence.arVerdict && (
                      <p className={styles.evidenceRow}>
                        {tCard('arVerdict')}: {item.guardrailEvidence.arVerdict}
                      </p>
                    )}
                    {item.guardrailEvidence.arDetails && (
                      <p className={styles.evidenceRow}>
                        {item.guardrailEvidence.arDetails}
                      </p>
                    )}
                    {item.guardrailEvidence.citations && item.guardrailEvidence.citations.length > 0 && (
                      <div className={styles.citations}>
                        {item.guardrailEvidence.citations.map((cit, i) => (
                          <ClauseChip key={i} standard={item.standard} clauseRef={cit.clauseRef} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* CARD-4: trust-ritual footer */}
                <p className={styles.trustRitual}>{tCard('trustRitual')}</p>

                {/* R1: inline edit mode textarea for Edit & approve */}
                {isEditing && (
                  <div className={styles.editSection}>
                    <label className={styles.editLabel}>{tCard('editArgsLabel')}</label>
                    <textarea
                      className={styles.editTextarea}
                      value={editText[item.hitlItemId] ?? ''}
                      onChange={(e) =>
                        setEditText((prev) => ({ ...prev, [item.hitlItemId]: e.target.value }))
                      }
                      aria-label={tCard('editArgsLabel')}
                      rows={6}
                    />
                    {editParseError[item.hitlItemId] && (
                      <p className={styles.editError}>{editParseError[item.hitlItemId]}</p>
                    )}
                    <div className={styles.editActions}>
                      <PrimaryButton
                        onClick={() => handleConfirmEditApprove(item)}
                        disabled={isFlagged && !(noteInput[item.hitlItemId]?.trim())}
                      >
                        {tCard('confirmEdit')}
                      </PrimaryButton>
                      <SecondaryButton
                        onClick={() => setEditMode((prev) => ({ ...prev, [item.hitlItemId]: false }))}
                      >
                        {tCard('cancelEdit')}
                      </SecondaryButton>
                    </div>
                  </div>
                )}

                {/* CARD-7: justification/note input */}
                {canAct && !approved && (
                  <div className={styles.noteWrap}>
                    <textarea
                      className={styles.justificationInput}
                      value={noteInput[item.hitlItemId] ?? ''}
                      onChange={(e) =>
                        setNoteInput((prev) => ({ ...prev, [item.hitlItemId]: e.target.value }))
                      }
                      placeholder={isFlagged ? tCard('flaggedJustification') : tCard('notePlaceholder')}
                      required={isFlagged}
                      aria-label={isFlagged ? tCard('flaggedJustification') : tCard('notePlaceholder')}
                    />
                  </div>
                )}

                {/* R2/CARD-5: ProvenanceLink banner (user-dismissible) */}
                {approved && (
                  <div className={styles.approvedBanner}>
                    <ProvenanceLink entityId={item.hitlItemId} auditEventId={approved.auditEventId}>
                      {tCard('viewAuditEvent')}
                    </ProvenanceLink>
                    <button
                      className={styles.dismissBtn}
                      onClick={() => dismissApproval(item.hitlItemId)}
                      type="button"
                      aria-label={tCard('dismiss')}
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Action error display */}
                {actionError[item.hitlItemId] && (
                  <p className={styles.actionError}>{actionError[item.hitlItemId]}</p>
                )}

                {/* CARD-3: three role-gated action buttons */}
                {canAct && !approved && !isEditing && (
                  <div className={styles.actions} data-testid={`hitl-actions-${item.hitlItemId}`}>
                    <PrimaryButton
                      onClick={() => handleApprove(item)}
                      disabled={isFlagged && !(noteInput[item.hitlItemId]?.trim())}
                    >
                      {tCard('approve')}
                    </PrimaryButton>
                    {isParseable && (
                      <SecondaryButton onClick={() => enterEditMode(item)}>
                        {tCard('editAndApprove')}
                      </SecondaryButton>
                    )}
                    <SecondaryButton onClick={() => handleSendBack(item)}>
                      {tCard('sendBack')}
                    </SecondaryButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
