/**
 * C-2 INVARIANT unit test: set_config('app.tenant_id', :tenantId, true) is the
 * FIRST in-transaction statement issued by beginTenantTransaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rdsCallLog: { command: string; sql?: string; transactionId?: string }[] = [];

const { mockRdsSend } = vi.hoisted(() => {
  const mockRdsSend = vi.fn();
  return { mockRdsSend };
});

vi.mock('@aws-sdk/client-rds-data', () => ({
  RDSDataClient: class {
    send = mockRdsSend;
  },
  BeginTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  CommitTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  RollbackTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  ExecuteStatementCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: class {
    send = vi.fn();
  },
  AssumeRoleCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = vi.fn();
  },
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    appendKeys = vi.fn();
  },
}));

vi.mock('../../../eventing/src/publisher.js', () => ({
  publish: vi.fn().mockResolvedValue('mock-event-id'),
}));

vi.hoisted(() => {
  process.env.CLUSTER_ARN = 'arn:aws:rds:us-east-1:123:cluster:test';
  process.env.APP_ROLE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:app-role';
  process.env.TABLE_NAME = 'CumplifyCore';
  process.env.BUS_NAME = 'cumplify-events';
  process.env.TENANT_DATA_ROLE_ARN = 'arn:aws:iam::123:role/tenant-data-role';
  process.env.REGION = 'us-east-1';
});

import { beginTenantTransaction } from '../src/resolvers/shared.js';

beforeEach(() => {
  rdsCallLog.length = 0;
  mockRdsSend.mockImplementation((cmd: unknown) => {
    const cmdName = (cmd as { constructor: { name: string } }).constructor.name;
    const sql = (cmd as { input?: { sql?: string } }).input?.sql;
    const transactionId = (cmd as { input?: { transactionId?: string } }).input?.transactionId;
    rdsCallLog.push({ command: cmdName, sql, transactionId });
    if (cmdName === 'BeginTransactionCommand') {
      return Promise.resolve({ transactionId: 'txn-001' });
    }
    return Promise.resolve({ records: [], columnMetadata: [] });
  });
});

describe('C-2 Invariant: set_config is FIRST in-transaction statement', () => {
  it('beginTenantTransaction issues BeginTransaction then set_config as first ExecuteStatement', async () => {
    await beginTenantTransaction('tenant-abc-123');
    expect(rdsCallLog).toHaveLength(2);
    expect(rdsCallLog[0].command).toBe('BeginTransactionCommand');
    expect(rdsCallLog[1].command).toBe('ExecuteStatementCommand');
    expect(rdsCallLog[1].sql).toContain("set_config('app.tenant_id'");
    expect(rdsCallLog[1].transactionId).toBe('txn-001');
  });

  it('set_config uses parameterized tenantId (never string interpolation)', async () => {
    await beginTenantTransaction('tenant-xyz-789');
    const setConfigCall = rdsCallLog[1];
    expect(setConfigCall.sql).toBe("SELECT set_config('app.tenant_id', :tenantId, true)");
  });

  it('set_config third arg is true (transaction-local, not session-scoped)', async () => {
    await beginTenantTransaction('any-tenant');
    const setConfigCall = rdsCallLog[1];
    expect(setConfigCall.sql).toContain(', true)');
    expect(setConfigCall.sql).not.toContain('false');
  });

  it('subsequent execute calls happen AFTER set_config', async () => {
    const txn = await beginTenantTransaction('tenant-test');
    await txn.execute('SELECT * FROM m5.risks WHERE id = :id', [
      { name: 'id', value: { stringValue: 'risk-001' } },
    ]);
    expect(rdsCallLog).toHaveLength(3);
    expect(rdsCallLog[0].command).toBe('BeginTransactionCommand');
    expect(rdsCallLog[1].sql).toContain('set_config');
    expect(rdsCallLog[2].sql).toBe('SELECT * FROM m5.risks WHERE id = :id');
  });
});
