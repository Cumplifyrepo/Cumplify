/**
 * _meta document read/write for idempotent re-seed detection (SEED-2b).
 * D-2: _meta doc uses metadata.tenantId='__META__' (never __ISO_CANON__)
 * and has NO embedding field — unretrievable by kNN search.
 *
 * FIX-P12-4: AOSS vector collections reject client-supplied _id.
 * Write: POST /_doc (auto-ID).
 * Read: POST /_search with term filters (metadata.tenantId='__META__' +
 * metadata.clauseRef='_meta'), size:1. GET-by-ID is unusable on vector collections.
 * Old _meta dies with index deletion on re-seed — no duplicate handling needed.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { aossReadOp, aossWriteOp } from './aoss-retry.js';

const logger = new Logger({ serviceName: 'iso-kb-seeder-meta' });

export interface MetaDoc {
  contentHash: string;
  chunksTotal: number;
  seededAt: string;
}

/**
 * Read the _meta document's content hash from AOSS via _search.
 * Returns null if no _meta doc exists (empty search result or index absent).
 * FIX-P12-4: uses _search with term filters instead of GET-by-ID.
 */
export async function readMetaHash(endpoint: string, indexName: string): Promise<string | null> {
  try {
    const searchBody = JSON.stringify({
      query: {
        bool: {
          filter: [
            { term: { 'metadata.tenantId': '__META__' } },
            { term: { 'metadata.clauseRef': '_meta' } },
          ],
        },
      },
      size: 1,
      _source: ['contentHash'],
    });

    const resp = await aossReadOp(
      'readMetaHash',
      'POST',
      endpoint,
      `/${indexName}/_search`,
      searchBody,
    );

    if (resp.status === 200) {
      const parsed = JSON.parse(resp.body);
      const hits = parsed?.hits?.hits ?? [];
      if (hits.length > 0) {
        return hits[0]._source?.contentHash ?? null;
      }
      return null;
    }

    // 404 = index absent → null (no retry per aossReadOp semantics)
    return null;
  } catch {
    // Exhausted retries on transient errors → treat as absent (O-1: benign full re-seed)
    logger.info('Meta doc not readable after retries — treating as absent');
    return null;
  }
}

/**
 * Write the _meta document after successful seeding.
 * D-2: metadata.tenantId='__META__', NO embedding field.
 * FIX-P12-4: POST /_doc (auto-ID) — AOSS rejects client-supplied IDs.
 */
export async function writeMetaDoc(
  endpoint: string,
  indexName: string,
  contentHash: string,
  chunksTotal: number,
): Promise<void> {
  const doc = {
    text: '',
    metadata: {
      tenantId: '__META__',
      standard: 'SYSTEM',
      clauseRef: '_meta',
      lang: 'en',
    },
    contentHash,
    chunksTotal,
    seededAt: new Date().toISOString(),
    // D-2: deliberately NO embedding field — kNN cannot match this doc
  };

  const resp = await aossWriteOp(
    'writeMetaDoc',
    'POST',
    endpoint,
    `/${indexName}/_doc`,
    JSON.stringify(doc),
  );

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Failed to write _meta doc: HTTP ${resp.status} — ${resp.body}`);
  }

  logger.info('Meta doc written', { contentHash, chunksTotal });
}
