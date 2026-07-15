/**
 * getDocumentVersionDiff hermetic tests (spec 40, Task 7).
 * S3 loads mocked; tests cover section alignment by harmonizationKey + sentence LCS.
 * Closes the standing frontend-app BLOCKED diff item.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockCommit, mockRollback, mockS3Send } = vi.hoisted(() => {
  process.env.CONTENT_BUCKET = 'test-bucket';
  return {
    mockExecute: vi.fn(),
    mockCommit: vi.fn(),
    mockRollback: vi.fn(),
    mockS3Send: vi.fn(),
  };
});

vi.mock('../../src/resolvers/shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/resolvers/shared.js')>();
  return {
    ...actual,
    beginTenantTransaction: vi.fn().mockResolvedValue({
      transactionId: 'txn-test',
      execute: mockExecute,
      commit: mockCommit,
      rollback: mockRollback,
    }),
    publishAuditEvent: vi.fn().mockResolvedValue('evt-test'),
  };
});

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { handler } from '../../src/resolvers/m1.js';

function makeEvent(fieldName: string, args: Record<string, unknown> = {}) {
  return {
    info: { fieldName },
    arguments: args,
    identity: { resolverContext: { tenantId: 'tenant-test', sub: 'user-test', role: 'QualityManager' } },
  };
}

function mockS3Content(content: Record<string, unknown>) {
  return { Body: { transformToString: () => Promise.resolve(JSON.stringify(content)) } };
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue({ records: [], columnMetadata: [] });
  mockCommit.mockReset();
  mockRollback.mockReset();
  mockS3Send.mockReset();
});

describe('getDocumentVersionDiff', () => {
  it('fetches content_ref from both versions with ::uuid casts', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'key/v1.json' }, { stringValue: 'key/v2.json' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    mockS3Send.mockResolvedValue(mockS3Content({ sections: [] }));

    await handler(makeEvent('getDocumentVersionDiff', { v1: 'ver-1', v2: 'ver-2' }));

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain('m1.document_versions');
    expect(sql).toContain(':v1::uuid');
    expect(sql).toContain(':v2::uuid');
    expect(sql).toContain('content_ref');
  });

  it('identical content → 0 additions, 0 deletions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const content = { sections: [{ harmonizationKey: '4.1', sentences: ['The org maintains context.'] }] };
    mockS3Send.mockResolvedValue(mockS3Content(content));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('added section → counts all sentences as additions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '4.1', sentences: ['A'] }] };
    const v2 = { sections: [{ harmonizationKey: '4.1', sentences: ['A'] }, { harmonizationKey: '6.1', sentences: ['B', 'C'] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
  });

  it('removed section → counts all sentences as deletions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '4.1', sentences: ['A'] }, { harmonizationKey: '6.1', sentences: ['B', 'C'] }] };
    const v2 = { sections: [{ harmonizationKey: '4.1', sentences: ['A'] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(2);
  });

  it('changed sentences within same section → LCS-based additions and deletions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '4.1', sentences: ['Keep this.', 'Remove this.', 'Keep too.'] }] };
    const v2 = { sections: [{ harmonizationKey: '4.1', sentences: ['Keep this.', 'Added new.', 'Keep too.'] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(1); // "Added new."
    expect(result.deletions).toBe(1); // "Remove this."
  });

  it('aligns sections by harmonizationKey (forked: key#standard convention)', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [
      { harmonizationKey: '6.1', sentences: ['Shared.'] },
      { harmonizationKey: '6.1.2#ISO14001', sentences: ['Env aspect.'] },
    ] };
    const v2 = { sections: [
      { harmonizationKey: '6.1', sentences: ['Shared updated.'] },
      { harmonizationKey: '6.1.2#ISO14001', sentences: ['Env aspect.'] },
    ] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    // 6.1 changed (1 add + 1 del); 6.1.2#ISO14001 unchanged
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    const content = JSON.parse(result.content as string);
    expect(content['6.1']).toBeDefined();
    expect(content['6.1.2#ISO14001']).toBeUndefined(); // No diff for unchanged
  });
});
