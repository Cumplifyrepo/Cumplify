/**
 * Tenant-docs indexer unit tests (B3).
 * Hermetic: mocks RDS Data API, S3, embed (one-door), AOSS signed client.
 * Validates: C-2 transaction pattern, S3 fetch, prose-only chunking, embed
 * call per section, POST /_doc auto-ID writes, skips non-prose sections,
 * handles missing payload gracefully, retries on 403/404/429/5xx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockRdsSend, mockS3Send, mockEmbedFn, mockAossFetch } = vi.hoisted(() => ({
  mockRdsSend: vi.fn(),
  mockS3Send: vi.fn(),
  mockEmbedFn: vi.fn(),
  mockAossFetch: vi.fn(),
}));

vi.mock('@aws-sdk/client-rds-data', () => ({
  RDSDataClient: class {
    send = mockRdsSend;
  },
  BeginTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  ExecuteStatementCommand: class {
    constructor(public input: unknown) {}
  },
  CommitTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  RollbackTransactionCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('../../agents/shared/invoke-transport.js', () => ({
  createEmbedFn: () => mockEmbedFn,
  createInvokeFn: () => vi.fn(),
}));

vi.mock('../../agents/shared/aoss-signed-client.js', () => ({
  signedAossFetch: mockAossFetch,
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    appendKeys = vi.fn();
  },
}));

vi.mock('../../eventing/src/consumer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../eventing/src/consumer.js')>();
  return { ...actual };
});

// ─── Env setup (L4: call-time read) ─────────────────────────────────────────

process.env.CLUSTER_ARN = 'arn:aws:rds:us-east-1:123:cluster:test';
process.env.APP_ROLE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:test';
process.env.CONTENT_BUCKET = 'mock-general-bucket';
process.env.AOSS_TENANT_DOCS_ENDPOINT = 'https://mock.us-east-1.aoss.amazonaws.com';
process.env.AI_INVOKER_ARN = 'arn:aws:lambda:us-east-1:123:function:ai-invoker';
process.env.DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123/TenantDocsIndexerDlq';

import { processDocumentPublished } from '../tenant-docs/handler.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(payload: Record<string, unknown>): CumplifyEvent<any> {
  return {
    tenantId: 'tenant-aaa',
    eventId: 'evt-1',
    timestamp: '2026-07-22T00:00:00Z',
    actor: 'user-1',
    module: 'M1',
    clauseRef: 'ISO 9001 7.5.3',
    standard: 'ISO9001',
    auditTrail: true,
    entityId: 'doc-1',
    payload,
  };
}

const CONTENT_REF = 'tenants/tenant-aaa/documents/doc-1/v1.json';

const DOCUMENT_CONTENT = {
  schemaVersion: 1,
  sections: [
    {
      harmonizationKey: '4.1',
      kind: 'prose',
      sentences: [
        { text: 'The organization determines external issues.', sources: ['profile.legalName'] },
        { text: 'Internal issues are monitored.', sources: [] },
      ],
    },
    {
      harmonizationKey: '4.2',
      kind: 'gap',
      sentences: [],
    },
    {
      harmonizationKey: '4.4',
      kind: 'prose',
      sentences: [{ text: 'The QMS processes are defined.', sources: [] }],
    },
  ],
};

function mockS3ContentStream(content: unknown) {
  return {
    Body: {
      transformToString: vi.fn().mockResolvedValue(JSON.stringify(content)),
    },
  };
}

const FAKE_EMBEDDING = new Array(1024).fill(0.01);

/**
 * Wire the C-2 RDS transaction pattern:
 * call 0: BeginTransactionCommand → {transactionId}
 * call 1: ExecuteStatementCommand (set_config) → {}
 * call 2: ExecuteStatementCommand (SELECT content_ref) → records
 * call 3: CommitTransactionCommand → {}
 */
function wireRdsHappyPath(contentRef: string = CONTENT_REF) {
  mockRdsSend
    .mockResolvedValueOnce({ transactionId: 'txn-test' }) // Begin
    .mockResolvedValueOnce({}) // set_config
    .mockResolvedValueOnce({ // SELECT content_ref
      records: [[{ stringValue: contentRef }]],
      columnMetadata: [{ name: 'content_ref' }],
    })
    .mockResolvedValueOnce({}); // Commit
}

function wireRdsNoResult() {
  mockRdsSend
    .mockResolvedValueOnce({ transactionId: 'txn-test' }) // Begin
    .mockResolvedValueOnce({}) // set_config
    .mockResolvedValueOnce({ records: [], columnMetadata: [] }) // SELECT: empty
    .mockResolvedValueOnce({}); // Commit
}

beforeEach(() => {
  mockRdsSend.mockReset();
  mockS3Send.mockReset();
  mockEmbedFn.mockReset();
  mockAossFetch.mockReset();

  // Default: S3 returns document content
  mockS3Send.mockResolvedValue(mockS3ContentStream(DOCUMENT_CONTENT));

  // Default: embed returns 1024-dim vector
  mockEmbedFn.mockResolvedValue({ embedding: FAKE_EMBEDDING, tokenCount: 10, credits: 1 });

  // Default: AOSS write succeeds
  mockAossFetch.mockResolvedValue({ status: 201, body: '{"result":"created"}' });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Tenant-docs indexer (B3)', () => {
  it('indexes only prose sections: C-2 txn → S3 → embeds → POST /_doc (auto-ID)', async () => {
    wireRdsHappyPath();
    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    // RDS: C-2 pattern (Begin + set_config + SELECT + Commit = 4 calls)
    expect(mockRdsSend).toHaveBeenCalledTimes(4);
    const setConfigCmd = mockRdsSend.mock.calls[1][0] as { input: { sql: string } };
    expect(setConfigCmd.input.sql).toContain('set_config');
    const selectCmd = mockRdsSend.mock.calls[2][0] as { input: { sql: string } };
    expect(selectCmd.input.sql).toContain('content_ref');
    expect(selectCmd.input.sql).toContain(':versionId::uuid');

    // S3 called for content
    expect(mockS3Send).toHaveBeenCalledOnce();
    const s3Cmd = mockS3Send.mock.calls[0][0] as { input: { Bucket: string; Key: string } };
    expect(s3Cmd.input.Key).toBe(CONTENT_REF);
    expect(s3Cmd.input.Bucket).toBe('mock-general-bucket');

    // Embed called for 2 prose sections (gap section skipped)
    expect(mockEmbedFn).toHaveBeenCalledTimes(2);
    const firstEmbed = mockEmbedFn.mock.calls[0][0];
    expect(firstEmbed.tenantId).toBe('tenant-aaa');
    expect(firstEmbed.agent).toBe('TenantDocsIndexer');
    expect(firstEmbed.systemOp).toBe(true);
    expect(firstEmbed.text).toContain('The organization determines external issues.');
    expect(firstEmbed.text).toContain('Internal issues are monitored.');

    // AOSS: POST /_doc (auto-ID, no client _id)
    expect(mockAossFetch).toHaveBeenCalledTimes(2);
    const [method, endpoint, path, body] = mockAossFetch.mock.calls[0];
    expect(method).toBe('POST');
    expect(endpoint).toBe('https://mock.us-east-1.aoss.amazonaws.com');
    expect(path).toBe('/cumplify-tenant-docs/_doc');
    const parsed = JSON.parse(body);
    expect(parsed.embedding).toEqual(FAKE_EMBEDDING);
    expect(parsed.metadata.tenantId).toBe('tenant-aaa');
    expect(parsed.metadata.documentId).toBe('doc-1');
    expect(parsed.metadata.versionId).toBe('v1');
    expect(parsed.metadata.clauseRef).toBe('4.1');
    expect(parsed.metadata.standard).toBe('ISO9001');
  });

  it('skips gracefully when versionId is missing from payload', async () => {
    await processDocumentPublished(makeEvent({ documentId: 'doc-1' }));

    expect(mockRdsSend).not.toHaveBeenCalled();
    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockEmbedFn).not.toHaveBeenCalled();
    expect(mockAossFetch).not.toHaveBeenCalled();
  });

  it('skips gracefully when documentId is missing from payload', async () => {
    await processDocumentPublished(makeEvent({ versionId: 'v1' }));

    expect(mockRdsSend).not.toHaveBeenCalled();
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('skips when no content_ref found (version not in RDS)', async () => {
    wireRdsNoResult();
    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockEmbedFn).not.toHaveBeenCalled();
  });

  it('skips when document has no prose sections', async () => {
    wireRdsHappyPath();
    mockS3Send.mockResolvedValue(
      mockS3ContentStream({
        schemaVersion: 1,
        sections: [{ harmonizationKey: '4.1', kind: 'gap', sentences: [] }],
      }),
    );

    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    expect(mockEmbedFn).not.toHaveBeenCalled();
    expect(mockAossFetch).not.toHaveBeenCalled();
  });

  it('POST path is /cumplify-tenant-docs/_doc for all sections (auto-ID)', async () => {
    wireRdsHappyPath();
    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    for (const call of mockAossFetch.mock.calls) {
      expect(call[2]).toBe('/cumplify-tenant-docs/_doc');
      expect(call[0]).toBe('POST');
    }
  });

  it('retries on 503 from AOSS (cold-start backoff)', async () => {
    wireRdsHappyPath();
    mockAossFetch
      .mockResolvedValueOnce({ status: 503, body: 'Service Unavailable' })
      .mockResolvedValueOnce({ status: 201, body: '{"result":"created"}' })
      .mockResolvedValue({ status: 201, body: '{"result":"created"}' });

    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    // First section: 503 then 201 = 2 calls; second section: 201 = 1 call → total 3
    expect(mockAossFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 403 and 404 from AOSS (house write-path rule)', async () => {
    wireRdsHappyPath();
    mockS3Send.mockResolvedValue(
      mockS3ContentStream({
        schemaVersion: 1,
        sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [{ text: 'Test.' }] }],
      }),
    );
    mockAossFetch
      .mockResolvedValueOnce({ status: 403, body: 'Forbidden' })
      .mockResolvedValueOnce({ status: 404, body: 'Not Found' })
      .mockResolvedValueOnce({ status: 201, body: '{"result":"created"}' });

    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    expect(mockAossFetch).toHaveBeenCalledTimes(3);
  });
});
