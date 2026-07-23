/**
 * Tenant-docs indexer (B3) — indexes published documents into the
 * cumplify-tenant-docs AOSS collection for agent retrieval.
 *
 * Trigger: Document.Published event via SQS (standard queue, eventing-stack).
 * Flow: read content_ref from RDS → fetch content from S3 → chunk prose
 * sections → embed via createEmbedFn (one-door) → bulk write to AOSS.
 *
 * L1 MANDATE: this Lambda MUST be vpcPlaced — AOSS collections reject
 * public data-plane calls (VPCE-only network policy). Without VPC
 * placement every write 401s at runtime and no unit test catches it.
 *
 * 02-aoss-rule: exponential backoff (base 500ms, factor 2, jitter,
 * ceiling 45s). Lambda timeout >= 60s.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  RDSDataClient,
  BeginTransactionCommand,
  ExecuteStatementCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { createHandler } from '../../eventing/src/consumer.js';
import { createEmbedFn, type EmbedFn } from '../../agents/shared/invoke-transport.js';
import { signedAossFetch } from '../../agents/shared/aoss-signed-client.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';

const logger = new Logger({ serviceName: 'indexer-tenant-docs' });

// ─── Environment (L4: read at CALL time, not module scope) ─────────────────
function env(key: string): string {
  const val = process.env[key] ?? '';
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

// ─── Clients (module-scope cold-cached per Lambda container) ────────────────
const s3Client = new S3Client({});
const rdsClient = new RDSDataClient({});
const embedFn: EmbedFn = createEmbedFn();

// ─── AOSS write with exponential-backoff retry (02-aoss-rule) ───────────────

const BACKOFF_BASE_MS = 500;
const BACKOFF_FACTOR = 2;
const BACKOFF_CEILING_MS = 45_000;
const MAX_ATTEMPTS = 12;

async function aossWriteWithRetry(
  endpoint: string,
  indexName: string,
  body: Record<string, unknown>,
): Promise<void> {
  // POST /_doc (auto-ID): VECTORSEARCH collections reject client-supplied _id
  // on PUT /_doc/<id> (FIX-P12-4). Dedup: on re-publish, prior version's
  // sections become stale — the new publish re-indexes all prose sections with
  // the current versionId in metadata. Consumers filter by versionId freshness
  // at retrieval time (metadata.versionId = latest wins). A periodic cleanup
  // job (roadmap) deletes stale-version documents.
  const path = `/${indexName}/_doc`;
  const startTime = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= BACKOFF_CEILING_MS) break;
      const delayMs = Math.min(
        BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attempt - 1),
        BACKOFF_CEILING_MS - elapsed,
      );
      const jitter = Math.random() * delayMs * 0.2;
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }

    const resp = await signedAossFetch(
      'POST',
      endpoint,
      path,
      JSON.stringify(body),
      Math.max(BACKOFF_CEILING_MS - (Date.now() - startTime) + 5000, 10_000),
    );

    if (resp.status >= 200 && resp.status < 300) return;

    // House write-path retryable statuses: 403 (cold-start IAM propagation),
    // 404 (index not yet created on cold AOSS), 429, 5xx
    if (resp.status === 403 || resp.status === 404 || resp.status === 429 || resp.status >= 500) {
      logger.warn('AOSS write retrying', { status: resp.status, attempt, indexName });
      continue;
    }

    // Non-retryable client error
    throw new Error(`AOSS write failed: status=${resp.status} body=${resp.body.slice(0, 200)}`);
  }

  throw new Error(
    `AOSS write timed out after ${Date.now() - startTime}ms (${MAX_ATTEMPTS} attempts)`,
  );
}

// ─── Content types ──────────────────────────────────────────────────────────

interface ContentSection {
  harmonizationKey: string;
  kind: string;
  sentences?: Array<{ text: string; sources?: string[] }>;
}

interface DocumentContent {
  schemaVersion?: number;
  sections: ContentSection[];
}

interface DocumentPublishedPayload {
  versionId: string;
  documentId: string;
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function processDocumentPublished(
  event: CumplifyEvent<DocumentPublishedPayload>,
): Promise<void> {
  const { tenantId, standard, payload } = event;
  const { versionId, documentId } = payload;

  if (!versionId || !documentId) {
    logger.warn('Missing versionId or documentId in payload — skipping', { tenantId });
    return;
  }

  const clusterArn = env('CLUSTER_ARN');
  const secretArn = env('APP_ROLE_SECRET_ARN');
  const bucket = env('CONTENT_BUCKET');
  const aossEndpoint = env('AOSS_TENANT_DOCS_ENDPOINT');
  const indexName = 'cumplify-tenant-docs';

  // 1. Read content_ref from RDS via C-2 pattern (BeginTransaction → set_config → SELECT → Commit)
  const { transactionId } = await rdsClient.send(
    new BeginTransactionCommand({
      resourceArn: clusterArn,
      secretArn,
      database: 'postgres',
    }),
  );

  let contentRef: string | undefined;
  try {
    // C-2 INVARIANT: set_config is the FIRST statement, transaction-local (true)
    await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: clusterArn,
        secretArn,
        database: 'postgres',
        transactionId,
        sql: `SELECT set_config('app.tenant_id', :tenantId, true)`,
        parameters: [{ name: 'tenantId', value: { stringValue: tenantId } }],
      }),
    );

    const contentRefResult = await rdsClient.send(
      new ExecuteStatementCommand({
        resourceArn: clusterArn,
        secretArn,
        database: 'postgres',
        transactionId,
        sql: `SELECT content_ref FROM m1.document_versions WHERE id = :versionId::uuid`,
        parameters: [{ name: 'versionId', value: { stringValue: versionId } }],
        includeResultMetadata: true,
      }),
    );

    await rdsClient.send(
      new CommitTransactionCommand({ resourceArn: clusterArn, secretArn, transactionId }),
    );

    contentRef = contentRefResult.records?.[0]?.[0]?.stringValue;
  } catch (err) {
    try {
      await rdsClient.send(
        new RollbackTransactionCommand({ resourceArn: clusterArn, secretArn, transactionId }),
      );
    } catch { /* never mask */ }
    throw err;
  }

  if (!contentRef) {
    logger.warn('No content_ref found for version — skipping', { tenantId, versionId });
    return;
  }

  // 2. Fetch content from S3
  const s3Resp = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: contentRef }),
  );
  const bodyStr = await s3Resp.Body!.transformToString('utf-8');
  const content: DocumentContent = JSON.parse(bodyStr);

  // 3. Chunk prose sections — each prose section becomes one index document
  const proseSections = content.sections.filter((s) => s.kind === 'prose' && s.sentences?.length);

  if (proseSections.length === 0) {
    logger.info('No prose sections to index', { tenantId, documentId });
    return;
  }

  logger.info('Indexing document sections', {
    tenantId,
    documentId,
    versionId,
    sectionCount: proseSections.length,
  });

  // 4. Embed + write each section
  for (const section of proseSections) {
    const text = section.sentences!.map((s) => s.text).join(' ');
    if (!text.trim()) continue;

    // Embed via one-door (systemOp = true: COGS, not tenant credits)
    const { embedding } = await embedFn({
      tenantId,
      agent: 'TenantDocsIndexer',
      module: 'M1',
      feature: 'tenant-docs-indexer',
      text,
      systemOp: true,
    });

    // AOSS document: matches the retrieval schema (retrieval.ts buildKnnQuery)
    const aossDoc = {
      embedding,
      text,
      metadata: {
        tenantId,
        documentId,
        versionId,
        standard,
        clauseRef: section.harmonizationKey,
      },
    };

    await aossWriteWithRetry(aossEndpoint, indexName, aossDoc);
  }

  logger.info('Document indexed successfully', {
    tenantId,
    documentId,
    versionId,
    sectionsIndexed: proseSections.length,
  });
}

// ─── SQS Entry Point ────────────────────────────────────────────────────────

export const handler = createHandler({
  dlqUrl: process.env.DLQ_URL ?? '',
  handler: async (event, _detailType) => {
    await processDocumentPublished(event as unknown as CumplifyEvent<DocumentPublishedPayload>);
  },
});

// Export for testing
export { processDocumentPublished, aossWriteWithRetry };
