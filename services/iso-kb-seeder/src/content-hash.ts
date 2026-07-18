/**
 * Content hash computation for idempotent re-seed (SEED-2a).
 * SHA-256 over the deterministic serialized chunk output.
 */

import { createHash } from 'node:crypto';
import type { Chunk } from './chunker.js';

/**
 * Compute a SHA-256 hash over the full chunked output.
 * Deterministic per CHUNK-1f: same input → same chunks → same hash.
 */
export function computeContentHash(chunks: Chunk[]): string {
  const serialized = JSON.stringify(chunks);
  return createHash('sha256').update(serialized).digest('hex');
}
