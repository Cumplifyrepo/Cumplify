/**
 * Unit tests for the M3/M4/M5 resolver SQL fixes (frontend-app Phase C
 * checkpoint, architect 2026-07-14): m3.ts and m4.ts were written against a
 * stale schema — column names, table names, and even input-argument shapes
 * didn't match the ratified migrations/schema.graphql. Every mutation/query
 * these fixes touch was a guaranteed runtime failure before this commit.
 *
 * Mocks shared.js at the transaction boundary (RDS path) and getTenantDdbClient
 * (DynamoDB path for getAuditTrail) and asserts the executed SQL/DDB calls +
 * parameters — the exact bugs found (wrong table names, wrong columns, wrong
 * input field names, wrong argument shape) would all be caught at this layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockCommit, mockRollback, mockDdbSend } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockDdbSend: vi.fn(),
}));

vi.mock('../../src/resolvers/shared.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/resolvers/shared.js')>();
  return {
    ...actual,
    beginTenantTransaction: vi.fn().mockResolvedValue({
      execute: mockExecute,
      commit: mockCommit,
      rollback: mockRollback,
    }),
    publishAuditEvent: vi.fn().mockResolvedValue('evt-test'),
    getTenantDdbClient: vi.fn().mockResolvedValue({ send: mockDdbSend }),
    TABLE_NAME: 'CumplifyCore-test',
  };
});

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

import { handler as m3Handler } from '../../src/resolvers/m3.js';
import { handler as m4Handler } from '../../src/resolvers/m4.js';
import { handler as m5Handler } from '../../src/resolvers/m5.js';

const EMPTY_RESULT = { records: undefined, columnMetadata: undefined };

function makeEvent(fieldName: string, args: Record<string, unknown> = {}) {
  return {
    info: { fieldName },
    arguments: args,
    identity: { resolverContext: { tenantId: 'tenant-test', sub: 'user-test' } },
  };
}

beforeEach(() => {
  mockExecute.mockReset().mockResolvedValue(EMPTY_RESULT);
  mockCommit.mockReset();
  mockRollback.mockReset();
  mockDdbSend.mockReset();
});

describe('m3 createAuditProgramme — SQL fix regression', () => {
  it('inserts into real columns (standard, year, frequency_plan) and writes year', async () => {
    await m3Handler(makeEvent('createAuditProgramme', { input: { standard: 'ISO9001', year: 2027, frequencyPlan: 'annual' } }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO m3.audit_programmes');
    expect(sql).toContain('year');
    expect(sql).not.toContain('title');
    expect(sql).not.toContain('programme_owner');
    expect(params).toContainEqual({ name: 'year', value: { longValue: 2027 } });
  });
});

describe('m3 scheduleAudit — SQL fix regression', () => {
  it('inserts into real columns (standard, planned_date) not audit_type/scheduled_date', async () => {
    await m3Handler(makeEvent('scheduleAudit', {
      input: { programmeId: 'prog-1', standard: 'ISO9001', scope: 'Warehouse', leadAuditorId: 'u1', plannedDate: '2027-01-01T00:00:00.000Z' },
    }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('planned_date');
    expect(sql).not.toContain('audit_type');
    expect(sql).not.toContain('scheduled_date');
    expect(params).toContainEqual({ name: 'standard', value: { stringValue: 'ISO9001' } });
    expect(params).toContainEqual({ name: 'plannedDate', value: { stringValue: '2027-01-01T00:00:00.000Z' } });
  });
});

describe('m3 completeAudit — argument-shape fix regression', () => {
  it('reads the bare id argument (not input.auditId) and never references a conclusion column', async () => {
    await m3Handler(makeEvent('completeAudit', { id: 'audit-1' }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).not.toContain('conclusion');
    expect(params).toEqual([{ name: 'id', value: { stringValue: 'audit-1' } }]);
  });
});

describe('m3 getAuditReadiness — shape fix regression', () => {
  it('selects per-clause scores from audit_readiness_scores filtered by standard, not aggregate counts', async () => {
    await m3Handler(makeEvent('getAuditReadiness', { standard: 'ISO14001' }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('FROM m3.audit_readiness_scores');
    expect(sql).toContain('WHERE standard = :standard');
    expect(sql).not.toContain('scheduled_audits');
    expect(sql).not.toContain('open_findings');
    expect(params).toEqual([{ name: 'standard', value: { stringValue: 'ISO14001' } }]);
  });
});

describe('m4 registerRecord — SQL fix regression', () => {
  it('inserts into real columns (source_module, retention_class, s3_object_ref) not title/description/status', async () => {
    await m4Handler(makeEvent('registerRecord', {
      input: { standard: 'ISO9001', recordType: 'inspection', sourceModule: 'M3' },
    }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('source_module');
    expect(sql).not.toContain('title');
    expect(sql).not.toContain('storage_location');
    expect(sql).not.toContain('owner_id');
    expect(params).toContainEqual({ name: 'sourceModule', value: { stringValue: 'M3' } });
  });
});

describe('m4 recordCalibration — table/column fix regression', () => {
  it('inserts into m4.calibration_records (not m4.calibrations) with real columns', async () => {
    await m4Handler(makeEvent('recordCalibration', {
      input: { measuringResourceId: 'res-1', standardUsed: 'ISO17025', result: 'pass', nextDue: '2027-01-01T00:00:00.000Z' },
    }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO m4.calibration_records');
    expect(sql).not.toContain('m4.calibrations');
    expect(sql).not.toContain('equipment_id');
    expect(params).toContainEqual({ name: 'measuringResourceId', value: { stringValue: 'res-1' } });
    expect(params).toContainEqual({ name: 'standardUsed', value: { stringValue: 'ISO17025' } });
  });
});

describe('m4 createRetentionPolicy — SQL fix regression', () => {
  it('inserts retention_years/disposition_rule, matching CreateRetentionPolicyInput', async () => {
    await m4Handler(makeEvent('createRetentionPolicy', {
      input: { recordType: 'audit-report', retentionYears: 7, dispositionRule: 'archive' },
    }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('retention_years');
    expect(sql).toContain('disposition_rule');
    expect(sql).not.toContain('retention_period_days');
    expect(sql).not.toContain('applies_to_standard');
    expect(params).toContainEqual({ name: 'retentionYears', value: { longValue: 7 } });
  });
});

describe('m4 listCalibrationsDue — table/arg fix regression', () => {
  it('queries m4.calibration_records (not m4.calibrations/m4.equipment) and honors windowDays', async () => {
    await m4Handler(makeEvent('listCalibrationsDue', { windowDays: 90 }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('FROM m4.calibration_records');
    expect(sql).not.toContain('m4.equipment');
    expect(sql).not.toContain('m4.calibrations');
    expect(sql).toContain('make_interval');
    expect(params).toEqual([{ name: 'windowDays', value: { longValue: 90 } }]);
  });
});

describe('m4 getAuditTrail — data-store + argument-shape fix regression', () => {
  it('queries DynamoDB by tenant partition (not RDS m4.audit_trail) using the bare entityId arg', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        {
          PK: { S: 'TENANT#tenant-test#AUDITLOG' },
          SK: { S: 'EVENT#2027-01-01T00:00:00.000Z#evt-1' },
          eventId: { S: 'evt-1' },
          eventType: { S: 'Risk.Created' },
          actor: { S: 'user-1' },
          module: { S: 'M5' },
          clauseRef: { S: 'ISO 9001 6.1' },
          standard: { S: 'ISO9001' },
          eventTimestamp: { S: '2027-01-01T00:00:00.000Z' },
          payloadHash: { S: 'hash1' },
          payload: { M: { riskId: { S: 'risk-42' } } },
        },
        {
          PK: { S: 'TENANT#tenant-test#AUDITLOG' },
          SK: { S: 'EVENT#2027-01-01T00:00:01.000Z#evt-2' },
          eventId: { S: 'evt-2' },
          eventType: { S: 'Risk.Created' },
          actor: { S: 'user-1' },
          module: { S: 'M5' },
          clauseRef: { S: 'ISO 9001 6.1' },
          standard: { S: 'ISO9001' },
          eventTimestamp: { S: '2027-01-01T00:00:01.000Z' },
          payloadHash: { S: 'hash2' },
          payload: { M: { riskId: { S: 'risk-99' } } },
        },
      ],
    });

    const result = await m4Handler(makeEvent('getAuditTrail', { entityId: 'risk-42' })) as Array<Record<string, unknown>>;

    expect(mockExecute).not.toHaveBeenCalled();
    const [ddbCall] = mockDdbSend.mock.calls[0];
    expect(ddbCall.input.TableName).toBe('CumplifyCore-test');
    expect(ddbCall.input.ExpressionAttributeValues[':pk']).toEqual({ S: 'TENANT#tenant-test#AUDITLOG' });
    expect(result).toHaveLength(1);
    expect(result[0].eventId).toBe('evt-1');
  });
});

describe('m4 registerMeasuringResource — new mutation (unblocks recordCalibration)', () => {
  it('inserts into m4.measuring_resources with assetTag/description', async () => {
    await m4Handler(makeEvent('registerMeasuringResource', {
      input: { assetTag: 'CAL-001', description: 'Digital caliper' },
    }));
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO m4.measuring_resources');
    expect(sql).toContain('asset_tag');
    expect(params).toContainEqual({ name: 'assetTag', value: { stringValue: 'CAL-001' } });
    expect(params).toContainEqual({ name: 'description', value: { stringValue: 'Digital caliper' } });
  });
});

describe('m5 createRisk — register-refresh fix regression', () => {
  it('refreshes m5_views.risk_register_view via the SECURITY DEFINER accessor, in the same transaction as the INSERT', async () => {
    await m5Handler(makeEvent('createRisk', {
      input: { standard: 'ISO9001', category: 'QUALITY', description: 'Test risk', likelihood: 3, severity: 3 },
    }));

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const [insertSql] = mockExecute.mock.calls[0];
    const [refreshSql] = mockExecute.mock.calls[1];
    expect(insertSql).toContain('INSERT INTO m5.risks');
    expect(refreshSql).toContain('m5_views.refresh_risk_register_view()');
    // Refresh happens BEFORE commit — same transaction, atomic with the write.
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.invocationCallOrder[1]).toBeLessThan(mockCommit.mock.invocationCallOrder[0]);
  });
});
