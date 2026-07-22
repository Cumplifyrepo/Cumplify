/**
 * Shared HITL plumbing for studio surfaces (S0 chassis).
 * Extracted from dashboard HitlQueuePanel so every studio renders the SAME
 * card with the SAME enforcement semantics (CARD-1..7, SoD, matrix).
 */

export interface Citation {
  clauseRef: string;
  sourceChunk: string | null;
  score: number | null;
}

export interface GuardrailEvidence {
  groundingScore: number | null;
  arVerdict: string | null;
  arDetails: string | null;
  citations: Citation[] | null;
}

export interface HitlItem {
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

export interface ApprovalResult {
  hitlItemId: string;
  auditEventId: string;
  auditEventTimestamp: string;
}

export const LIST_PENDING_HITL_QUERY = `query ListPending($pagination: PaginationInput) {
  listPendingHitlItems(pagination: $pagination) {
    items {
      hitlItemId agentName clauseRef standard module draftBody status createdAt
      guardrailEvidence { groundingScore arVerdict arDetails citations { clauseRef sourceChunk score } }
    }
    nextToken
  }
}`;

export const APPROVE_HITL_MUTATION = `mutation Approve($input: ApproveHitlItemInput!) {
  approveHitlItem(input: $input) { hitlItemId tenantId decision auditEventId auditEventTimestamp resolvedBy resolvedAt }
}`;

/** Try to parse draftBody as JSON and extract .args. Returns null if unparseable. */
export function tryParseArgs(draftBody: string): Record<string, unknown> | null {
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
