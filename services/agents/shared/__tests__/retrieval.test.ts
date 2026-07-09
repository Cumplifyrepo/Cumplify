/**
 * Unit tests for AOSS retrieval wrapper.
 * Verifies: tenantId filter always present; backoff config correct;
 * timeout error thrown at ceiling; non-retryable errors propagate immediately.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  retrieve,
  TenantFilterMissingError,
  AossColdStartTimeoutError,
  type AossHttpClient,
  type RetrievalRequest,
} from '../retrieval.js';

function baseRequest(overrides: Partial<RetrievalRequest> = {}): RetrievalRequest {
  return {
    tenantId: 'tenant-a',
    collectionEndpoint: 'https://aoss.us-east-1.es.amazonaws.com',
    indexName: 'iso-kb',
    queryText: 'what is clause 4.1?',
    queryVector: Array(1024).fill(0.01),
    topK: 5,
    ...overrides,
  };
}

function mockClient(responses: Array<unknown | Error>): AossHttpClient {
  let callIndex = 0;
  return {
    async search(_endpoint, _indexName, body, _timeoutMs) {
      const resp = responses[callIndex++];
      if (resp instanceof Error) throw resp;
      // Assert tenantId filter is always in the query body
      const filter = (body as any)?.query?.knn?.embedding?.filter;
      expect(filter).toBeDefined();
      expect(filter.term['metadata.tenantId']).toBeDefined();
      return resp;
    },
  };
}

function successResponse(texts: string[] = ['clause 4.1 content']) {
  return {
    hits: {
      hits: texts.map((text, i) => ({
        _score: 0.95 - i * 0.1,
        _source: { text, metadata: { tenantId: 'tenant-a', clauseRef: '4.1' } },
      })),
    },
  };
}

describe('retrieval wrapper', () => {
  it('returns results with tenantId filter enforced (REQ-RET-1)', async () => {
    const client = mockClient([successResponse(['result 1', 'result 2'])]);
    const result = await retrieve(baseRequest(), client);

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].text).toBe('result 1');
    expect(result.chunks[0].metadata.tenantId).toBe('tenant-a');
    expect(result.coldStart).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('throws TenantFilterMissingError when tenantId is empty (REQ-RET-1)', async () => {
    const client = mockClient([]);
    await expect(retrieve(baseRequest({ tenantId: '' }), client)).rejects.toThrow(TenantFilterMissingError);
  });

  it('retries on 503 with exponential backoff (cold-start scenario)', async () => {
    const serviceUnavailable = new Error('Service Unavailable');
    (serviceUnavailable as any).statusCode = 503;

    const client = mockClient([serviceUnavailable, serviceUnavailable, successResponse()]);
    const result = await retrieve(baseRequest(), client);

    expect(result.chunks).toHaveLength(1);
    expect(result.coldStart).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('does NOT retry on 400 client error (non-retryable)', async () => {
    const clientError = new Error('Bad Request');
    (clientError as any).statusCode = 400;

    const client = mockClient([clientError]);
    await expect(retrieve(baseRequest(), client)).rejects.toThrow('Bad Request');
  });

  it('throws AossColdStartTimeoutError when ceiling exhausted', async () => {
    // Mock a client that always fails with retryable error
    let attemptCount = 0;
    const timeoutError = new Error('connection timeout');
    (timeoutError as any).statusCode = 503;

    const client: AossHttpClient = {
      async search() {
        attemptCount++;
        throw timeoutError;
      },
    };

    // Patch Date.now to jump past 45s after the first attempt
    const startReal = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First few calls: normal time. After attempt 2: jump past ceiling.
      if (callCount <= 3) return startReal + callCount * 100;
      return startReal + 50_000; // Past 45s ceiling
    });

    await expect(retrieve(baseRequest(), client)).rejects.toThrow(AossColdStartTimeoutError);
    expect(attemptCount).toBeGreaterThanOrEqual(2);

    vi.restoreAllMocks();
  });

  it('includes scoreThreshold in query when provided', async () => {
    let capturedBody: any;
    const client: AossHttpClient = {
      async search(_endpoint, _indexName, body) {
        capturedBody = body;
        return successResponse();
      },
    };

    await retrieve(baseRequest({ scoreThreshold: 0.7 }), client);
    expect(capturedBody.min_score).toBe(0.7);
  });

  it('uses topK=5 by default', async () => {
    let capturedBody: any;
    const client: AossHttpClient = {
      async search(_endpoint, _indexName, body) {
        capturedBody = body;
        return successResponse();
      },
    };

    await retrieve(baseRequest({ topK: undefined }), client);
    expect(capturedBody.size).toBe(5);
    expect(capturedBody.query.knn.embedding.k).toBe(5);
  });

  it('throws on wrong vector dimensions (R5-n1: must be 1024)', async () => {
    const client = mockClient([]);
    await expect(
      retrieve(baseRequest({ queryVector: Array(768).fill(0.01) }), client),
    ).rejects.toThrow('queryVector must be 1024 dimensions');
  });
});
