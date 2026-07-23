/**
 * Tenant-docs indexer unit tests (B3).
 * Hermetic: mocks RDS Data API, S3, embed (one-door), AOSS signed client.
 * Validates: content_ref read, S3 fetch, prose-only chunking, embed call
 * per section, AOSS write per section, skips non-prose sections, handles
 * missing payload gracefully.
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
  ExecuteStatementCommand: class {
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

beforeEach(() => {
  mockRdsSend.mockReset();
  mockS3Send.mockReset();
  mockEmbedFn.mockReset();
  mockAossFetch.mockReset();

  // Default: RDS returns content_ref
  mockRdsSend.mockResolvedValue({
    records: [[{ stringValue: CONTENT_REF }]],
    columnMetadata: [{ name: 'content_ref' }],
  });

  // Default: S3 returns document content
  mockS3Send.mockResolvedValue(mockS3ContentStream(DOCUMENT_CONTENT));

  // Default: embed returns 1024-dim vector
  mockEmbedFn.mockResolvedValue({ embedding: FAKE_EMBEDDING, tokenCount: 10, credits: 1 });

  // Default: AOSS write succeeds
  mockAossFetch.mockResolvedValue({ status: 200, body: '{"result":"created"}' });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Tenant-docs indexer (B3)', () => {
  it('indexes only prose sections: reads content_ref → S3 → embeds → writes AOSS', async () => {
    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    // RDS called for content_ref
    expect(mockRdsSend).toHaveBeenCalledOnce();
    const rdsCmd = mockRdsSend.mock.calls[0][0] as { input: { sql: string } };
    expect(rdsCmd.input.sql).toContain('content_ref');
    expect(rdsCmd.input.sql).toContain('set_config');

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

    // AOSS write called for 2 prose sections
    expect(mockAossFetch).toHaveBeenCalledTimes(2);
    const [method, endpoint, path, body] = mockAossFetch.mock.calls[0];
    expect(method).toBe('PUT');
    expect(endpoint).toBe('https://mock.us-east-1.aoss.amazonaws.com');
    expect(path).toContain('cumplify-tenant-docs');
    expect(path).toContain('_doc');
    const parsed = JSON.parse(body);
    expect(parsed.embedding).toEqual(FAKE_EMBEDDING);
    expect(parsed.metadata.tenantId).toBe('tenant-aaa');
    expect(parsed.metadata.documentId).toBe('doc-1');
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
    mockRdsSend.mockResolvedValue({ records: [], columnMetadata: [] });

    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockEmbedFn).not.toHaveBeenCalled();
  });

  it('skips when document has no prose sections', async () => {
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

  it('AOSS doc id encodes tenantId:documentId:harmonizationKey', async () => {
    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    const path1 = mockAossFetch.mock.calls[0][2] as string;
    expect(path1).toContain(encodeURIComponent('tenant-aaa:doc-1:4.1'));

    const path2 = mockAossFetch.mock.calls[1][2] as string;
    expect(path2).toContain(encodeURIComponent('tenant-aaa:doc-1:4.4'));
  });

  it('retries on 503 from AOSS (cold-start backoff)', async () => {
    mockAossFetch
      .mockResolvedValueOnce({ status: 503, body: 'Service Unavailable' })
      .mockResolvedValueOnce({ status: 200, body: '{"result":"created"}' })
      .mockResolvedValue({ status: 200, body: '{"result":"created"}' });

    await processDocumentPublished(makeEvent({ versionId: 'v1', documentId: 'doc-1' }));

    // First section: 503 then 200 = 2 calls; second section: 200 = 1 call → total 3
    expect(mockAossFetch).toHaveBeenCalledTimes(3);
  });
});
