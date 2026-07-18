/**
 * ISO KB Seeder — core seed logic.
 * Called by cfn-handler.ts (CFN custom resource protocol wrapper).
 * Spec: iso-kb-content-depth (LEG-1), design §2.4.
 *
 * D-1: source markdown inlined at BUILD TIME via esbuild text loader.
 * D-2: _meta doc uses tenantId='__META__', no embedding field.
 * SEED-2: idempotent by content hash — skip if unchanged.
 * OQ-1 RESOLVED: STATIC imports only. Dynamic directory read is STRUCK (D-1 incident class).
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { verifyTemplate } from '../../agents/shared/aoss-apply-template.js';
import { createEmbedFn } from '../../agents/shared/invoke-transport.js';
import { chunkContentSources, type ContentSource } from './chunker.js';
import { computeContentHash } from './content-hash.js';
import { readMetaHash, writeMetaDoc } from './meta-doc.js';
import { embedAllChunks, bulkIndex, deleteIndexIfExists, createIndex } from './bulk-index.js';

// D-1: Build-time inline — esbuild text loader resolves at bundle, NOT runtime fs
// Four static imports — one per content file (iso-kb-content-depth OQ-1b)
import iso9001Source from '../../../docs/kb/iso-9001.md';
import iso14001Source from '../../../docs/kb/iso-14001.md';
import iso45001Source from '../../../docs/kb/iso-45001.md';
import hlsSource from '../../../docs/kb/hls.md';

const logger = new Logger({ serviceName: 'iso-kb-seeder' });

const AOSS_ENDPOINT = process.env.AOSS_ENDPOINT!;
const AOSS_INDEX_NAME = process.env.AOSS_INDEX_NAME ?? 'cumplify-iso-kb';

/** Content sources array — deterministic order */
const CONTENT_SOURCES: ContentSource[] = [
  { source: iso9001Source, standard: 'ISO9001', stdNum: '9001' },
  { source: iso14001Source, standard: 'ISO14001', stdNum: '14001' },
  { source: iso45001Source, standard: 'ISO45001', stdNum: '45001' },
  { source: hlsSource, standard: 'HLS', stdNum: '' },
];

export interface SeederResult {
  status: 'skipped' | 'seeded';
  contentHash: string;
  chunksTotal: number;
  chunksIndexed?: number;
  durationMs?: number;
}

/**
 * Core seed function — run by cfn-handler.ts on Create/Update.
 * Idempotent: skips if content hash unchanged.
 */
export async function seed(): Promise<SeederResult> {
  const start = Date.now();
  logger.info('Seed started');

  // 1. Chunk (pure function, build-time-inlined sources)
  const chunks = chunkContentSources(CONTENT_SOURCES);
  logger.info('Chunked', { chunksTotal: chunks.length });

  // 2. Compute content hash
  const contentHash = computeContentHash(chunks);

  // 3. Check existing hash (read _meta doc from AOSS — D-2: tenantId='__META__')
  const existingHash = await readMetaHash(AOSS_ENDPOINT, AOSS_INDEX_NAME);
  if (existingHash === contentHash) {
    const durationMs = Date.now() - start;
    logger.info('Content unchanged — skipping', { contentHash, skipped: true, durationMs });
    return { status: 'skipped', contentHash, chunksTotal: chunks.length };
  }

  // 4. Verify template (fail-closed — ACC-5)
  await verifyTemplate(AOSS_INDEX_NAME, AOSS_ENDPOINT);
  logger.info('Template verified');

  // 5. Delete existing index (accepted-degraded window starts — R-5)
  await deleteIndexIfExists(AOSS_ENDPOINT, AOSS_INDEX_NAME);

  // 6. Create index
  await createIndex(AOSS_ENDPOINT, AOSS_INDEX_NAME);

  // 7. Embed all chunks via one-door (systemOp: true)
  const embedFn = createEmbedFn();
  const embeddings = await embedAllChunks(chunks, embedFn);

  // 8. Bulk-index to AOSS
  const chunksIndexed = await bulkIndex(chunks, embeddings, AOSS_ENDPOINT, AOSS_INDEX_NAME);

  // 9. Write _meta doc (contentHash, D-2: tenantId='__META__', no embedding)
  await writeMetaDoc(AOSS_ENDPOINT, AOSS_INDEX_NAME, contentHash, chunks.length);
  // Accepted-degraded window ends

  const durationMs = Date.now() - start;
  logger.info('Seeding complete', {
    chunksTotal: chunks.length,
    chunksIndexed,
    contentHash,
    skipped: false,
    durationMs,
  });

  return { status: 'seeded', contentHash, chunksTotal: chunks.length, chunksIndexed, durationMs };
}
