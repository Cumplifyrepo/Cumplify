/**
 * AOSS retrieval wrapper — mandatory tenantId metadata filter + 45s cold-start backoff.
 * Design §4.1 — agents-existing-8.
 *
 * REQ-RET-1: Every query MUST include tenantId metadata filter.
 * REQ-RET-3: Exponential backoff — base 500ms, factor 2, jitter, ceiling 45s.
 * Steering 02-aoss-rule: Lambda timeout >= 60s; cold-start up to 45s.
 *
 * Uses the OpenSearch client to query AOSS VECTORSEARCH collections.
 * Titan Embed v2 = 1024 dimensions (D-4 corpus-corrected).
 */

import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'agents-retrieval' });

const BACKOFF_BASE_MS = 500;
const BACKOFF_FACTOR = 2;
const BACKOFF_CEILING_MS = 45_000;
const MAX_ATTEMPTS = 12; // ceil(log2(45000/500)) + margin

export interface RetrievalRequest {
  /** MANDATORY — no unfiltered query (REQ-RET-1, steering 01) */
  tenantId: string;
  /** AOSS collection endpoint URL */
  collectionEndpoint: string;
  /** Index name within the collection */
  indexName: string;
  /** Query text (will be embedded by the retrieval path) */
  queryText: string;
  /** Embedding vector (pre-computed by caller using Titan Embed v2, 1024-dim) */
  queryVector: number[];
  /** Number of results to return (default 5) */
  topK?: number;
  /** Minimum score threshold (optional relevance floor) */
  scoreThreshold?: number;
}

export interface RetrievalChunk {
  text: string;
  score: number;
  metadata: Record<string, string>;
}

export interface RetrievalResult {
  chunks: RetrievalChunk[];
  latencyMs: number;
  coldStart: boolean;
  attempts: number;
}

export class AossColdStartTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AossColdStartTimeoutError';
  }
}

export class TenantFilterMissingError extends Error {
  constructor() {
    super('AOSS retrieval query MUST include tenantId metadata filter (REQ-RET-1). This is a blocking defect.');
    this.name = 'TenantFilterMissingError';
  }
}

/**
 * Execute a tenant-isolated vector search against AOSS with exponential-backoff retry.
 *
 * The caller is responsible for:
 * 1. Embedding the query text (Titan Embed v2, 1024 dimensions).
 * 2. Providing the collection endpoint and index name.
 *
 * This function enforces:
 * - Mandatory tenantId metadata filter (REQ-RET-1).
 * - Exponential-backoff retry with 45s ceiling (REQ-RET-3).
 */
export async function retrieve(
  request: RetrievalRequest,
  /** Injectable HTTP client for testing */
  httpClient?: AossHttpClient,
): Promise<RetrievalResult> {
  // REQ-RET-1: MANDATORY tenantId filter — fail immediately if missing
  if (!request.tenantId) {
    throw new TenantFilterMissingError();
  }

  const topK = request.topK ?? 5;
  const startTime = Date.now();
  let attempts = 0;
  let coldStart = false;
  let lastError: Error | null = null;

  const client = httpClient ?? defaultAossClient;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    attempts = attempt + 1;

    // Check ceiling BEFORE attempting (except first try)
    if (attempt > 0) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= BACKOFF_CEILING_MS) {
        break; // Exceeded 45s ceiling
      }

      const delayMs = Math.min(
        BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attempt - 1),
        BACKOFF_CEILING_MS - elapsed,
      );
      const jitter = Math.random() * delayMs * 0.2;
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
      coldStart = true; // Any retry indicates a cold-start scenario
    }

    try {
      const body = buildKnnQuery(request.queryVector, request.tenantId, topK, request.scoreThreshold);
      const response = await client.search(request.collectionEndpoint, request.indexName, body);
      const chunks = parseSearchResponse(response);

      const latencyMs = Date.now() - startTime;
      logger.info('AOSS retrieval succeeded', {
        tenantId: request.tenantId,
        indexName: request.indexName,
        topK,
        resultsReturned: chunks.length,
        latencyMs,
        attempts,
        coldStart,
      });

      return { chunks, latencyMs, coldStart, attempts };
    } catch (err: unknown) {
      lastError = err as Error;
      const isRetryable = isAossRetryable(err);

      if (!isRetryable) {
        logger.error('AOSS retrieval non-retryable error', {
          tenantId: request.tenantId,
          error: (err as Error).message,
          attempts,
        });
        throw err;
      }

      logger.warn('AOSS retrieval retrying (cold-start likely)', {
        tenantId: request.tenantId,
        attempt: attempt + 1,
        error: (err as Error).message,
      });
    }
  }

  // Exhausted all attempts within ceiling
  throw new AossColdStartTimeoutError(
    `AOSS retrieval timed out after ${Date.now() - startTime}ms (${attempts} attempts). ` +
    `Last error: ${lastError?.message ?? 'unknown'}`,
  );
}

/**
 * Build the kNN query body with mandatory tenantId metadata filter.
 */
function buildKnnQuery(
  vector: number[],
  tenantId: string,
  topK: number,
  scoreThreshold?: number,
): Record<string, unknown> {
  const query: Record<string, unknown> = {
    size: topK,
    query: {
      knn: {
        embedding: {
          vector,
          k: topK,
          filter: {
            term: { 'metadata.tenantId': tenantId }, // REQ-RET-1: mandatory
          },
        },
      },
    },
    _source: ['text', 'metadata'],
  };

  if (scoreThreshold !== undefined) {
    (query as any).min_score = scoreThreshold;
  }

  return query;
}

function parseSearchResponse(response: unknown): RetrievalChunk[] {
  const hits = (response as any)?.hits?.hits ?? [];
  return hits.map((hit: any) => ({
    text: hit._source?.text ?? '',
    score: hit._score ?? 0,
    metadata: hit._source?.metadata ?? {},
  }));
}

function isAossRetryable(err: unknown): boolean {
  const statusCode = (err as any)?.statusCode ?? (err as any)?.$metadata?.httpStatusCode ?? 0;
  const message = ((err as Error).message ?? '').toLowerCase();
  return (
    statusCode >= 500 ||
    statusCode === 503 ||
    statusCode === 429 ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('service unavailable')
  );
}

// ─── HTTP Client Interface (injectable for testing) ─────────────────────────

export interface AossHttpClient {
  search(endpoint: string, indexName: string, body: Record<string, unknown>): Promise<unknown>;
}

/** Default AOSS client — placeholder for real OpenSearch client integration */
const defaultAossClient: AossHttpClient = {
  async search(endpoint: string, indexName: string, body: Record<string, unknown>): Promise<unknown> {
    // In production, this uses @opensearch-project/opensearch with SigV4 signing.
    // Injected via Lambda environment or imported from a shared AOSS client module.
    const url = `${endpoint}/${indexName}/_search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000), // Socket timeout: 50s
    });

    if (!response.ok) {
      const error = new Error(`AOSS search failed: ${response.status} ${response.statusText}`);
      (error as any).statusCode = response.status;
      throw error;
    }

    return response.json();
  },
};
