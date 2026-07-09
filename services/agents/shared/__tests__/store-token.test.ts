/**
 * Unit tests for store-token Lambda (Task 8R-2).
 * Verifies: upsert creates full HITL item with GSI9PK/GSI9SK + taskToken;
 * no ConditionExpression (native upsert); idempotent on re-delivery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDdbSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockDdbSend; },
  UpdateItemCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
}));

vi.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: (obj: unknown) => obj, // pass-through for assertion simplicity
}));

vi.stubEnv('TABLE_NAME', 'CumplifyCore');

const { handler } = await import('../store-token.js');

describe('store-token handler', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
    mockDdbSend.mockResolvedValue({});
  });

  it('writes full HITL item with GSI9PK/GSI9SK (D-2 sparse projection)', async () => {
    const result = await handler({
      taskToken: 'sfn-token-abc-123',
      input: {
        tenantId: 'tenant-1',
        hitlItemId: '01HXYZ',
        agentName: 'CAPAGuru',
        proposedAction: { tool: 'capa-open', args: { ncId: 'nc-1' } },
        createdAt: '2026-07-09T12:00:00.000Z',
      },
    });

    expect(result).toEqual({ stored: true });

    const call = mockDdbSend.mock.calls[0][0];
    const params = call.input;

    // Key
    expect(params.Key.PK).toBe('TENANT#tenant-1#HITL');
    expect(params.Key.SK).toBe('PENDING#01HXYZ');

    // UpdateExpression sets all fields
    const expr: string = params.UpdateExpression;
    expect(expr).toContain('itemType = :itemType');
    expect(expr).toContain('agentName = :agentName');
    expect(expr).toContain('proposedAction = :proposedAction');
    expect(expr).toContain('createdAt = :createdAt');
    expect(expr).toContain('#status = :status');
    expect(expr).toContain('taskToken = :taskToken');
    expect(expr).toContain('tokenStoredAt = :tokenStoredAt');
    expect(expr).toContain('GSI9PK = :gsi9pk');
    expect(expr).toContain('GSI9SK = :gsi9sk');

    // Values
    const vals = params.ExpressionAttributeValues;
    expect(vals[':itemType']).toBe('HITL_PENDING');
    expect(vals[':agentName']).toBe('CAPAGuru');
    expect(vals[':proposedAction']).toEqual({ tool: 'capa-open', args: { ncId: 'nc-1' } });
    expect(vals[':createdAt']).toBe('2026-07-09T12:00:00.000Z');
    expect(vals[':status']).toBe('PENDING');
    expect(vals[':taskToken']).toBe('sfn-token-abc-123');
    expect(vals[':gsi9pk']).toBe('TENANT#tenant-1#HITL_PENDING');
    expect(vals[':gsi9sk']).toBe('2026-07-09T12:00:00.000Z');
  });

  it('has NO ConditionExpression (native upsert, idempotent on re-delivery)', async () => {
    await handler({
      taskToken: 'token-xyz',
      input: {
        tenantId: 'tenant-2',
        hitlItemId: '02ABC',
        agentName: 'DocStudio',
        proposedAction: { tool: 'doc-publish', args: {} },
        createdAt: '2026-07-09T13:00:00.000Z',
      },
    });

    const call = mockDdbSend.mock.calls[0][0];
    // No ConditionExpression — upsert behavior
    expect(call.input.ConditionExpression).toBeUndefined();
  });

  it('GSI9PK uses TENANT# prefix (FF-5 convention)', async () => {
    await handler({
      taskToken: 'token-ff5',
      input: {
        tenantId: 'tenant-prefix-test',
        hitlItemId: '03DEF',
        agentName: 'RecordsVault',
        proposedAction: { tool: 'records-retention-schedule', args: {} },
        createdAt: '2026-07-09T14:00:00.000Z',
      },
    });

    const call = mockDdbSend.mock.calls[0][0];
    const vals = call.input.ExpressionAttributeValues;
    expect(vals[':gsi9pk']).toBe('TENANT#tenant-prefix-test#HITL_PENDING');
    expect(vals[':gsi9pk']).toMatch(/^TENANT#/);
  });
});
