/**
 * getDocumentVersionDiff hermetic tests (spec 40, Task 7 fix round).
 * S3 loads mocked. Sentences use REAL production shape: {text, factRefs}.
 * Covers: section alignment by harmonizationKey, sentence LCS on .text,
 * non-prose kind transitions, CONTENT_UNAVAILABLE, VERSION_MISMATCH.
 *
 * Subscription auth denial rides the loop-level C-6 VTL assertion (schema-guard
 * test 3 + the 84-count resolver test pin the subscriptionFields loop pattern).
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
  S3Client: class { send = mockS3Send; },
  GetObjectCommand: class { constructor(public input: unknown) {} },
  CopyObjectCommand: class { constructor(public input: unknown) {} },
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

// Production sentence shape: {text, factRefs}
function sent(text: string, factRefs: string[] = []): { text: string; factRefs: string[] } {
  return { text, factRefs };
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue({ records: [], columnMetadata: [] });
  mockCommit.mockReset();
  mockRollback.mockReset();
  mockS3Send.mockReset();
});

describe('getDocumentVersionDiff', () => {
  it('SQL uses ::uuid casts + document_id match', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'key/v1.json' }, { stringValue: 'key/v2.json' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    mockS3Send.mockResolvedValue(mockS3Content({ sections: [] }));

    await handler(makeEvent('getDocumentVersionDiff', { v1: 'ver-1', v2: 'ver-2' })).catch(() => {});

    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain(':v1::uuid');
    expect(sql).toContain(':v2::uuid');
    expect(sql).toContain('v1.document_id = v2.document_id');
    expect(sql).toContain('content_ref');
  });

  it('VERSION_MISMATCH when versions belong to different documents (no row)', async () => {
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }] });

    await expect(
      handler(makeEvent('getDocumentVersionDiff', { v1: 'v-a', v2: 'v-b' })),
    ).rejects.toThrow('VERSION_MISMATCH');
  });

  it('CONTENT_UNAVAILABLE when content_ref is empty (agent-writeback docs)', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: '' }, { stringValue: 'key/v2.json' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });

    await expect(
      handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })),
    ).rejects.toThrow('CONTENT_UNAVAILABLE');
  });

  it('identical content (real {text, factRefs} shape) → 0 additions, 0 deletions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const content = { sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [sent('The organization maintains context.', ['F1'])] }] };
    mockS3Send.mockResolvedValue(mockS3Content(content));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('added section → counts sentences as additions', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [sent('A', ['F1'])] }] };
    const v2 = { sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [sent('A', ['F1'])] }, { harmonizationKey: '6.1', kind: 'prose', sentences: [sent('B', ['F2']), sent('C', ['F3'])] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
  });

  it('changed sentences (LCS on .text not object reference) → correct add/del', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [sent('Keep.', ['F1']), sent('Remove.', ['F2']), sent('Also keep.', ['F3'])] }] };
    const v2 = { sections: [{ harmonizationKey: '4.1', kind: 'prose', sentences: [sent('Keep.', ['F1']), sent('Added.', ['F4']), sent('Also keep.', ['F3'])] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
  });

  it('non-prose kind transition (gap→prose) shows in diff', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [{ harmonizationKey: '6.1.2#ISO14001', kind: 'gap', sentences: [] }] };
    const v2 = { sections: [{ harmonizationKey: '6.1.2#ISO14001', kind: 'prose', sentences: [sent('Aspects identified.', ['F1']), sent('Impacts assessed.', ['F2'])] }] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    // gap→prose: 1 deletion (the gap kind) + 2 additions (new sentences)
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
    const content = JSON.parse(result.content as string);
    expect(content['6.1.2#ISO14001'].kindChange).toBe('gap→prose');
  });

  it('harmonizationKey#standard convention: forked sections align correctly', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'k1' }, { stringValue: 'k2' }]],
      columnMetadata: [{ name: 'v1_ref' }, { name: 'v2_ref' }],
    });
    const v1 = { sections: [
      { harmonizationKey: '6.1', kind: 'prose', sentences: [sent('Shared.', ['F1'])] },
      { harmonizationKey: '6.1.2#ISO14001', kind: 'prose', sentences: [sent('Env.', ['F2'])] },
    ] };
    const v2 = { sections: [
      { harmonizationKey: '6.1', kind: 'prose', sentences: [sent('Shared updated.', ['F1'])] },
      { harmonizationKey: '6.1.2#ISO14001', kind: 'prose', sentences: [sent('Env.', ['F2'])] },
    ] };
    mockS3Send.mockResolvedValueOnce(mockS3Content(v1)).mockResolvedValueOnce(mockS3Content(v2));

    const result = await handler(makeEvent('getDocumentVersionDiff', { v1: 'v1', v2: 'v2' })) as Record<string, unknown>;

    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    const content = JSON.parse(result.content as string);
    expect(content['6.1']).toBeDefined();
    expect(content['6.1.2#ISO14001']).toBeUndefined();
  });
});

describe('getDocumentContent (Task 11 viewer read surface)', () => {
  it('SQL selects content_ref by ::uuid-cast version id', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'tenants/t/documents/d/v1.json' }]],
      columnMetadata: [{ name: 'content_ref' }],
    });
    mockS3Send.mockResolvedValue(mockS3Content({ sections: [] }));

    await handler(makeEvent('getDocumentContent', { versionId: 'ver-1' }));

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain(':versionId::uuid');
    expect(sql).toContain('content_ref');
    expect(params[0]).toEqual({ name: 'versionId', value: { stringValue: 'ver-1' } });
  });

  it('returns the content JSON as a string (AWSJSON) loaded from the row content_ref', async () => {
    const content = {
      schemaVersion: 1,
      sections: [{ harmonizationKey: '4.4', kind: 'prose', sentences: [sent('The org maintains a QMS.', ['F1'])] }],
    };
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'tenants/t/documents/d/v1.json' }]],
      columnMetadata: [{ name: 'content_ref' }],
    });
    mockS3Send.mockResolvedValue(mockS3Content(content));

    const result = await handler(makeEvent('getDocumentContent', { versionId: 'ver-1' }));

    expect(typeof result).toBe('string');
    expect(JSON.parse(result as string)).toEqual(content);
    const s3Key = (mockS3Send.mock.calls[0][0] as { input: { Key: string } }).input.Key;
    expect(s3Key).toBe('tenants/t/documents/d/v1.json');
  });

  it('VERSION_NOT_FOUND when the id matches no row in tenant scope', async () => {
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [{ name: 'content_ref' }] });

    await expect(
      handler(makeEvent('getDocumentContent', { versionId: 'nope' })),
    ).rejects.toThrow('VERSION_NOT_FOUND');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('CONTENT_UNAVAILABLE when content_ref is empty (agent-writeback docs) — no S3 call', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: '' }]],
      columnMetadata: [{ name: 'content_ref' }],
    });

    await expect(
      handler(makeEvent('getDocumentContent', { versionId: 'ver-1' })),
    ).rejects.toThrow('CONTENT_UNAVAILABLE');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('CONTENT_UNAVAILABLE when the S3 load fails (never a silent empty)', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'tenants/t/documents/d/v1.json' }]],
      columnMetadata: [{ name: 'content_ref' }],
    });
    mockS3Send.mockRejectedValue(new Error('AccessDenied'));

    await expect(
      handler(makeEvent('getDocumentContent', { versionId: 'ver-1' })),
    ).rejects.toThrow('CONTENT_UNAVAILABLE');
  });
});
