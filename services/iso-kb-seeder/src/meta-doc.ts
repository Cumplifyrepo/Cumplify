/**
 * _meta document read/write for idempotent re-seed detection (SEED-2b).
 * D-2: _meta doc uses metadata.tenantId='__META__' (never __ISO_CANON__)
 * and has NO embedding field — unretrievable by kNN search.
 *
 * FIX-P12-2: All AOSS ops wrapped with per-operation retry (design §5).
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { aossReadOp, aossWriteOp } from './aoss-retry.js';

const logger = new Logger({ serviceName: 'iso-kb-seeder-meta' });

const META_DOC_ID = '_cumplify_iso_kb_meta';

export interface MetaDoc {
  contentHash: string;
  chunksTotal: number;
  seededAt: string;
}

/**
 * Read the _meta document's content hash from AOSS.
 * Returns null if the document or index doesn't exist (404 = absent, not retried).
 */
export async function readMetaHash(endpoint: string, indexName: string): Promise<string | null> {
  try {
    const resp = await aossReadOp(
      'readMetaHash',
      'GET',
      endpoint,
      `/${indexName}/_doc/${META_DOC_ID}`,
    );

    if (resp.status === 200) {
      const parsed = JSON.parse(resp.body);
      return parsed._source?.contentHash ?? null;
    }

    // 404 = index or doc absent → null (no retry)
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
 * Uses write-path retry (403/404/429/5xx retryable).
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
    'PUT',
    endpoint,
    `/${indexName}/_doc/${META_DOC_ID}`,
    JSON.stringify(doc),
  );

  if (resp.status !== 200 && resp.status !== 201) {
    throw new Error(`Failed to write _meta doc: HTTP ${resp.status} — ${resp.body}`);
  }

  logger.info('Meta doc written', { contentHash, chunksTotal });
}
