/**
 * Unit tests for hitl-query resolver.
 * Tests: happy path, empty queue, pagination, cross-tenant rejection, taskToken exclusion (BC-8).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDdbSend } = vi.hoisted(() => {
  process.env.CLUSTER_ARN = 'arn:aws:rds:us-east-1:123:cluster:test';
  process.env.APP_ROLE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:app-role';
  process.env.TABLE_NAME = 'CumplifyCore';
  process.env.BUS_NAME = 'cumplify-events';
  process.env.TENANT_DATA_ROLE_ARN = 'arn:aws:iam::123:role/tenant-data-role';
  process.env.REGION = 'us-east-1';

  const mockDdbSend = vi.fn();
  return { mockDdbSend };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockDdbSend; },
  QueryCommand: class { constructor(public input: unknown) {} },
}));

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: class { send = vi.fn().mockResolvedValue({
    Credentials: {
      AccessKeyId: 'AKIA_TEST',
      SecretAccessKey: 'secret',
      SessionToken: 'token',
      Expiration: new Date(Date.now() + 900_000),
    },
  }); },
  AssumeRoleCommand: class { constructor(public input: unknown) {} },
}));

vi.mock('@aws-sdk/client-rds-data', () => ({
  RDSDataClient: class { send = vi.fn(); },
  BeginTransactionCommand: class { constructor(public input: unknown) {} },
  CommitTransactionCommand: class { constructor(public input: unknown) {} },
  RollbackTransactionCommand: class { constructor(public input: unknown) {} },
  ExecuteStatementCommand: class { constructor(public input: unknown) {} },
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

vi.mock('../../../../eventing/src/publisher.js', () => ({
  publish: vi.fn().mockResolvedValue('mock-event-id'),
}));

import { handler } from '../../src/resolvers/hitl-query.js';
import { marshall } from '@aws-sdk/util-dynamodb';

const TENANT_ID = 'tenant-001';

function makeEvent(fieldName: string, args: Record<string, unknown> = {}) {
  return {
    info: { fieldName },
    arguments: args,
    identity: {
      resolverContext: {
        tenantId: TENANT_ID,
        sub: 'user-abc',
        role: 'Employee',
        poolClass: 'tenant-user',
        entitlement: '{}',
      },
    },
  };
}

function makeDdbItem(overrides: Record<string, unknown> = {}) {
  return marshall({
    PK: `TENANT#${TENANT_ID}#HITL`,
    SK: 'PENDING#hitl-item-123',
    GSI9PK: `TENANT#${TENANT_ID}#HITL_PENDING`,
    GSI9SK: '2024-01-15T10:00:00.000Z',
    agentName: 'risk-agent',
    standard: 'ISO9001',
    module: 'M5',
    proposedAction: { tool: 'clause-7.1.2', input: { severity: 'HIGH' } },
    status: 'PENDING',
    createdAt: '2024-01-15T10:00:00.000Z',
    taskToken: 'SECRET_TASK_TOKEN_DO_NOT_EXPOSE',
    ...overrides,
  });
}

beforeEach(() => {
  mockDdbSend.mockReset();
});

describe('hitl-query resolver — listPendingHitlItems', () => {
  it('returns mapped items from GSI9 query (happy path)', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeDdbItem()],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent('listPendingHitlItems', { pagination: null })) as {
      items: Record<string, unknown>[];
      nextToken: string | null;
    };

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      hitlItemId: 'hitl-item-123',
      agentName: 'risk-agent',
      clauseRef: 'clause-7.1.2',
      standard: 'ISO9001',
      module: 'M5',
      draftBody: JSON.stringify({ tool: 'clause-7.1.2', input: { severity: 'HIGH' } }),
      status: 'PENDING',
      createdAt: '2024-01-15T10:00:00.000Z',
      guardrailEvidence: null,
    });
    expect(result.nextToken).toBeNull();
  });

  it('BC-8: taskToken is EXCLUDED from response', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeDdbItem()],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent('listPendingHitlItems', { pagination: null })) as {
      items: Record<string, unknown>[];
    };

    expect(result.items[0]).not.toHaveProperty('taskToken');
    const serialized = JSON.stringify(result.items[0]);
    expect(serialized).not.toContain('SECRET_TASK_TOKEN');
  });

  it('returns empty items when queue is empty', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent('listPendingHitlItems', { pagination: null })) as {
      items: Record<string, unknown>[];
      nextToken: string | null;
    };

    expect(result.items).toEqual([]);
    expect(result.nextToken).toBeNull();
  });

  it('returns nextToken when LastEvaluatedKey is present', async () => {
    const lastKey = marshall({ PK: `TENANT#${TENANT_ID}#HITL`, SK: 'PENDING#hitl-item-200' });
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeDdbItem()],
      LastEvaluatedKey: lastKey,
    });

    const result = await handler(makeEvent('listPendingHitlItems', { pagination: { limit: 1 } })) as {
      items: Record<string, unknown>[];
      nextToken: string | null;
    };

    expect(result.nextToken).toBeTruthy();
    // Decode and verify the nextToken is valid JSON
    const decoded = JSON.parse(Buffer.from(result.nextToken!, 'base64').toString('utf-8'));
    expect(decoded.PK).toBe(`TENANT#${TENANT_ID}#HITL`);
  });

  it('accepts valid nextToken for pagination', async () => {
    const validKey = { PK: `TENANT#${TENANT_ID}#HITL`, SK: 'PENDING#hitl-item-100' };
    const nextToken = Buffer.from(JSON.stringify(validKey)).toString('base64');

    mockDdbSend.mockResolvedValueOnce({
      Items: [makeDdbItem({ SK: 'PENDING#hitl-item-200' })],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent('listPendingHitlItems', {
      pagination: { nextToken },
    })) as { items: Record<string, unknown>[]; nextToken: string | null };

    expect(result.items).toHaveLength(1);
    expect(result.items[0].hitlItemId).toBe('hitl-item-200');
  });

  it('rejects cross-tenant nextToken', async () => {
    const crossTenantKey = { PK: 'TENANT#evil-tenant#HITL', SK: 'PENDING#stolen-item' };
    const nextToken = Buffer.from(JSON.stringify(crossTenantKey)).toString('base64');

    await expect(
      handler(makeEvent('listPendingHitlItems', { pagination: { nextToken } })),
    ).rejects.toThrow('Cross-tenant pagination key rejected');
  });

  it('rejects malformed nextToken', async () => {
    await expect(
      handler(makeEvent('listPendingHitlItems', { pagination: { nextToken: 'not-valid-base64!!!' } })),
    ).rejects.toThrow('Invalid nextToken');
  });

  it('caps limit at 50', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    await handler(makeEvent('listPendingHitlItems', { pagination: { limit: 100 } }));

    // Verify the QueryCommand was called with Limit: 50
    const cmd = mockDdbSend.mock.calls[0][0];
    expect(cmd.input.Limit).toBe(50);
  });

  it('defaults limit to 20 when not provided', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    await handler(makeEvent('listPendingHitlItems', { pagination: {} }));

    const cmd = mockDdbSend.mock.calls[0][0];
    expect(cmd.input.Limit).toBe(20);
  });

  it('includes guardrailEvidence when present', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeDdbItem({ guardrailEvidence: { reason: 'PII detected', score: 0.95 } })],
      LastEvaluatedKey: undefined,
    });

    const result = await handler(makeEvent('listPendingHitlItems', { pagination: null })) as {
      items: Record<string, unknown>[];
    };

    expect(result.items[0].guardrailEvidence).toEqual({ reason: 'PII detected', score: 0.95 });
  });
});

describe('hitl-query resolver — error handling', () => {
  it('throws on unknown field', async () => {
    await expect(handler(makeEvent('unknownField'))).rejects.toThrow('Unknown field: unknownField');
  });
});
