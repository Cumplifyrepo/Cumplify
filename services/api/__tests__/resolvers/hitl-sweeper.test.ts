/**
 * Unit tests for hitl-sweeper Lambda.
 * Tests: happy path reset, skip already-resolved, empty scan, pagination.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDdbSend = vi.hoisted(() => {
  process.env.TABLE_NAME = 'CumplifyCore';
  return vi.fn();
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockDdbSend; },
  ScanCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
  UpdateItemCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
}));

vi.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: (obj: unknown) => obj,
  unmarshall: (obj: unknown) => obj,
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

import { handler } from '../../src/resolvers/hitl-sweeper.js';

const TENANT_ID = 'tenant-001';

function makeStaleItem(hitlItemId: string, minutesAgo: number) {
  const resolvingAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
  return {
    PK: `TENANT#${TENANT_ID}#HITL`,
    SK: `PENDING#${hitlItemId}`,
    GSI9PK: `TENANT#${TENANT_ID}#HITL_PENDING`,
    GSI9SK: '2024-01-15T10:00:00.000Z',
    status: 'RESOLVING',
    resolvingAt,
    agentName: 'risk-agent',
    taskToken: 'token-abc',
  };
}

beforeEach(() => {
  mockDdbSend.mockReset();
});

describe('hitl-sweeper handler', () => {
  it('resets stale RESOLVING items to PENDING (happy path)', async () => {
    // Scan returns 2 stale items
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeStaleItem('item-1', 10), makeStaleItem('item-2', 7)],
      LastEvaluatedKey: undefined,
    });
    // Both UpdateItem calls succeed
    mockDdbSend.mockResolvedValueOnce({});
    mockDdbSend.mockResolvedValueOnce({});

    const result = await handler();

    expect(result.scanned).toBe(2);
    expect(result.reset).toBe(2);
    expect(result.skipped).toBe(0);

    // Verify UpdateItem calls
    expect(mockDdbSend).toHaveBeenCalledTimes(3); // 1 Scan + 2 UpdateItems
    const updateCall1 = mockDdbSend.mock.calls[1][0];
    expect(updateCall1.input.Key.PK).toBe(`TENANT#${TENANT_ID}#HITL`);
    expect(updateCall1.input.Key.SK).toBe('PENDING#item-1');
    expect(updateCall1.input.ConditionExpression).toBe('#status = :resolving');
    expect(updateCall1.input.UpdateExpression).toContain('SET #status = :pending');
    expect(updateCall1.input.UpdateExpression).toContain('REMOVE resolvingAt');
  });

  it('skips items resolved between scan and update (ConditionalCheckFailedException)', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeStaleItem('item-1', 10)],
      LastEvaluatedKey: undefined,
    });
    // UpdateItem throws ConditionalCheckFailedException
    const condErr = new Error('Conditional check failed');
    (condErr as unknown as Record<string, string>).name = 'ConditionalCheckFailedException';
    mockDdbSend.mockRejectedValueOnce(condErr);

    const result = await handler();

    expect(result.scanned).toBe(1);
    expect(result.reset).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('returns zero counts when no stale items found', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    const result = await handler();

    expect(result.scanned).toBe(0);
    expect(result.reset).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('paginates through multiple scan pages', async () => {
    // First page
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeStaleItem('item-1', 10)],
      LastEvaluatedKey: { PK: 'TENANT#tenant-001#HITL', SK: 'PENDING#item-1' },
    });
    // UpdateItem for item-1
    mockDdbSend.mockResolvedValueOnce({});
    // Second page
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeStaleItem('item-2', 8)],
      LastEvaluatedKey: undefined,
    });
    // UpdateItem for item-2
    mockDdbSend.mockResolvedValueOnce({});

    const result = await handler();

    expect(result.scanned).toBe(2);
    expect(result.reset).toBe(2);
    expect(result.skipped).toBe(0);
    // 2 Scans + 2 UpdateItems = 4 calls
    expect(mockDdbSend).toHaveBeenCalledTimes(4);
  });

  it('propagates non-conditional DDB errors', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [makeStaleItem('item-1', 10)],
      LastEvaluatedKey: undefined,
    });
    mockDdbSend.mockRejectedValueOnce(new Error('InternalServerError'));

    await expect(handler()).rejects.toThrow('InternalServerError');
  });

  it('uses correct FilterExpression in Scan', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: undefined,
    });

    await handler();

    const scanCmd = mockDdbSend.mock.calls[0][0];
    expect(scanCmd.input.FilterExpression).toBe(
      '#status = :resolving AND resolvingAt < :cutoff AND attribute_exists(#gsi9pk)',
    );
    expect(scanCmd.input.ExpressionAttributeNames['#status']).toBe('status');
    expect(scanCmd.input.ExpressionAttributeNames['#gsi9pk']).toBe('GSI9PK');
    expect(scanCmd.input.ExpressionAttributeValues[':resolving']).toBe('RESOLVING');
  });
});
