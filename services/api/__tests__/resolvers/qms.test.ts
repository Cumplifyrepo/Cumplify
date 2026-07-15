/**
 * QMS Document Engine resolver tests (spec 40, Task 3).
 * Hermetic: SQL/param-asserting per resolver, real 011 column names,
 * ::uuid casts pinned, zod rejection cases, SCHEMA-5.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockCommit, mockRollback, mockPublishAuditEvent } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockPublishAuditEvent: vi.fn(),
}));

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
    publishAuditEvent: mockPublishAuditEvent,
  };
});

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

import { handler } from '../../src/resolvers/qms.js';

const EMPTY_RESULT = { records: [], columnMetadata: [] };

function makeEvent(fieldName: string, args: Record<string, unknown> = {}) {
  return {
    info: { fieldName },
    arguments: args,
    identity: { resolverContext: { tenantId: 'tenant-test', sub: 'user-test', role: 'QualityManager' } },
  };
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue(EMPTY_RESULT);
  mockCommit.mockReset();
  mockRollback.mockReset();
  mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');
});

// ─── getOrgProfile ───────────────────────────────────────────────────────────

describe('getOrgProfile', () => {
  it('queries org_profiles joined to org_profile_versions with real 011 column names', async () => {
    await handler(makeEvent('getOrgProfile'));
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain('qms.org_profiles');
    expect(sql).toContain('qms.org_profile_versions');
    expect(sql).toContain('p.current_version');
    expect(sql).toContain('pv.payload');
    expect(sql).toContain('p.updated_at');
    expect(sql).toContain('pv.version_no');
  });
});

// ─── listClauseRegistry ──────────────────────────────────────────────────────

describe('listClauseRegistry', () => {
  it('queries qms.clause_registry with real 011 column names', async () => {
    await handler(makeEvent('listClauseRegistry'));
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain('qms.clause_registry');
    expect(sql).toContain('clause_no');
    expect(sql).toContain('clause_title');
    expect(sql).toContain('intent_paraphrase');
    expect(sql).toContain('annex_sl_mode');
    expect(sql).toContain('harmonization_key');
    expect(sql).toContain('required_sources');
    expect(sql).toContain('sort_order');
  });

  it('filters by standard when provided', async () => {
    await handler(makeEvent('listClauseRegistry', { standard: 'ISO14001' }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('WHERE standard = :standard');
    expect(params).toContainEqual({ name: 'standard', value: { stringValue: 'ISO14001' } });
  });
});

// ─── saveOrgProfile (versioned write) ─────────────────────────────────────────

describe('saveOrgProfile', () => {
  it('versioned write: UPSERT profile + INSERT version row + bump current_version in ONE txn', async () => {
    // Call 1: UPSERT org_profiles
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'profile-1' }, { longValue: 2 }]],
      columnMetadata: [{ name: 'id' }, { name: 'current_version' }],
    });
    // Call 2: INSERT version row
    mockExecute.mockResolvedValueOnce(EMPTY_RESULT);
    // Call 3: UPDATE current_version
    mockExecute.mockResolvedValueOnce(EMPTY_RESULT);

    const payload = JSON.stringify({ standardsInScope: ['ISO9001', 'ISO14001'], orgName: 'Acme' });
    await handler(makeEvent('saveOrgProfile', { input: { payload } }));

    // UPSERT profile
    const [upsertSql] = mockExecute.mock.calls[0];
    expect(upsertSql).toContain('INSERT INTO qms.org_profiles');
    expect(upsertSql).toContain('ON CONFLICT (tenant_id)');
    expect(upsertSql).toContain('RETURNING id, current_version');

    // INSERT version row with ::uuid and ::jsonb casts
    const [versionSql, versionParams] = mockExecute.mock.calls[1];
    expect(versionSql).toContain('INSERT INTO qms.org_profile_versions');
    expect(versionSql).toContain(':profileId::uuid');
    expect(versionSql).toContain(':payload::jsonb');
    expect(versionParams).toContainEqual({ name: 'versionNo', value: { longValue: 3 } }); // 2+1

    // Bump current_version with ::uuid cast
    const [bumpSql] = mockExecute.mock.calls[2];
    expect(bumpSql).toContain('UPDATE qms.org_profiles');
    expect(bumpSql).toContain('current_version = :newVersion');
    expect(bumpSql).toContain('WHERE id = :id::uuid');

    // All in one txn — commit called
    expect(mockCommit).toHaveBeenCalled();
    // Audit event published
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      detailType: 'Context.Updated',
    }));
  });

  it('rejects invalid payload: missing standardsInScope', async () => {
    const payload = JSON.stringify({ orgName: 'Acme' });
    await expect(
      handler(makeEvent('saveOrgProfile', { input: { payload } })),
    ).rejects.toThrow('INVALID_PAYLOAD');
  });

  it('rejects invalid payload: empty standardsInScope', async () => {
    const payload = JSON.stringify({ standardsInScope: [] });
    await expect(
      handler(makeEvent('saveOrgProfile', { input: { payload } })),
    ).rejects.toThrow('INVALID_PAYLOAD');
  });

  it('rejects invalid payload: invalid standard value', async () => {
    const payload = JSON.stringify({ standardsInScope: ['ISO99999'] });
    await expect(
      handler(makeEvent('saveOrgProfile', { input: { payload } })),
    ).rejects.toThrow('INVALID_PAYLOAD');
  });
});

// ─── setClauseApplicability ──────────────────────────────────────────────────

describe('setClauseApplicability', () => {
  it('EXCLUSION_REQUIRES_JUSTIFICATION when applicable=false and no justification', async () => {
    await expect(
      handler(makeEvent('setClauseApplicability', {
        input: { clauseRegistryId: 'c-1', applicable: false, justification: '' },
      })),
    ).rejects.toThrow('EXCLUSION_REQUIRES_JUSTIFICATION');

    // No DB call made
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('upserts with ON CONFLICT (tenant_id, clause_registry_id) and ::uuid cast', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'ca-1' }, { stringValue: 'c-1' }, { booleanValue: false }, { stringValue: 'Not relevant' }]],
      columnMetadata: [{ name: 'id' }, { name: 'clause_registry_id' }, { name: 'applicable' }, { name: 'justification' }],
    });

    await handler(makeEvent('setClauseApplicability', {
      input: { clauseRegistryId: 'c-1', applicable: false, justification: 'Not relevant to our scope' },
    }));

    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO qms.clause_applicability');
    expect(sql).toContain(':clauseId::uuid');
    expect(sql).toContain('ON CONFLICT (tenant_id, clause_registry_id)');
    expect(sql).toContain('RETURNING id, clause_registry_id, applicable, justification');
    expect(params).toContainEqual({ name: 'applicable', value: { booleanValue: false } });
    expect(params).toContainEqual({ name: 'justification', value: { stringValue: 'Not relevant to our scope' } });

    // Audit event
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      detailType: 'Scope.Changed',
    }));
  });

  it('allows applicable=true without justification', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'ca-1' }, { stringValue: 'c-1' }, { booleanValue: true }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'clause_registry_id' }, { name: 'applicable' }, { name: 'justification' }],
    });

    await handler(makeEvent('setClauseApplicability', {
      input: { clauseRegistryId: 'c-1', applicable: true },
    }));

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContainEqual({ name: 'applicable', value: { booleanValue: true } });
    expect(params).toContainEqual({ name: 'justification', value: { isNull: true } });
  });
});

// ─── getGenerationRun ─────────────────────────────────────────────────────────

describe('getGenerationRun', () => {
  it('queries generation_runs + generation_sections with ::uuid casts and real 011 columns', async () => {
    // Run query
    mockExecute.mockResolvedValueOnce(EMPTY_RESULT);
    // Sections query
    mockExecute.mockResolvedValueOnce(EMPTY_RESULT);

    await handler(makeEvent('getGenerationRun', { id: 'run-1' }));

    const [runSql] = mockExecute.mock.calls[0];
    expect(runSql).toContain('qms.generation_runs');
    expect(runSql).toContain(':id::uuid');
    expect(runSql).toContain('status');
    expect(runSql).toContain('standards');
    expect(runSql).toContain('manual_document_id');
    expect(runSql).toContain('started_at');
    expect(runSql).toContain('finished_at');

    const [secSql] = mockExecute.mock.calls[1];
    expect(secSql).toContain('qms.generation_sections');
    expect(secSql).toContain(':runId::uuid');
    expect(secSql).toContain('harmonization_key');
    expect(secSql).toContain('clause_registry_ids');
    expect(secSql).toContain('content_sha256');
    expect(secSql).toContain('reviewed_by');
    expect(secSql).toContain('reviewed_at');
  });
});

// ─── SCHEMA-5 ─────────────────────────────────────────────────────────────────

describe('SCHEMA-5: tenantId from resolverContext only', () => {
  it('saveOrgProfile uses resolverContext tenantId, not input', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'p-1' }, { longValue: 0 }]],
      columnMetadata: [{ name: 'id' }, { name: 'current_version' }],
    });
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler({
      info: { fieldName: 'saveOrgProfile' },
      arguments: { input: { payload: JSON.stringify({ standardsInScope: ['ISO9001'] }), tenantId: 'evil' } },
      identity: { resolverContext: { tenantId: 'tenant-test', sub: 'user-test' } },
    });

    const [, params] = mockExecute.mock.calls[0];
    expect(params).toContainEqual({ name: 'tenantId', value: { stringValue: 'tenant-test' } });
    expect(params).not.toContainEqual(expect.objectContaining({ value: { stringValue: 'evil' } }));
  });
});
