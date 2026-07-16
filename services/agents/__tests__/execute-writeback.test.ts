/**
 * execute-writeback hermetic tests (first dedicated suite — added with the
 * 2026-07-16 owner-approved cleanup). Pins:
 *
 * 1. Agent.WritebackCommitted carries the written row's id as envelope
 *    entityId (before this cleanup the event had NO row id anywhere — neither
 *    the audit GSI nor the payload substring fallback could find it).
 * 2. records-retention-schedule SQL targets migration-005 truth
 *    (record_type/retention_years/disposition_rule) — the previous SQL used
 *    columns that never existed plus ON CONFLICT on a constraint that never
 *    existed, so every live call failed (never exercised; ACC-3 ran
 *    capa-open only).
 * 3. 'permanent' retention throws loudly (retention_years INTEGER NOT NULL —
 *    unrepresentable, never a silent sentinel).
 * 4. SEND_BACK short-circuits: no SQL, no event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  RDSDataClient,
  BeginTransactionCommand,
  ExecuteStatementCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';

const { mockPublish } = vi.hoisted(() => ({ mockPublish: vi.fn() }));

vi.mock('../../eventing/src/publisher.js', () => ({ publish: mockPublish }));
vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

process.env.CLUSTER_ARN = 'arn:aws:rds:us-east-1:000000000000:cluster:test';
process.env.APP_ROLE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:000000000000:secret:test';

const rdsMock = mockClient(RDSDataClient);

import { handler, type WritebackInput } from '../shared/execute-writeback.js';

const baseInput = (tool: string, args: Record<string, unknown>): WritebackInput => ({
  tenantId: 'tenant-test',
  agentName: 'TestAgent',
  proposedAction: { tool, args },
  approvalResult: { decision: 'APPROVE', approverSub: 'human-sub-1' },
  hitlItemId: 'hitl-1',
});

beforeEach(() => {
  rdsMock.reset();
  mockPublish.mockReset().mockResolvedValue('evt-1');
  rdsMock.on(BeginTransactionCommand).resolves({ transactionId: 'txn-1' });
  rdsMock.on(CommitTransactionCommand).resolves({});
  rdsMock.on(RollbackTransactionCommand).resolves({});
});

/** Every ExecuteStatement input sent, in order. */
const sqlCalls = () =>
  rdsMock.commandCalls(ExecuteStatementCommand).map(c => c.args[0].input);

describe('Agent.WritebackCommitted entityId (written-row id)', () => {
  it('capa-open: envelope entityId = the RETURNING id; payload carries it too', async () => {
    // Call order: set_config, then the INSERT (RETURNING id first column)
    rdsMock
      .on(ExecuteStatementCommand)
      .resolvesOnce({ records: [[{ stringValue: 'on' }]] }) // set_config
      .resolvesOnce({ records: [[{ stringValue: 'ca-uuid-1' }, { stringValue: 'open' }, { stringValue: '2026-08-01' }]] });

    const res = await handler(baseInput('capa-open', {
      ncId: 'nc-1', actionDesc: 'a', suggestedOwnerId: 'o', dueDate: '2026-08-01T00:00:00Z',
    }));

    expect(res.status).toBe('COMMITTED');
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const evt = mockPublish.mock.calls[0][0].event;
    expect(evt.entityId).toBe('ca-uuid-1');
    expect(evt.payload.after.result.id).toBe('ca-uuid-1');
  });

  it('SEND_BACK: no SQL executed, no event published', async () => {
    const res = await handler({
      ...baseInput('capa-open', {}),
      approvalResult: { decision: 'SEND_BACK', approverSub: 'human-sub-1' },
    });
    expect(res.status).toBe('REJECTED');
    expect(rdsMock.commandCalls(ExecuteStatementCommand)).toHaveLength(0);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('records-retention-schedule — migration-005 truth (stale-schema fix)', () => {
  it('INSERT path: record_type/retention_years/disposition_rule; entityId = new row id', async () => {
    rdsMock
      .on(ExecuteStatementCommand)
      .resolvesOnce({ records: [[{ stringValue: 'on' }]] }) // set_config
      .resolvesOnce({ records: [] })                         // SELECT: no existing policy
      .resolvesOnce({ records: [[{ stringValue: 'pol-uuid-1' }, { stringValue: 'calibration' }, { longValue: 7 }]] });

    await handler(baseInput('records-retention-schedule', {
      category: 'calibration', retentionPeriod: '7-year', justification: 'ISO 7.5.3 review',
    }));

    const insert = sqlCalls()[2];
    expect(insert.sql).toContain('INSERT INTO m4.retention_policies');
    expect(insert.sql).toContain('record_type');
    expect(insert.sql).toContain('retention_years');
    expect(insert.sql).toContain("'review_before_disposal'");
    expect(insert.sql).not.toContain('record_category');
    expect(insert.sql).not.toContain('ON CONFLICT'); // no unique constraint exists on the table
    expect(insert.parameters).toContainEqual({ name: 'years', value: { longValue: 7 } });

    const evt = mockPublish.mock.calls[0][0].event;
    expect(evt.entityId).toBe('pol-uuid-1');
  });

  it('UPDATE path when a policy row already exists for the record_type', async () => {
    rdsMock
      .on(ExecuteStatementCommand)
      .resolvesOnce({ records: [[{ stringValue: 'on' }]] })            // set_config
      .resolvesOnce({ records: [[{ stringValue: 'pol-uuid-9' }]] })    // SELECT hit
      .resolvesOnce({ records: [[{ stringValue: 'pol-uuid-9' }, { stringValue: 'calibration' }, { longValue: 5 }]] });

    await handler(baseInput('records-retention-schedule', {
      category: 'calibration', retentionPeriod: '5-year', justification: 'j',
    }));

    const update = sqlCalls()[2];
    expect(update.sql).toContain('UPDATE m4.retention_policies');
    expect(update.sql).toContain('retention_years = :years');
    expect(update.sql).toContain('version = version + 1');
    expect(update.parameters).toContainEqual({ name: 'id', value: { stringValue: 'pol-uuid-9' } });

    const evt = mockPublish.mock.calls[0][0].event;
    expect(evt.entityId).toBe('pol-uuid-9');
  });

  it("'permanent' retention throws loudly (unrepresentable in retention_years INTEGER)", async () => {
    rdsMock
      .on(ExecuteStatementCommand)
      .resolvesOnce({ records: [[{ stringValue: 'on' }]] }); // set_config

    await expect(handler(baseInput('records-retention-schedule', {
      category: 'calibration', retentionPeriod: 'permanent', justification: 'j',
    }))).rejects.toThrow('RETENTION_PERIOD_UNREPRESENTABLE');

    // Failure path rolls back and publishes nothing
    expect(rdsMock.commandCalls(RollbackTransactionCommand).length).toBe(1);
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
