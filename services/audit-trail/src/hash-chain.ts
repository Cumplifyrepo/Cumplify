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
 * Recursively sort object keys — canonical form must be independent of
 * insertion order. PROVEN LIVE (Task-11 E2E, 2026-07-09): DynamoDB returns
 * map keys lexicographically; a payload appended as {tool, result} was
 * hashed in insertion order but recomputed by the verifier from DDB order
 * {result, tool} → false tamper alarm (stored e816b771... vs recomputed
 * c49649fd..., byte-verified). Every earlier event passed only because its
 * before/after were absent (constant hash) or already-sorted.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * Compute payload hash: SHA-256 of canonical (recursively key-sorted) JSON
 * {before, after}. If before/after are absent, they default to null.
 * Key-sorted canonicalization makes the hash stable across DynamoDB
 * marshall/unmarshall round-trips (maps do not preserve key order).
 */
export function computePayloadHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    sortKeysDeep({
      before: (payload.before as unknown) ?? null,
      after: (payload.after as unknown) ?? null,
    }),
  );
  return createHash('sha256').update(canonical).digest('hex');
}
