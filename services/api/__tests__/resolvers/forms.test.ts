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
  mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');
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
  it('inserts into forms.records with real column names from 012 and computes completion from catalog', async () => {
    // Call 1: INSERT RETURNING
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
    // Call 2: computeCompletion totals (3 fields, 2 required)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'ncr_number' }, { booleanValue: true }],
        [{ stringValue: 'severity' }, { booleanValue: true }],
        [{ stringValue: 'department' }, { booleanValue: false }],
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'required' }],
    });
    // Call 3: computeCompletion filled (empty — fresh record)
    mockExecute.mockResolvedValueOnce({
      records: [],
      columnMetadata: [{ name: 'field_key' }],
    });

    const result = await handler(makeEvent('createFormRecord', { templateId: 'tpl-1' })) as Record<string, unknown>;
    const [sql, params] = mockExecute.mock.calls[0];

    expect(sql).toContain('INSERT INTO forms.records');
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('template_id');
    expect(sql).toContain('opened_by');
    expect(sql).toContain("'draft'");
    expect(sql).toContain(':templateId::uuid');
    // SCHEMA-5: tenantId from resolverContext
    expect(params).toContainEqual({ name: 'tenantId', value: { stringValue: 'tenant-test' } });
    expect(params).toContainEqual({ name: 'actor', value: { stringValue: 'user-test' } });
    expect(result).toHaveProperty('id', 'rec-1');

    // BUG-1 fix: completion computed from catalog, not hardcoded
    const completion = result.completion as Record<string, unknown>;
    expect(completion.fieldsTotal).toBe(3);
    expect(completion.fieldsFilled).toBe(0);
    expect(completion.requiredMissing).toEqual(['ncr_number', 'severity']);
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
    // Call 1: INSERT RETURNING
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
    // Call 2+3: computeCompletion (totals + filled)
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [{ name: 'field_key' }, { name: 'required' }] });
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [{ name: 'field_key' }] });

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

// ─── UUID type casts (M3 lesson — RDS Data API stringValue→varchar mismatch) ─

describe('UUID type casts in SQL', () => {
  it('getFormTemplate casts :id::uuid in all three queries', async () => {
    await handler(makeEvent('getFormTemplate', { id: 'tpl-1' }));
    for (let i = 0; i < 3; i++) {
      const [sql] = mockExecute.mock.calls[i];
      expect(sql).toContain(':id::uuid');
    }
  });

  it('getFormRecord casts :id::uuid', async () => {
    // record row
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
    // values, totals, filled
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [{ name: 'field_key' }, { name: 'required' }] });

    await handler(makeEvent('getFormRecord', { id: 'rec-1' })).catch(() => {});
    const [recSql] = mockExecute.mock.calls[0];
    expect(recSql).toContain(':id::uuid');
  });

  it('listFormRecords casts :templateId::uuid', async () => {
    await handler(makeEvent('listFormRecords', { templateId: 'tpl-1' }));
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain(':templateId::uuid');
  });

  it('createFormRecord casts :templateId::uuid in INSERT', async () => {
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
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [{ name: 'field_key' }, { name: 'required' }] });

    await handler(makeEvent('createFormRecord', { templateId: 'tpl-1' }));
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).toContain(':templateId::uuid');
  });

  it('saveFormRecordValues casts :id::uuid in status check and :recordId::uuid/:fieldId::uuid in upsert', async () => {
    mockExecute.mockReset();
    // status check
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    // field metadata
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'f-1' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }],
    });
    // upsert + timestamp + getFormRecordById calls
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'NCR-001' }) },
    })).catch(() => {});

    // Status check has :id::uuid
    const statusSql = mockExecute.mock.calls[0][0] as string;
    expect(statusSql).toContain(':id::uuid');

    // Field metadata has :templateId::uuid
    const metaSql = mockExecute.mock.calls[1][0] as string;
    expect(metaSql).toContain(':templateId::uuid');

    // Upsert has :recordId::uuid and :fieldId::uuid
    const upsertSql = mockExecute.mock.calls[2][0] as string;
    expect(upsertSql).toContain(':recordId::uuid');
    expect(upsertSql).toContain(':fieldId::uuid');
  });

  it('saveFormRecordValues applies value casts: relation→::uuid, date→::timestamptz, json→::jsonb, number→::numeric', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'f-uuid' }, { stringValue: 'clause_ref' }, { stringValue: 'relation' }],
        [{ stringValue: 'f-date' }, { stringValue: 'date_raised' }, { stringValue: 'date' }],
        [{ stringValue: 'f-json' }, { stringValue: 'standards' }, { stringValue: 'multiselect' }],
        [{ stringValue: 'f-num' }, { stringValue: 'quantity' }, { stringValue: 'number' }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }],
    });
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({
        clause_ref: 'a1b2c3d4-0000-4000-8000-000000000001',
        date_raised: '2026-07-14T00:00:00Z',
        standards: ['ISO9001'],
        quantity: 42,
      }) },
    })).catch(() => {});

    // Find the upsert calls (starting at index 2)
    const upsertCalls = mockExecute.mock.calls.slice(2);
    const sqls = upsertCalls.map(c => c[0] as string);
    // At least one contains ::uuid for the value
    expect(sqls.some(s => s.includes(':val::uuid'))).toBe(true);
    expect(sqls.some(s => s.includes(':val::timestamptz'))).toBe(true);
    expect(sqls.some(s => s.includes(':val::jsonb'))).toBe(true);
    expect(sqls.some(s => s.includes(':val::numeric'))).toBe(true);
  });
});

// ─── Null value → DELETE (BUG-2 fix) ─────────────────────────────────────────

describe('saveFormRecordValues — null value clears field (DELETE)', () => {
  it('null value triggers DELETE FROM record_values, not an INSERT of "null"', async () => {
    mockExecute.mockReset();
    // status check
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    // field metadata
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'f-1' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }],
    });
    // DELETE + timestamp + getFormRecordById calls
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: null }) },
    })).catch(() => {});

    // The call after field metadata should be DELETE, not INSERT
    const deleteSql = mockExecute.mock.calls[2][0] as string;
    expect(deleteSql).toContain('DELETE FROM forms.record_values');
    expect(deleteSql).toContain(':recordId::uuid');
    expect(deleteSql).toContain(':fieldId::uuid');
    // Must NOT contain 'INSERT' or the literal string 'null'
    expect(deleteSql).not.toContain('INSERT');
  });
});

// ─── Task 4: Relation fields (BC-2) ──────────────────────────────────────────

describe('BC-2: relation field existence probe', () => {
  function setupRelationSave(probeResult: { records: unknown[] }) {
    mockExecute.mockReset();
    // Call 1: status check → in_progress
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    // Call 2: field metadata (includes relation_target)
    mockExecute.mockResolvedValueOnce({
      records: [[
        { stringValue: 'f-clause' }, { stringValue: 'clause_ref' },
        { stringValue: 'relation' }, { stringValue: 'clause' },
      ]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'relation_target' }],
    });
    // Call 3: existence probe result
    mockExecute.mockResolvedValueOnce(probeResult);
    // Remaining calls (upsert + timestamp + getFormRecordById)
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });
  }

  it('probes the allowlisted table with :uuid::uuid cast inside the tenant transaction', async () => {
    setupRelationSave({ records: [[{ longValue: 1 }]] }); // probe returns 1 row = exists

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ clause_ref: 'a1b2c3d4-0000-4000-8000-000000000001' }) },
    })).catch(() => {});

    // Call 3 is the probe
    const [probeSql, probeParams] = mockExecute.mock.calls[2];
    // Must reference the allowlisted table (code constant, not from data)
    expect(probeSql).toContain('qms.clause_registry');
    // Must cast the UUID param
    expect(probeSql).toContain(':uuid::uuid');
    // Param value is the UUID
    expect(probeParams).toContainEqual({ name: 'uuid', value: { stringValue: 'a1b2c3d4-0000-4000-8000-000000000001' } });
  });

  it('LINK_TARGET_NOT_FOUND when probe returns zero rows — entire save rolls back', async () => {
    setupRelationSave({ records: [] }); // probe returns 0 rows = missing

    await expect(
      handler(makeEvent('saveFormRecordValues', {
        input: { recordId: 'rec-1', values: JSON.stringify({ clause_ref: 'deadbeef-0000-4000-8000-000000000099' }) },
      })),
    ).rejects.toThrow('LINK_TARGET_NOT_FOUND');

    // Rollback called — no partial writes survive
    expect(mockRollback).toHaveBeenCalled();
    // No upsert was attempted after the probe (probe is call 3, no call 4 upsert)
    const callsAfterProbe = mockExecute.mock.calls.slice(3);
    const upsertCalls = callsAfterProbe.filter(c => (c[0] as string).includes('INSERT INTO forms.record_values'));
    expect(upsertCalls).toHaveLength(0);
  });

  it('valid target proceeds to upsert without error', async () => {
    setupRelationSave({ records: [[{ longValue: 1 }]] }); // exists

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ clause_ref: 'a1b2c3d4-0000-4000-8000-000000000001' }) },
    })).catch(() => {}); // getFormRecordById will fail on empty mock — we only care probe succeeded

    // Upsert was attempted after the probe (call 4 or later)
    const callsAfterProbe = mockExecute.mock.calls.slice(3);
    const upsertCalls = callsAfterProbe.filter(c => (c[0] as string).includes('INSERT INTO forms.record_values'));
    expect(upsertCalls.length).toBeGreaterThan(0);
    // Commit was called (save transaction succeeded before getFormRecordById)
    expect(mockCommit).toHaveBeenCalled();
  });

  it('probes m2.nonconformities for relation_target=nonconformity', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [[
        { stringValue: 'f-nc' }, { stringValue: 'linked_nc' },
        { stringValue: 'relation' }, { stringValue: 'nonconformity' },
      ]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'relation_target' }],
    });
    mockExecute.mockResolvedValueOnce({ records: [[{ longValue: 1 }]] }); // probe hit
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ linked_nc: 'nc-uuid-here' }) },
    })).catch(() => {});

    const [probeSql] = mockExecute.mock.calls[2];
    expect(probeSql).toContain('m2.nonconformities');
    expect(probeSql).toContain(':uuid::uuid');
  });

  it('field metadata query includes relation_target column', async () => {
    mockExecute.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'in_progress' }, { stringValue: 'tpl-1' }]],
      columnMetadata: [{ name: 'status' }, { name: 'template_id' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'f-1' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'relation_target' }],
    });
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('saveFormRecordValues', {
      input: { recordId: 'rec-1', values: JSON.stringify({ ncr_number: 'NCR-001' }) },
    })).catch(() => {});

    const [metaSql] = mockExecute.mock.calls[1];
    expect(metaSql).toContain('f.relation_target');
  });
});

// ─── Task 5: submitFormRecord + NCR→M2 mapping (BC-3) ─────────────────────────

describe('submitFormRecord — NEGATIVE PATH FIRST (BC-3)', () => {
  function setupSubmitMocks(opts: { mapsTo: string | null; valuesMap: Record<string, unknown>; fieldsMeta: Array<[string, string, boolean, string | null]> }) {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');

    // Call 1: record fetch (includes m2_nc_id)
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'in_progress' }, { stringValue: 'user-test' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });
    // Call 2: template maps_to (+ standards + clause_refs)
    mockExecute.mockResolvedValueOnce({
      records: [[opts.mapsTo ? { stringValue: opts.mapsTo } : { isNull: true }, { arrayValue: { stringValues: ['ISO9001'] } }, { arrayValue: { stringValues: ['8.7'] } }]],
      columnMetadata: [{ name: 'maps_to' }, { name: 'standards' }, { name: 'clause_refs' }],
    });
    // Call 3: field metadata (id, field_key, field_type, required, maps_to_column, relation_target)
    const metaRecords = opts.fieldsMeta.map(([key, type, required, mapsTo]) => [
      { stringValue: `f-${key}` }, { stringValue: key }, { stringValue: type },
      { booleanValue: required }, mapsTo ? { stringValue: mapsTo } : { isNull: true }, { isNull: true },
    ]);
    mockExecute.mockResolvedValueOnce({
      records: metaRecords,
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'required' }, { name: 'maps_to_column' }, { name: 'relation_target' }],
    });
    // Call 4: current values
    const valRecords = Object.entries(opts.valuesMap).map(([key, val]) => {
      const row: Record<string, unknown>[] = [{ stringValue: key }];
      if (typeof val === 'string') row.push({ stringValue: val }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true });
      else if (typeof val === 'boolean') row.push({ isNull: true }, { isNull: true }, { isNull: true }, { booleanValue: val }, { isNull: true }, { isNull: true });
      else row.push({ isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true });
      return row;
    });
    mockExecute.mockResolvedValueOnce({
      records: valRecords,
      columnMetadata: [{ name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' }, { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' }],
    });
  }

  it('VALIDATION_INCOMPLETE when severity (mapped+required) is unfilled — writes NOTHING, rolls back', async () => {
    setupSubmitMocks({
      mapsTo: 'm2_ncr',
      fieldsMeta: [
        ['ncr_number', 'text', true, null],
        ['standard', 'select', true, 'standard'],
        ['source', 'select', true, 'source'],
        ['nc_type', 'select', true, 'nc_type'],
        ['clause_ref', 'relation', true, 'clause_ref'],
        ['severity', 'select', true, 'severity'],
        ['nc_description', 'textarea', true, 'description'],
        ['raised_by', 'user', true, 'raised_by'],
        ['corrective_action_desc', 'textarea', true, 'action_desc'],
        ['ca_owner', 'user', true, 'owner_id'],
        ['ca_due_date', 'date', true, 'due_date'],
      ],
      valuesMap: {
        ncr_number: 'NCR-001',
        standard: 'ISO9001',
        source: 'audit',
        nc_type: 'nc',
        clause_ref: 'clause-uuid-1',
        // severity: MISSING — required field unfilled
        nc_description: 'A defect',
        raised_by: 'user-1',
        corrective_action_desc: 'Fix it',
        ca_owner: 'user-2',
        ca_due_date: '2026-08-01T00:00:00Z',
      },
    });

    await expect(
      handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })),
    ).rejects.toThrow('VALIDATION_INCOMPLETE');

    // Rollback — NOTHING written
    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    // No INSERT into m2 tables
    const allSqls = mockExecute.mock.calls.map(c => c[0] as string);
    expect(allSqls.filter(s => s.includes('INSERT INTO m2.'))).toHaveLength(0);
    // No status change to complete
    expect(allSqls.filter(s => s.includes("status = 'complete'"))).toHaveLength(0);
    // No audit event
    expect(mockPublishAuditEvent).not.toHaveBeenCalled();
  });

  it('VALIDATION_INCOMPLETE when clause_ref (mapped+required) is unfilled — zero defaults allowed', async () => {
    setupSubmitMocks({
      mapsTo: 'm2_ncr',
      fieldsMeta: [
        ['ncr_number', 'text', true, null],
        ['standard', 'select', true, 'standard'],
        ['source', 'select', true, 'source'],
        ['nc_type', 'select', true, 'nc_type'],
        ['clause_ref', 'relation', true, 'clause_ref'],
        ['severity', 'select', true, 'severity'],
        ['nc_description', 'textarea', true, 'description'],
        ['raised_by', 'user', true, 'raised_by'],
        ['corrective_action_desc', 'textarea', true, 'action_desc'],
        ['ca_owner', 'user', true, 'owner_id'],
        ['ca_due_date', 'date', true, 'due_date'],
      ],
      valuesMap: {
        ncr_number: 'NCR-001',
        standard: 'ISO9001',
        source: 'audit',
        nc_type: 'nc',
        // clause_ref: MISSING
        severity: 'high',
        nc_description: 'A defect',
        raised_by: 'user-1',
        corrective_action_desc: 'Fix it',
        ca_owner: 'user-2',
        ca_due_date: '2026-08-01T00:00:00Z',
      },
    });

    await expect(
      handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })),
    ).rejects.toThrow('VALIDATION_INCOMPLETE');

    expect(mockRollback).toHaveBeenCalled();
  });

  it('VALIDATION_INCOMPLETE when corrective_action_desc (action_desc mapped+required) is unfilled', async () => {
    setupSubmitMocks({
      mapsTo: 'm2_ncr',
      fieldsMeta: [
        ['ncr_number', 'text', true, null],
        ['standard', 'select', true, 'standard'],
        ['source', 'select', true, 'source'],
        ['nc_type', 'select', true, 'nc_type'],
        ['clause_ref', 'relation', true, 'clause_ref'],
        ['severity', 'select', true, 'severity'],
        ['nc_description', 'textarea', true, 'description'],
        ['raised_by', 'user', true, 'raised_by'],
        ['corrective_action_desc', 'textarea', true, 'action_desc'],
        ['ca_owner', 'user', true, 'owner_id'],
        ['ca_due_date', 'date', true, 'due_date'],
      ],
      valuesMap: {
        ncr_number: 'NCR-001',
        standard: 'ISO9001', source: 'audit', nc_type: 'nc',
        clause_ref: 'clause-uuid-1', severity: 'high',
        nc_description: 'A defect', raised_by: 'user-1',
        // corrective_action_desc: MISSING
        ca_owner: 'user-2', ca_due_date: '2026-08-01T00:00:00Z',
      },
    });

    await expect(
      handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })),
    ).rejects.toThrow('VALIDATION_INCOMPLETE');
  });
});

describe('submitFormRecord — POSITIVE PATH (NCR→M2 mapping)', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');

    // Call 1: record fetch (now includes m2_nc_id)
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'in_progress' }, { stringValue: 'user-test' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });
    // Call 2: template maps_to = m2_ncr (+ standards + clause_refs)
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'm2_ncr' }, { arrayValue: { stringValues: ['ISO9001'] } }, { arrayValue: { stringValues: ['8.7', '10.2'] } }]],
      columnMetadata: [{ name: 'maps_to' }, { name: 'standards' }, { name: 'clause_refs' }],
    });
    // Call 3: field metadata
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'f-1' }, { stringValue: 'standard' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'standard' }, { isNull: true }],
        [{ stringValue: 'f-2' }, { stringValue: 'source' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'source' }, { isNull: true }],
        [{ stringValue: 'f-3' }, { stringValue: 'nc_type' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'nc_type' }, { isNull: true }],
        [{ stringValue: 'f-4' }, { stringValue: 'clause_ref' }, { stringValue: 'relation' }, { booleanValue: true }, { stringValue: 'clause_ref' }, { stringValue: 'clause' }],
        [{ stringValue: 'f-5' }, { stringValue: 'severity' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'severity' }, { isNull: true }],
        [{ stringValue: 'f-6' }, { stringValue: 'nc_description' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'description' }, { isNull: true }],
        [{ stringValue: 'f-7' }, { stringValue: 'raised_by' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'raised_by' }, { isNull: true }],
        [{ stringValue: 'f-8' }, { stringValue: 'corrective_action_desc' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'action_desc' }, { isNull: true }],
        [{ stringValue: 'f-9' }, { stringValue: 'ca_owner' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'owner_id' }, { isNull: true }],
        [{ stringValue: 'f-10' }, { stringValue: 'ca_due_date' }, { stringValue: 'date' }, { booleanValue: true }, { stringValue: 'due_date' }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'required' }, { name: 'maps_to_column' }, { name: 'relation_target' }],
    });
    // Call 4: current record values (all filled)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'standard' }, { stringValue: 'ISO9001' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'source' }, { stringValue: 'audit' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_type' }, { stringValue: 'nc' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'clause_ref' }, { stringValue: 'clause-uuid-1' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'severity' }, { stringValue: 'high' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_description' }, { stringValue: 'Widget defect found' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'raised_by' }, { stringValue: 'user-1' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'corrective_action_desc' }, { stringValue: 'Replace widget tooling' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_owner' }, { stringValue: 'user-2' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_due_date' }, { stringValue: '2026-08-01T00:00:00Z' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' }, { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' }],
    });
    // Call 5: clause_ref resolution (clause_no from registry)
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: '8.7' }]],
      columnMetadata: [{ name: 'clause_no' }],
    });
    // Call 6: INSERT m2.nonconformities RETURNING id
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'nc-new-1' }]],
      columnMetadata: [{ name: 'id' }],
    });
    // Call 7: INSERT m2.corrective_actions
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] });
    // Call 8: UPDATE forms.records (stamp m2_nc_id + complete)
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] });
    // Remaining: getFormRecordById calls
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });
  });

  it('INSERT m2.nonconformities uses real column names from migration 003 with casts', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Call 6 is the m2.nonconformities INSERT
    const [ncSql, ncParams] = mockExecute.mock.calls[5];
    expect(ncSql).toContain('INSERT INTO m2.nonconformities');
    expect(ncSql).toContain('tenant_id');
    expect(ncSql).toContain('standard');
    expect(ncSql).toContain('source');
    expect(ncSql).toContain('nc_type');
    expect(ncSql).toContain('description');
    expect(ncSql).toContain('clause_ref');
    expect(ncSql).toContain('severity');
    expect(ncSql).toContain('raised_by');
    expect(ncSql).toContain('created_by');
    expect(ncSql).toContain('RETURNING id');
    // Values from record, not hardcoded
    expect(ncParams).toContainEqual({ name: 'standard', value: { stringValue: 'ISO9001' } });
    expect(ncParams).toContainEqual({ name: 'source', value: { stringValue: 'audit' } });
    expect(ncParams).toContainEqual({ name: 'severity', value: { stringValue: 'high' } });
    expect(ncParams).toContainEqual({ name: 'ncType', value: { stringValue: 'nc' } });
    // clause_ref is the RESOLVED text, not the UUID
    expect(ncParams).toContainEqual({ name: 'clauseRef', value: { stringValue: '8.7' } });
  });

  it('INSERT m2.corrective_actions uses nc_id from NC insert + real columns with casts', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Call 7 is the corrective_actions INSERT
    const [caSql, caParams] = mockExecute.mock.calls[6];
    expect(caSql).toContain('INSERT INTO m2.corrective_actions');
    expect(caSql).toContain('nc_id');
    expect(caSql).toContain(':ncId::uuid');
    expect(caSql).toContain('action_desc');
    expect(caSql).toContain('owner_id');
    expect(caSql).toContain('due_date');
    expect(caSql).toContain(':dueDate::timestamptz');
    expect(caSql).toContain('containment_flag');
    // nc_id from the m2.nonconformities INSERT result
    expect(caParams).toContainEqual({ name: 'ncId', value: { stringValue: 'nc-new-1' } });
    expect(caParams).toContainEqual({ name: 'actionDesc', value: { stringValue: 'Replace widget tooling' } });
    expect(caParams).toContainEqual({ name: 'ownerId', value: { stringValue: 'user-2' } });
  });

  it('stamps forms.records.m2_nc_id + status complete with ::uuid cast', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Call 8 is the UPDATE forms.records
    const [updateSql, updateParams] = mockExecute.mock.calls[7];
    expect(updateSql).toContain('UPDATE forms.records');
    expect(updateSql).toContain('m2_nc_id = :ncId::uuid');
    expect(updateSql).toContain("status = 'complete'");
    expect(updateSql).toContain('completed_by');
    expect(updateSql).toContain('WHERE id = :id::uuid');
    expect(updateParams).toContainEqual({ name: 'ncId', value: { stringValue: 'nc-new-1' } });
  });

  it('resolves clause_ref UUID → clause_no TEXT from qms.clause_registry (pending 011)', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Call 5 is the clause resolution query
    const [clauseSql, clauseParams] = mockExecute.mock.calls[4];
    expect(clauseSql).toContain('qms.clause_registry');
    expect(clauseSql).toContain('clause_no');
    expect(clauseSql).toContain(':id::uuid');
    expect(clauseParams).toContainEqual({ name: 'id', value: { stringValue: 'clause-uuid-1' } });
  });

  it('publishes audit event on successful submit', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-test',
      detailType: 'FormRecord.Submitted',
      source: 'cumplify.forms',
      payload: expect.objectContaining({ recordId: 'rec-1', mapsTo: 'm2_ncr' }),
    }));
  });

  it('commits transaction (not rollback) on success', async () => {
    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    expect(mockCommit).toHaveBeenCalled();
  });
});

// ─── Task 5: reopenFormRecord ─────────────────────────────────────────────────

describe('reopenFormRecord', () => {
  it('transitions complete → reopened with justification and publishes audit event', async () => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');

    // Call 1: record fetch (status = complete)
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'complete' }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }],
    });
    // Call 2: template metadata for audit event
    mockExecute.mockResolvedValueOnce({
      records: [[{ arrayValue: { stringValues: ['ISO14001'] } }, { arrayValue: { stringValues: ['6.1.2'] } }]],
      columnMetadata: [{ name: 'standards' }, { name: 'clause_refs' }],
    });
    // Call 3: UPDATE status = reopened
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] });
    // Remaining: getFormRecordById
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('reopenFormRecord', {
      input: { recordId: 'rec-1', justification: 'Found additional evidence' },
    })).catch(() => {});

    // Status update SQL
    const [updateSql] = mockExecute.mock.calls[2];
    expect(updateSql).toContain("status = 'reopened'");
    expect(updateSql).toContain('WHERE id = :id::uuid');

    // Audit event with dynamic standard/clauseRef from template (not literals)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      detailType: 'FormRecord.Reopened',
      standard: 'ISO14001',
      clauseRef: '6.1.2',
      payload: expect.objectContaining({ justification: 'Found additional evidence' }),
    }));

    expect(mockCommit).toHaveBeenCalled();
  });

  it('throws JUSTIFICATION_REQUIRED when justification is empty', async () => {
    mockExecute.mockReset();
    await expect(
      handler(makeEvent('reopenFormRecord', { input: { recordId: 'rec-1', justification: '' } })),
    ).rejects.toThrow('JUSTIFICATION_REQUIRED');
  });

  it('throws REOPEN_INVALID_STATUS when record is draft', async () => {
    mockExecute.mockReset();
    mockRollback.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'draft' }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }],
    });

    await expect(
      handler(makeEvent('reopenFormRecord', { input: { recordId: 'rec-1', justification: 'reason' } })),
    ).rejects.toThrow('REOPEN_INVALID_STATUS');

    expect(mockRollback).toHaveBeenCalled();
  });
});

// ─── Task 5 fix: F1 status guard + resubmit, F2 dynamic audit, F3 VALIDATION_INCOMPLETE ─

describe('submitFormRecord — F1: status guard', () => {
  it('SUBMIT_INVALID_STATUS when record is already complete', async () => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'complete' }, { stringValue: 'user-test' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });

    await expect(
      handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })),
    ).rejects.toThrow('SUBMIT_INVALID_STATUS');

    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

describe('submitFormRecord — F1: resubmit after reopen UPDATEs existing NC (no duplicate)', () => {
  it('when m2_nc_id is set, issues UPDATE m2.nonconformities (not INSERT) and does NOT touch CA', async () => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');

    // Call 1: record fetch — status=REOPENED, m2_nc_id already set
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'reopened' }, { stringValue: 'user-test' }, { stringValue: 'nc-existing-1' }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });
    // Call 2: template
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'm2_ncr' }, { arrayValue: { stringValues: ['ISO9001'] } }, { arrayValue: { stringValues: ['8.7', '10.2'] } }]],
      columnMetadata: [{ name: 'maps_to' }, { name: 'standards' }, { name: 'clause_refs' }],
    });
    // Call 3: field metadata (only mapped required for this test)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'f-1' }, { stringValue: 'standard' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'standard' }, { isNull: true }],
        [{ stringValue: 'f-2' }, { stringValue: 'source' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'source' }, { isNull: true }],
        [{ stringValue: 'f-3' }, { stringValue: 'nc_type' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'nc_type' }, { isNull: true }],
        [{ stringValue: 'f-4' }, { stringValue: 'clause_ref' }, { stringValue: 'relation' }, { booleanValue: true }, { stringValue: 'clause_ref' }, { stringValue: 'clause' }],
        [{ stringValue: 'f-5' }, { stringValue: 'severity' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'severity' }, { isNull: true }],
        [{ stringValue: 'f-6' }, { stringValue: 'nc_description' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'description' }, { isNull: true }],
        [{ stringValue: 'f-7' }, { stringValue: 'raised_by' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'raised_by' }, { isNull: true }],
        [{ stringValue: 'f-8' }, { stringValue: 'corrective_action_desc' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'action_desc' }, { isNull: true }],
        [{ stringValue: 'f-9' }, { stringValue: 'ca_owner' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'owner_id' }, { isNull: true }],
        [{ stringValue: 'f-10' }, { stringValue: 'ca_due_date' }, { stringValue: 'date' }, { booleanValue: true }, { stringValue: 'due_date' }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'required' }, { name: 'maps_to_column' }, { name: 'relation_target' }],
    });
    // Call 4: current values (all filled)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'standard' }, { stringValue: 'ISO45001' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'source' }, { stringValue: 'incident' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_type' }, { stringValue: 'incident' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'clause_ref' }, { stringValue: 'clause-uuid-1' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'severity' }, { stringValue: 'critical' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_description' }, { stringValue: 'Updated description' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'raised_by' }, { stringValue: 'user-1' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'corrective_action_desc' }, { stringValue: 'New action' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_owner' }, { stringValue: 'user-2' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_due_date' }, { stringValue: '2026-09-01T00:00:00Z' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' }, { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' }],
    });
    // Call 5: clause resolution
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: '10.2' }]],
      columnMetadata: [{ name: 'clause_no' }],
    });
    // Call 6: UPDATE m2.nonconformities (NOT INSERT)
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] });
    // Call 7: UPDATE forms.records (stamp)
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] });
    // Remaining: getFormRecordById
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Call 6 should be UPDATE (not INSERT) to m2.nonconformities
    const [ncSql, ncParams] = mockExecute.mock.calls[5];
    expect(ncSql).toContain('UPDATE m2.nonconformities');
    expect(ncSql).not.toContain('INSERT INTO m2.nonconformities');
    expect(ncSql).toContain('WHERE id = :ncId::uuid');
    expect(ncParams).toContainEqual({ name: 'ncId', value: { stringValue: 'nc-existing-1' } });
    expect(ncParams).toContainEqual({ name: 'severity', value: { stringValue: 'critical' } });

    // No INSERT INTO m2.corrective_actions (CA lifecycle belongs to M2)
    const allSqls = mockExecute.mock.calls.map(c => c[0] as string);
    expect(allSqls.filter(s => s.includes('INSERT INTO m2.corrective_actions'))).toHaveLength(0);

    // Commit succeeded
    expect(mockCommit).toHaveBeenCalled();
  });
});

describe('submitFormRecord — F2: dynamic audit event params', () => {
  it('audit event uses mapped standard and resolved clauseRef (not literals)', async () => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockPublishAuditEvent.mockReset().mockResolvedValue('evt-test');

    // Same setup as positive path but with ISO45001 standard
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'in_progress' }, { stringValue: 'user-test' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'm2_ncr' }, { arrayValue: { stringValues: ['ISO45001'] } }, { arrayValue: { stringValues: ['10.2'] } }]],
      columnMetadata: [{ name: 'maps_to' }, { name: 'standards' }, { name: 'clause_refs' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'f-1' }, { stringValue: 'standard' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'standard' }, { isNull: true }],
        [{ stringValue: 'f-2' }, { stringValue: 'source' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'source' }, { isNull: true }],
        [{ stringValue: 'f-3' }, { stringValue: 'nc_type' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'nc_type' }, { isNull: true }],
        [{ stringValue: 'f-4' }, { stringValue: 'clause_ref' }, { stringValue: 'relation' }, { booleanValue: true }, { stringValue: 'clause_ref' }, { stringValue: 'clause' }],
        [{ stringValue: 'f-5' }, { stringValue: 'severity' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'severity' }, { isNull: true }],
        [{ stringValue: 'f-6' }, { stringValue: 'nc_description' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'description' }, { isNull: true }],
        [{ stringValue: 'f-7' }, { stringValue: 'raised_by' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'raised_by' }, { isNull: true }],
        [{ stringValue: 'f-8' }, { stringValue: 'corrective_action_desc' }, { stringValue: 'textarea' }, { booleanValue: true }, { stringValue: 'action_desc' }, { isNull: true }],
        [{ stringValue: 'f-9' }, { stringValue: 'ca_owner' }, { stringValue: 'user' }, { booleanValue: true }, { stringValue: 'owner_id' }, { isNull: true }],
        [{ stringValue: 'f-10' }, { stringValue: 'ca_due_date' }, { stringValue: 'date' }, { booleanValue: true }, { stringValue: 'due_date' }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'required' }, { name: 'maps_to_column' }, { name: 'relation_target' }],
    });
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'standard' }, { stringValue: 'ISO45001' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'source' }, { stringValue: 'incident' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_type' }, { stringValue: 'incident' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'clause_ref' }, { stringValue: 'clause-uuid-2' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'severity' }, { stringValue: 'high' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'nc_description' }, { stringValue: 'Incident' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'raised_by' }, { stringValue: 'u1' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'corrective_action_desc' }, { stringValue: 'Act' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_owner' }, { stringValue: 'u2' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'ca_due_date' }, { stringValue: '2026-09-01T00:00:00Z' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' }, { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' }],
    });
    mockExecute.mockResolvedValueOnce({ records: [[{ stringValue: '10.2' }]], columnMetadata: [{ name: 'clause_no' }] });
    mockExecute.mockResolvedValueOnce({ records: [[{ stringValue: 'nc-new-2' }]], columnMetadata: [{ name: 'id' }] });
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] }); // CA insert
    mockExecute.mockResolvedValueOnce({ records: [], columnMetadata: [] }); // stamp
    mockExecute.mockResolvedValue({ records: [], columnMetadata: [] });

    await handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })).catch(() => {});

    // Audit event uses ISO45001 (from mapped values) and 10.2 (resolved clause_no)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      standard: 'ISO45001',
      clauseRef: '10.2',
    }));
  });
});

describe('submitFormRecord — F3: VALIDATION_INCOMPLETE for non-mapped required fields', () => {
  it('throws VALIDATION_INCOMPLETE when non-mapped required field is unfilled', async () => {
    mockExecute.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockPublishAuditEvent.mockReset();

    // record fetch
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'rec-1' }, { stringValue: 'tpl-1' }, { stringValue: 'in_progress' }, { stringValue: 'user-test' }, { isNull: true }]],
      columnMetadata: [{ name: 'id' }, { name: 'template_id' }, { name: 'status' }, { name: 'opened_by' }, { name: 'm2_nc_id' }],
    });
    // template
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'm2_ncr' }, { arrayValue: { stringValues: ['ISO9001'] } }, { arrayValue: { stringValues: ['8.7'] } }]],
      columnMetadata: [{ name: 'maps_to' }, { name: 'standards' }, { name: 'clause_refs' }],
    });
    // field metadata: ncr_number is REQUIRED but NOT mapped
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'f-0' }, { stringValue: 'ncr_number' }, { stringValue: 'text' }, { booleanValue: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'f-1' }, { stringValue: 'standard' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'standard' }, { isNull: true }],
        [{ stringValue: 'f-5' }, { stringValue: 'severity' }, { stringValue: 'select' }, { booleanValue: true }, { stringValue: 'severity' }, { isNull: true }],
      ],
      columnMetadata: [{ name: 'id' }, { name: 'field_key' }, { name: 'field_type' }, { name: 'required' }, { name: 'maps_to_column' }, { name: 'relation_target' }],
    });
    // current values: ncr_number is MISSING (all mapped fields filled)
    mockExecute.mockResolvedValueOnce({
      records: [
        [{ stringValue: 'standard' }, { stringValue: 'ISO9001' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        [{ stringValue: 'severity' }, { stringValue: 'high' }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }, { isNull: true }],
        // ncr_number NOT in values → unfilled
      ],
      columnMetadata: [{ name: 'field_key' }, { name: 'value_text' }, { name: 'value_number' }, { name: 'value_date' }, { name: 'value_bool' }, { name: 'value_uuid' }, { name: 'value_json' }],
    });

    await expect(
      handler(makeEvent('submitFormRecord', { input: { recordId: 'rec-1' } })),
    ).rejects.toThrow('VALIDATION_INCOMPLETE');

    // Rollback, no writes
    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    const allSqls = mockExecute.mock.calls.map(c => c[0] as string);
    expect(allSqls.filter(s => s.includes('INSERT INTO m2.'))).toHaveLength(0);
  });
});
