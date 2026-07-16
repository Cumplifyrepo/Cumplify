/**
 * Unit tests for the Task-12 AOSS prover (architect ops tool).
 * Pins: fail-closed template check BEFORE seeding; task12- index-prefix
 * guard on seed/delete; 1024-dim + tenantId enforcement on seed docs;
 * query delegates to the REAL retrieve() wrapper with the tenant filter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const signedFetchMock = vi.fn();
const verifyTemplateMock = vi.fn();
const retrieveMock = vi.fn();

vi.mock('../aoss-signed-client.js', () => ({
  signedAossFetch: (...args: unknown[]) => signedFetchMock(...args),
}));
vi.mock('../aoss-apply-template.js', () => ({
  verifyTemplate: (...args: unknown[]) => verifyTemplateMock(...args),
}));
vi.mock('../retrieval.js', () => ({
  retrieve: (...args: unknown[]) => retrieveMock(...args),
}));

process.env.COLLECTIONS = JSON.stringify([
  { name: 'cumplify-tenant-docs-kb', endpoint: 'https://tdocs.us-east-1.aoss.amazonaws.com' },
]);

const { handler } = await import('../aoss-prover.js');

const GOOD_VERIFY = {
  collection: 'cumplify-tenant-docs-kb',
  dimension: 1024,
  tenantIdType: 'keyword',
};

function seedDoc(overrides: Record<string, unknown> = {}) {
  return {
    text: 'Quality manual excerpt',
    embedding: Array(1024).fill(0.02),
    metadata: { tenantId: 'tenant-a-t12', docKey: 'a1' },
    ...overrides,
  };
}

beforeEach(() => {
  signedFetchMock.mockReset();
  verifyTemplateMock.mockReset();
  retrieveMock.mockReset();
  verifyTemplateMock.mockResolvedValue(GOOD_VERIFY);
  signedFetchMock.mockResolvedValue({ status: 201, body: JSON.stringify({ _id: 'auto-1' }) });
});

describe('aoss-prover handler', () => {
  it('rejects unknown collections fail-closed', async () => {
    await expect(
      handler({ action: 'template-check', collection: 'not-a-collection' } as any),
    ).rejects.toThrow(/Unknown collection/);
  });

  it('template-check delegates to the single-source verifyTemplate', async () => {
    const result = await handler({
      action: 'template-check',
      collection: 'cumplify-tenant-docs-kb',
    });
    expect(result).toEqual(GOOD_VERIFY);
    expect(verifyTemplateMock).toHaveBeenCalledWith(
      'cumplify-tenant-docs-kb',
      'https://tdocs.us-east-1.aoss.amazonaws.com',
    );
  });

  it('seed runs the template check BEFORE indexing and aborts on failure', async () => {
    verifyTemplateMock.mockRejectedValue(new Error('FAIL-CLOSED: template absent'));
    await expect(
      handler({
        action: 'seed',
        collection: 'cumplify-tenant-docs-kb',
        indexName: 'task12-e2e',
        docs: [seedDoc()],
      }),
    ).rejects.toThrow(/FAIL-CLOSED/);
    expect(signedFetchMock).not.toHaveBeenCalled(); // zero docs indexed
  });

  it('seed refuses indexes without the task12- prefix', async () => {
    await expect(
      handler({
        action: 'seed',
        collection: 'cumplify-tenant-docs-kb',
        indexName: 'tenant-docs',
        docs: [seedDoc()],
      }),
    ).rejects.toThrow(/REFUSED/);
    expect(verifyTemplateMock).not.toHaveBeenCalled();
    expect(signedFetchMock).not.toHaveBeenCalled();
  });

  it('seed rejects wrong-dimension embeddings and docs without tenantId', async () => {
    await expect(
      handler({
        action: 'seed',
        collection: 'cumplify-tenant-docs-kb',
        indexName: 'task12-e2e',
        docs: [seedDoc({ embedding: Array(1536).fill(0.02) })],
      }),
    ).rejects.toThrow(/1024-dim/);

    await expect(
      handler({
        action: 'seed',
        collection: 'cumplify-tenant-docs-kb',
        indexName: 'task12-e2e',
        docs: [seedDoc({ metadata: { docKey: 'a1' } })],
      }),
    ).rejects.toThrow(/tenantId/);
  });

  it('seed POSTs docs with auto-ID (no client _id — AOSS VECTORSEARCH limitation)', async () => {
    const result = (await handler({
      action: 'seed',
      collection: 'cumplify-tenant-docs-kb',
      indexName: 'task12-e2e',
      docs: [seedDoc(), seedDoc({ metadata: { tenantId: 'tenant-b-t12', docKey: 'b1' } })],
    })) as any;

    expect(result.indexed).toBe(2);
    expect(result.templateCheck).toEqual(GOOD_VERIFY);
    expect(signedFetchMock).toHaveBeenCalledTimes(2);
    const [method, , path] = signedFetchMock.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/task12-e2e/_doc'); // no /_doc/{id}
  });

  it('query delegates to the real retrieve() with tenantId', async () => {
    retrieveMock.mockResolvedValue({ chunks: [], latencyMs: 42, coldStart: false, attempts: 1 });
    await handler({
      action: 'query',
      collection: 'cumplify-tenant-docs-kb',
      indexName: 'task12-e2e',
      tenantId: 'tenant-a-t12',
      queryVector: Array(1024).fill(0.01),
      topK: 5,
    });
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a-t12',
        collectionEndpoint: 'https://tdocs.us-east-1.aoss.amazonaws.com',
        indexName: 'task12-e2e',
        topK: 5,
      }),
    );
  });

  it('delete-index refuses non-proof indexes', async () => {
    await expect(
      handler({
        action: 'delete-index',
        collection: 'cumplify-tenant-docs-kb',
        indexName: 'tenant-docs',
      }),
    ).rejects.toThrow(/REFUSED/);
    expect(signedFetchMock).not.toHaveBeenCalled();
  });

  it('accepts task13-/task14- eval-corpus indexes (budget-gated re-evals)', async () => {
    signedFetchMock.mockResolvedValue({ status: 200, body: '{}' });
    for (const idx of ['task13-guru45001-kb', 'task14-obligations-kb']) {
      await expect(
        handler({ action: 'delete-index', collection: 'cumplify-tenant-docs-kb', indexName: idx }),
      ).resolves.toMatchObject({ deleted: idx });
    }
  });

  it('delete-index DELETEs task12- indexes and tolerates 404', async () => {
    signedFetchMock.mockResolvedValue({ status: 404, body: '{}' });
    const result = (await handler({
      action: 'delete-index',
      collection: 'cumplify-tenant-docs-kb',
      indexName: 'task12-e2e',
    })) as any;
    expect(result.deleted).toBe('task12-e2e');
    expect(signedFetchMock).toHaveBeenCalledWith(
      'DELETE',
      'https://tdocs.us-east-1.aoss.amazonaws.com',
      '/task12-e2e',
    );
  });
});
