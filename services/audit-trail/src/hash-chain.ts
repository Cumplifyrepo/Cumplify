/**
 * Hash-chain primitives for the immutable audit trail.
 *
 * REV-10: This is the SINGLE source of truth for hash computation.
 * Both the appender and the verifier import from here.
 * Two implementations = how chains "break" without tampering.
 */

import { createHash } from 'node:crypto';

/**
 * Compute the hash-chain link for an audit-trail item.
 * Input: the predecessor item's PK, SK, and payloadHash.
 * Output: hex-encoded SHA-256 digest.
 */
export function computePrevHash(
  predecessorPK: string,
  predecessorSK: string,
  predecessorPayloadHash: string,
): string {
  return createHash('sha256')
    .update(`${predecessorPK}${predecessorSK}${predecessorPayloadHash}`)
    .digest('hex');
}

/**
 * Sentinel value for the first event in a partition (no predecessor).
 */
export const GENESIS_HASH = 'GENESIS';

/**
 * Compute payload hash: SHA-256 of canonical JSON {before, after}.
 * If before/after are absent in the payload, they default to null.
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    before: (payload.before as unknown) ?? null,
    after: (payload.after as unknown) ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
