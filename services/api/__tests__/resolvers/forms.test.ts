/**
 * QMS Forms resolver hermetic tests (spec 41, Task 3).
 *
 * Mocks shared.js at the transaction boundary. Asserts:
 * - SQL statements reference REAL column names from migration 012.
 * - FormCompletion is SERVER-COMPUTED via SQL COUNT join (never client).
 * - saveFormRecordValues dispatches to correct typed value column per field_type.
 * - Immutability guard: complete/approved status rejects writes (negative test).
 * - SCHEMA-5: tenantId injected from resolverContext, never input.
 * - listFormRecords closes the BLOCKED listRecords item from frontend-app Task 29.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockCommit, mockRollback } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
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
    publishAuditEvent: vi.fn().mockResolvedValue('evt-test'),
  };
});

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

import { handler } from '../../src/resolvers/forms.js';

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
});

// ─── listFormTemplates ────────────────────────────────────────────────────────

describe('listFormTemplates', () => {
  it('queries forms.templates with real column names from migration 012', async () => {
    await handler(makeEvent('listFormTemplates'));
    const [sql] = mockExecute.mock.calls[0];
    // Real columns from 012_qms_forms.sql
    expect(sql).toContain('forms.templates');
    expect(sql).toContain('t.key');
    expect(sql).toContain('t.title_key');
    expect(sql).toContain('t.description_key');
    expect(sql).toContain('t.category');
    expect(sql).toContain('t.clause_refs');
    expect(sql).toContain('t.standards');
    expect(sql).toContain('t.requires_approval');
  });

  it('BC-1: sectionCount and fieldCount are COUNTs over rows, not literals', async () => {
    await handler(makeEvent('listFormTemplates'));
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain('SELECT COUNT(*)');
    expect(sql).toContain('forms.template_sections');
    expect(sql).toContain('forms.template_fields');
    // Must not contain any hardcoded count value
    expect(sql).not.toMatch(/section_count\s*=\s*\d/);
    expect(sql).not.toMatch(/field_count\s*=\s*\d/);
  });
});

// ─── getFormTemplate ──────────────────────────────────────────────────────────

describe('getFormTemplate', () => {
  it('queries template, sections, and fields with real column names', async () => {
    await handler(makeEvent('getFormTemplate', { id: 'tpl-1' }));
    // Three execute calls: template, sections, fields
    expect(mockExecute).toHaveBeenCalledTimes(3);

    const [tplSql] = mockExecute.mock.calls[0];
    expect(tplSql).toContain('forms.templates');

    const [secSql] = mockExecute.mock.calls[1];
    expect(secSql).toContain('forms.template_sections');
    expect(secSql).toContain('section_key');
    expect(secSql).toContain('title_key');
    expect(secSql).toContain('sort_order');

    const [fieldSql] = mockExecute.mock.calls[2];
    expect(fieldSql).toContain('forms.template_fields');
    expect(fieldSql).toContain('field_key');
    expect(fieldSql).toContain('label_key');
    expect(fieldSql).toContain('field_type');
    expect(fieldSql).toContain('required');
    expect(fieldSql).toContain('options');
    expect(fieldSql).toContain('relation_target');
    expect(fieldSql).toContain('validation');
  });
});

// ─── createFormRecord ─────────────────────────────────────────────────────────

describe('createFormRecord', () => {
  it('inserts into forms.records with real column names from 012', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[
        { stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'draft' },
        { stringValue: 'user-test' }, { isNull: true }, { isNull: true },
        { stringValue: '2026-07-14T00:00:00Z' }, { stringValue: '2026-07-14T00:00:00Z' },
      ]],
      columnMetadata: [
        { name: 'id' }, { name: 'template_id' }, { name: 'status' },
        { name: 'opened_by' }, { name: 'completed_by' }, { name: 'm2_nc_id' },
        { name: 'created_at' }, { name: 'updated_at' },
      ],
    });

    const result = await handler(makeEvent('createFormRecord', { templateId: 'tpl-1' }));
    const [sql, params] = mockExecute.mock.calls[0];

    expect(sql).toContain('INSERT INTO forms.records');
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('template_id');
    expect(sql).toContain('opened_by');
    expect(sql).toContain("'draft'");
    // SCHEMA-5: tenantId from resolverContext
    expect(params).toContainEqual({ name: 'tenantId', value: { stringValue: 'tenant-test' } });
    expect(params).toContainEqual({ name: 'actor', value: { stringValue: 'user-test' } });
    expect(result).toHaveProperty('id', 'rec-1');
  });
});

// ─── listFormRecords (closes BLOCKED listRecords — frontend-app Task 29) ─────

describe('listFormRecords', () => {
  it('queries forms.records filtered by template_id with real column names', async () => {
    // First call: list records. Then completion calls for each (empty result = no records).
    await handler(makeEvent('listFormRecords', { templateId: 'tpl-1' }));
    const [sql, params] = mockExecute.mock.calls[0];

    expect(sql).toContain('FROM forms.records');
    expect(sql).toContain('template_id');
    expect(sql).toContain('status');
    expect(sql).toContain('opened_by');
    expect(sql).toContain('completed_by');
    expect(sql).toContain('m2_nc_id');
    expect(sql).toContain('created_at');
    expect(sql).toContain('updated_at');
    expect(params).toContainEqual({ name: 'templateId', value: { stringValue: 'tpl-1' } });
  });

  it('applies optional status filter', async () => {
    await handler(makeEvent('listFormRecords', { templateId: 'tpl-1', status: 'DRAFT' }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('AND r.status = :status');
    expect(params).toContainEqual({ name: 'status', value: { stringValue: 'draft' } });
  });
});

// ─── getFormRecord + FormCompletion ───────────────────────────────────────────

describe('getFormRecord + server-computed FormCompletion', () => {
  beforeEach(() => {
    // Call 1: record row
    mockExecute.mockResolvedValueOnce({
      records: [[
        { stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'in_progress' },
        { stringValue: 'user-test' }, { isNull: true }, { isNull: true },
        { stringValue: '2026-07-14T00:00:00Z' }, { stringValue: '2026-07-14T00:00:00Z' },
      ]],
      columnMetadata: [
        { name: 'id' }, { name: 'template_id' }, { name: 'status' },
        { name: 'opened_by' }, { name: 'completed_by' }, { name: 'm2_nc_id' },
        { name: 'created_at' }, { name: 'updated_at' },
      ],
    });
    // Call 2: values
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'ncr_number' }, { stringValue: 'NCR-001' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }]],
      columnMetadata: [
        { name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' },
        { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' },
      ],
    });
    // Call 3: totals (template fields for completion)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'ncr_number' }, { booleanValue: true }],
        [{ stringValue: 'date_raised' }, { booleanValue: true }],
        [{ stringValue: 'department' }, { booleanValue: false }],
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'required' }],
    });
    // Call 4: filled fields for completion
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'ncr_number' }]],
      columnMetadata: [{ name: 'field_key' }],
    });
  });

  it('computes FormCompletion server-side via SQL JOINs on record_values + template_fields', async () => {
    const result = await handler(makeEvent('getFormRecord', { id: 'rec-1' })) as Record<string, unknown>;

    // Completion query hits forms.template_fields joined to template_sections
    const totalsSql = mockExecute.mock.calls[2][0] as string;
    expect(totalsSql).toContain('forms.template_fields');
    expect(totalsSql).toContain('forms.template_sections');
    expect(totalsSql).toContain('field_key');
    expect(totalsSql).toContain('required');

    // Filled query hits forms.record_values joined to template_fields
    const filledSql = mockExecute.mock.calls[3][0] as string;
    expect(filledSql).toContain('forms.record_values');
    expect(filledSql).toContain('forms.template_fields');

    // Result has server-computed completion
    const completion = result.completion as Record<string, unknown>;
    expect(completion.fieldsFilled).toBe(1);
    expect(completion.fieldsTotal).toBe(3);
    expect(completion.requiredMissing).toEqual(['date_raised']);
  });
});

// ─── saveFormRecordValues ─────────────────────────────────────────────────────

describe('saveFormRecordValues — typed dispatch', () => {
  beforeEach(() => {
    // Call 1: status check → in_progress
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    // Call 2: field metadata
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'field-text-id' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }],
        [{ stringValue: 'field-num-id' }, { stringValue: 'quantity_affected' }, { stringValue: 'number' }],
        [{ stringValue: 'field-date-id' }, { stringValue: 'date_raised' }, { stringValue: 'date' }],
        [{ stringValue: 'field-bool-id' }, { stringValue: 'containment_flag' }, { stringValue: 'checkbox' }],
        [{ stringValue: 'field-uuid-id' }, { stringValue: 'clause_ref' }, { stringValue: 'relation' }],
        [{ stringValue: 'field-json-id' }, { stringValue: 'standards_reviewed' }, { stringValue: 'multiselect' }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }],
    });
  });

  it('dispatches text field to value_text column', async () => {
    // Remaining calls: upsert + timestamp update + return-record calls
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'NCR-001' }) },
    })).catch(() => { /* getFormRecordById will fail on empty — we only care about the upsert SQL */ });

    // Find the upsert call (3rd call: after status check + field metadata)
    const upsertCall = mockExecute.mock.calls[2];
    const [sql] = upsertCall;
    expect(sql).toContain('INSERT INTO forms.record_values');
    expect(sql).toContain('value_text');
    expect(sql).toContain('ON CONFLICT (record_id, field_id)');
    // Other columns nulled
    expect(sql).toContain('value_number = NULL');
    expect(sql).toContain('value_date = NULL');
    expect(sql).toContain('value_bool = NULL');
    expect(sql).toContain('value_uuid = NULL');
    expect(sql).toContain('value_json = NULL');
  });

  it('dispatches number field to value_number column', async () => {
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ quantity_affected: 42 }) },
    })).catch(() => {});

    const upsertCall = mockExecute.mock.calls[2];
    const [sql] = upsertCall;
    expect(sql).toContain('value_number');
    expect(sql).toContain('value_text = NULL');
  });

  it('dispatches checkbox field to value_bool column', async () => {
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ containment_flag: true }) },
    })).catch(() => {});

    const upsertCall = mockExecute.mock.calls[2];
    const [sql] = upsertCall;
    expect(sql).toContain('value_bool');
    expect(sql).toContain('value_text = NULL');
  });

  it('dispatches relation field to value_uuid column', async () => {
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ clause_ref: 'a1b2c3d4-0000-4000-8000-000000000001' }) },
    })).catch(() => {});

    const upsertCall = mockExecute.mock.calls[2];
    const [sql] = upsertCall;
    expect(sql).toContain('value_uuid');
    expect(sql).toContain('value_text = NULL');
  });

  it('dispatches multiselect field to value_json column', async () => {
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ standards_reviewed: ['ISO9001', 'ISO14001'] }) },
    })).catch(() => {});

    const upsertCall = mockExecute.mock.calls[2];
    const [sql] = upsertCall;
    expect(sql).toContain('value_json');
    expect(sql).toContain('value_text = NULL');
  });
});

describe('saveFormRecordValues — immutability guard', () => {
  it('rejects writes on complete status with RECORD_IMMUTABLE error', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'complete' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });

    await expect(
      handler(makeEvent('saveFormRecordValues', {
        input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'X' }) },
      })),
    ).rejects.toThrow('RECORD_IMMUTABLE');

    // Only one execute call (the status check) — no upsert attempted
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockRollback).toHaveBeenCalled();
  });

  it('rejects writes on approved status with RECORD_IMMUTABLE error', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'approved' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });

    await expect(
      handler(makeEvent('saveFormRecordValues', {
        input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'X' }) },
      })),
    ).rejects.toThrow('RECORD_IMMUTABLE');

    expect(mockRollback).toHaveBeenCalled();
  });

  it('allows writes on draft status (transitions to in_progress)', async () => {
    mockExecute.mockReset();
    // Call 1: status check → draft
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'draft' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    // Call 2: status update
    mockExecute.mockResolvedValueOnce(EMPTY_RESULT);
    // Call 3: field metadata
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'f-1' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }],
    });
    // Remaining calls (upsert + timestamp + getFormRecordById calls)
    mockExecute.mockResolvedValue(EMPTY_RESULT);

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'NCR-001' }) },
    })).catch(() => {});

    // status update SQL transitions to in_progress (call index 1)
    const statusUpdateSql = mockExecute.mock.calls[1][0] as string;
    expect(statusUpdateSql).toContain("status = 'in_progress'");
  });
});

// ─── SCHEMA-5 ─────────────────────────────────────────────────────────────────

describe('SCHEMA-5: tenantId injection', () => {
  it('createFormRecord passes tenantId from resolverContext, not from arguments', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[
        { stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'draft' },
        { stringValue: 'user-test' }, { isNull: true }, { isNull: true },
        { stringValue: '2026-07-14T00:00:00Z' }, { stringValue: '2026-07-14T00:00:00Z' },
      ]],
      columnMetadata: [
        { name: 'id' }, { name: 'template_id' }, { name: 'status' },
        { name: 'opened_by' }, { name: 'completed_by' }, { name: 'm2_nc_id' },
        { name: 'created_at' }, { name: 'updated_at' },
      ],
    });

    // Even if client passes a tenantId in args, it's ignored
    await handler({
      info: { fieldName: 'createFormRecord' },
      arguments: { templateId: 'tpl-1', tenantId: 'evil-tenant' },
      identity: { resolverContext: { tenantId: 'tenant-test', sub: 'user-test' } },
    });

    const [, params] = mockExecute.mock.calls[0];
    // Only the resolverContext tenantId is used
    expect(params).toContainEqual({ name: 'tenantId', value: { stringValue: 'tenant-test' } });
    expect(params).not.toContainEqual(expect.objectContaining({ value: { stringValue: 'evil-tenant' } }));
  });
});
