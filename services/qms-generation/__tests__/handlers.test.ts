/**
 * Handler tests — hermetic (mocked txn/S3/Lambda/publish), SQL-asserting
 * against real 011 column names (the M2 lesson).
 *
 * The two behavioral spines:
 *  - idempotent re-seed: ON CONFLICT (run_id, harmonization_key) DO NOTHING
 *    + only status='pending' sections returned to the Map (GEN-5)
 *  - GAP path performs ZERO invoker calls ($0 — ACC-4 by construction)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExecute,
  mockCommit,
  mockRollback,
  mockPublishAuditEvent,
  mockS3Send,
  mockLambdaSend,
  mockPublishEvent,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockPublishAuditEvent: vi.fn(),
  mockS3Send: vi.fn(),
  mockLambdaSend: vi.fn(),
  mockPublishEvent: vi.fn(),
}));

vi.mock('../../api/src/resolvers/shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/src/resolvers/shared.js')>();
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

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mockS3Send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockLambdaSend;
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('../src/appsync-publish.js', () => ({
  publishGenerationEvent: mockPublishEvent,
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    appendKeys = vi.fn();
  },
}));

process.env.GENERAL_BUCKET = 'test-bucket';
process.env.AI_INVOKER_ARN = 'arn:test:invoker';

import { handler as seedHandler } from '../src/seed-sections.js';
import { handler as composeHandler } from '../src/compose-section.js';

const EMPTY = { records: [], columnMetadata: [] };

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue(EMPTY);
  mockCommit.mockReset();
  mockRollback.mockReset();
  mockPublishAuditEvent.mockReset().mockResolvedValue('evt');
  mockS3Send.mockReset().mockResolvedValue({});
  mockLambdaSend.mockReset();
  mockPublishEvent.mockReset().mockResolvedValue(undefined);
});

const REGISTRY_COLS = [
  { name: 'id' },
  { name: 'standard' },
  { name: 'clause_no' },
  { name: 'clause_title' },
  { name: 'intent_paraphrase' },
  { name: 'annex_sl_mode' },
  { name: 'harmonization_key' },
  { name: 'doc_type' },
  { name: 'required_sources' },
  { name: 'sort_order' },
];
function registryRow(id: string, standard: string, hk: string, mode = 'shared') {
  return [
    { stringValue: id },
    { stringValue: standard },
    { stringValue: '4.1' },
    { stringValue: 'Context' },
    { stringValue: 'Understand context.' },
    { stringValue: mode },
    { stringValue: hk },
    { stringValue: 'procedure' },
    { stringValue: '["org_profile.legalName"]' },
    { longValue: 41 },
  ];
}

describe('SeedSections — idempotent re-seed (GEN-5)', () => {
  it('inserts with ON CONFLICT DO NOTHING on real 011 columns and returns ONLY pending sections', async () => {
    mockExecute
      // run row
      .mockResolvedValueOnce({
        records: [[{ longValue: 3 }, { arrayValue: { stringValues: ['ISO9001'] } }]],
        columnMetadata: [{ name: 'profile_version' }, { name: 'standards' }],
      })
      // registry
      .mockResolvedValueOnce({
        records: [registryRow('11111111-1111-4111-8111-111111111111', 'ISO9001', '4.1')],
        columnMetadata: REGISTRY_COLS,
      })
      // exclusions
      .mockResolvedValueOnce(EMPTY)
      // insert
      .mockResolvedValueOnce(EMPTY)
      // pending select
      .mockResolvedValueOnce({
        records: [[{ stringValue: 'sec-1' }, { stringValue: '4.1' }]],
        columnMetadata: [{ name: 'id' }, { name: 'harmonization_key' }],
      });

    const out = await seedHandler({ runId: 'run-1', tenantId: 'tenant-test' });

    const sqls = mockExecute.mock.calls.map((c) => c[0] as string);
    const insertSql = sqls.find((s) => s.includes('INSERT INTO qms.generation_sections'))!;
    expect(insertSql).toContain('ON CONFLICT (run_id, harmonization_key) DO NOTHING');
    expect(insertSql).toContain('clause_registry_ids');
    expect(insertSql).toContain(':ids::uuid[]');

    const pendingSql = sqls.find((s) => s.includes("status = 'pending'"))!;
    expect(pendingSql).toContain(':runId::uuid');

    expect(out.sections).toEqual([{ sectionId: 'sec-1', sectionKey: '4.1' }]);
    expect(mockCommit).toHaveBeenCalled();
  });

  it('na_justified sections get S3 content carrying the justification', async () => {
    mockExecute
      .mockResolvedValueOnce({
        records: [[{ longValue: 1 }, { arrayValue: { stringValues: ['ISO9001'] } }]],
        columnMetadata: [{ name: 'profile_version' }, { name: 'standards' }],
      })
      .mockResolvedValueOnce({
        records: [
          registryRow('22222222-2222-4222-8222-222222222222', 'ISO9001', '8.3', 'standard_only'),
        ],
        columnMetadata: REGISTRY_COLS,
      })
      .mockResolvedValueOnce({
        records: [
          [
            { stringValue: '22222222-2222-4222-8222-222222222222' },
            { stringValue: 'build-to-print' },
          ],
        ],
        columnMetadata: [{ name: 'clause_registry_id' }, { name: 'justification' }],
      })
      .mockResolvedValue(EMPTY);

    await seedHandler({ runId: 'run-1', tenantId: 'tenant-test' });

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const putInput = (mockS3Send.mock.calls[0][0] as { input: { Body: string; Key: string } })
      .input;
    expect(putInput.Body).toContain('na_justified');
    expect(putInput.Body).toContain('build-to-print');
    expect(putInput.Key).toContain('tenants/tenant-test/generation/run-1/sections/');
  });
});

describe('ComposeSection', () => {
  it('GAP path: register source missing → gap block written, ZERO invoker calls ($0, ACC-4)', async () => {
    mockExecute
      // section row (pending, one clause needing an unbuilt register)
      .mockResolvedValueOnce({
        records: [
          [
            { stringValue: 'pending' },
            { arrayValue: { stringValues: ['33333333-3333-4333-8333-333333333333'] } },
          ],
        ],
        columnMetadata: [{ name: 'status' }, { name: 'clause_registry_ids' }],
      })
      // run + pinned profile
      .mockResolvedValueOnce({
        records: [
          [
            { longValue: 1 },
            { stringValue: JSON.stringify({ legalName: 'Acme', standardsInScope: ['ISO14001'] }) },
          ],
        ],
        columnMetadata: [{ name: 'profile_version' }, { name: 'payload' }],
      })
      // member clauses — requires register.aspects (module not built)
      .mockResolvedValueOnce({
        records: [
          [
            { stringValue: '33333333-3333-4333-8333-333333333333' },
            { stringValue: 'ISO14001' },
            { stringValue: '6.1.2' },
            { stringValue: 'Aspects' },
            { stringValue: 'Identify aspects.' },
            { stringValue: '["register.aspects"]' },
          ],
        ],
        columnMetadata: [
          { name: 'id' },
          { name: 'standard' },
          { name: 'clause_no' },
          { name: 'clause_title' },
          { name: 'intent_paraphrase' },
          { name: 'required_sources' },
        ],
      })
      .mockResolvedValue(EMPTY);

    const out = await composeHandler({
      runId: 'run-1',
      tenantId: 'tenant-test',
      sectionId: 'sec-1',
      sectionKey: '6.1.2-aspects#ISO14001',
    });

    expect(out.status).toBe('gap');
    // THE assertion: the model was never called
    expect(mockLambdaSend).not.toHaveBeenCalled();
    // gap content persisted with the missing source NAMED
    const putInput = (mockS3Send.mock.calls[0][0] as { input: { Body: string } }).input;
    expect(putInput.Body).toContain('register.aspects');
    // section marked gap on real columns
    const gapSql = mockExecute.mock.calls
      .map((c) => c[0] as string)
      .find((s) => s.includes("status = 'gap'"))!;
    expect(gapSql).toContain('content_s3_key');
    expect(gapSql).toContain('content_sha256');
    // audit event still fires (gap is a ledgered outcome, not a silent skip)
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detailType: 'Generation.SectionComposed',
        standard: 'IMS',
      }),
    );
  });

  it('pending guard: a non-pending section is skipped untouched (idempotent Map retry)', async () => {
    mockExecute.mockResolvedValueOnce({
      records: [[{ stringValue: 'prose' }, { arrayValue: { stringValues: [] } }]],
      columnMetadata: [{ name: 'status' }, { name: 'clause_registry_ids' }],
    });

    const out = await composeHandler({
      runId: 'run-1',
      tenantId: 'tenant-test',
      sectionId: 'sec-1',
      sectionKey: '4.1',
    });

    expect(out.status).toBe('prose');
    expect(mockLambdaSend).not.toHaveBeenCalled();
    expect(mockS3Send).not.toHaveBeenCalled();
    // no UPDATE ran
    expect(
      mockExecute.mock.calls.map((c) => c[0] as string).some((s) => s.includes('UPDATE')),
    ).toBe(false);
  });
});

// ─── Task 12 golden-eval round-2 regression pin ──────────────────────────────
describe('ComposeSection — terminal invoker error resilience (eval-09 8.3 class)', () => {
  it('AI-invoker hard error → section FAILED + committed, handler does NOT throw (run survives to PARTIAL)', async () => {
    mockExecute
      .mockResolvedValueOnce({
        records: [
          [
            { stringValue: 'pending' },
            { arrayValue: { stringValues: ['44444444-4444-4444-8444-444444444444'] } },
          ],
        ],
        columnMetadata: [{ name: 'status' }, { name: 'clause_registry_ids' }],
      })
      .mockResolvedValueOnce({
        records: [
          [
            { longValue: 1 },
            {
              stringValue: JSON.stringify({
                legalName: 'Acme',
                designResponsibility: false,
                standardsInScope: ['ISO9001'],
              }),
            },
          ],
        ],
        columnMetadata: [{ name: 'profile_version' }, { name: 'payload' }],
      })
      .mockResolvedValueOnce({
        records: [
          [
            { stringValue: '44444444-4444-4444-8444-444444444444' },
            { stringValue: 'ISO9001' },
            { stringValue: '8.3' },
            { stringValue: 'Design and development' },
            { stringValue: 'Design process.' },
            { stringValue: '["org_profile.designResponsibility"]' },
          ],
        ],
        columnMetadata: [
          { name: 'id' },
          { name: 'standard' },
          { name: 'clause_no' },
          { name: 'clause_title' },
          { name: 'intent_paraphrase' },
          { name: 'required_sources' },
        ],
      })
      .mockResolvedValue(EMPTY);
    // exact eval-09 failure shape: invoker returns FunctionError after its own schema retries
    mockLambdaSend.mockResolvedValue({
      FunctionError: 'Unhandled',
      Payload: Buffer.from(
        JSON.stringify({
          errorMessage:
            "Schema validation failed (attempt 2): Property 'sentences[1].factRefs' expected at least 1 items, got 0",
        }),
      ),
    });

    const out = await composeHandler({
      runId: 'run-2',
      tenantId: 'tenant-test',
      sectionId: 'sec-2',
      sectionKey: '8.3#ISO9001',
    });

    expect(out.status).toBe('failed');
    const failCall = mockExecute.mock.calls.find((c) =>
      (c[0] as string).includes("status = 'failed'"),
    )!;
    expect(failCall).toBeDefined();
    const errParam = (failCall[1] as Array<{ name: string; value: { stringValue: string } }>).find(
      (p) => p.name === 'err',
    )!.value.stringValue;
    expect(errParam).toContain('composer error: AI Invoker error');
    expect(mockCommit).toHaveBeenCalled();
    expect(mockPublishAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detailType: 'Generation.SectionFailed',
      }),
    );
  });
});
