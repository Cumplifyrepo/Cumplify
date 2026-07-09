/**
 * Unit tests for HITL gate module.
 * Verifies: SFN startExecution called; DynamoDB HITL_PENDING item written with correct GSI PK;
 * resolved items remove GSI attribute.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSfnSend = vi.fn();
const mockDdbSend = vi.fn();

vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: class { send = mockSfnSend; },
  StartExecutionCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class { send = mockDdbSend; },
  PutItemCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
  UpdateItemCommand: class {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
}));

vi.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: (obj: unknown) => obj, // pass-through for assertion simplicity
}));

vi.stubEnv('TABLE_NAME', 'CumplifyCore');
vi.stubEnv('HITL_STATE_MACHINE_ARN', 'arn:aws:states:us-east-1:123456:stateMachine:AgentHitl');

const { enterHitlGate, resolveHitlItem } = await import('../hitl.js');

describe('enterHitlGate', () => {
  beforeEach(() => {
    mockSfnSend.mockReset();
    mockDdbSend.mockReset();
  });

  it('starts SFN execution with correct input', async () => {
    mockSfnSend.mockResolvedValueOnce({ executionArn: 'arn:aws:states:us-east-1:123:execution:hitl-test' });
    mockDdbSend.mockResolvedValueOnce({});

    const result = await enterHitlGate({
      tenantId: 'tenant-1',
      agentName: 'CAPAGuru',
      proposedAction: { tool: 'capa-open', args: { ncId: 'nc-1' } },
      conversationState: [{ role: 'user', content: [{ text: 'hello' }] }],
    });

    expect(result.status).toBe('HITL_PENDING');
    expect(result.executionArn).toContain('hitl-test');

    // Verify SFN was called
    const sfnCall = mockSfnSend.mock.calls[0][0];
    expect(sfnCall.input.stateMachineArn).toBe('arn:aws:states:us-east-1:123456:stateMachine:AgentHitl');
    const sfnInput = JSON.parse(sfnCall.input.input);
    expect(sfnInput.tenantId).toBe('tenant-1');
    expect(sfnInput.agentName).toBe('CAPAGuru');
    expect(sfnInput.proposedAction.tool).toBe('capa-open');
  });

  it('writes DynamoDB HITL_PENDING item with correct GSI PK (D-2)', async () => {
    mockSfnSend.mockResolvedValueOnce({ executionArn: 'arn:exec:123' });
    mockDdbSend.mockResolvedValueOnce({});

    await enterHitlGate({
      tenantId: 'tenant-abc',
      agentName: 'DocStudio',
      proposedAction: { tool: 'doc-publish', args: { docId: 'd-1' } },
      conversationState: [],
    });

    const ddbCall = mockDdbSend.mock.calls[0][0];
    const item = ddbCall.input.Item;

    // Base keys
    expect(item.PK).toBe('TENANT#tenant-abc#HITL');
    expect(item.SK).toMatch(/^PENDING#/);
    expect(item.itemType).toBe('HITL_PENDING');
    expect(item.status).toBe('PENDING');

    // GSI keys (D-2: TENANT#<tenantId>#HITL_PENDING — tenant-isolated, via GSI9)
    expect(item.GSI9PK).toBe('TENANT#tenant-abc#HITL_PENDING');
    expect(item.GSI9SK).toBeDefined(); // createdAt ISO string

    // Agent/action
    expect(item.agentName).toBe('DocStudio');
    expect(item.proposedAction.tool).toBe('doc-publish');
  });
});

describe('resolveHitlItem', () => {
  beforeEach(() => {
    mockDdbSend.mockReset();
  });

  it('removes GSI attributes on resolution (sparse GSI pattern)', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    await resolveHitlItem('tenant-1', 'hitl-001', 'APPROVED', 'user-sub-xyz');

    const ddbCall = mockDdbSend.mock.calls[0][0];
    const updateExpr: string = ddbCall.input.UpdateExpression;

    // Must REMOVE GSI9 attributes (sparse GSI pattern)
    expect(updateExpr).toContain('REMOVE GSI9PK, GSI9SK');
    // Must SET status + resolvedAt + approver + TTL
    expect(updateExpr).toContain('SET #status = :status');
    expect(ddbCall.input.ExpressionAttributeValues[':status']).toBe('APPROVED');
    expect(ddbCall.input.ExpressionAttributeValues[':approver']).toBe('user-sub-xyz');
  });

  it('sets TTL to ~30 days from now', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    await resolveHitlItem('tenant-1', 'hitl-002', 'TIMED_OUT');

    const ddbCall = mockDdbSend.mock.calls[0][0];
    const ttl = ddbCall.input.ExpressionAttributeValues[':ttl'];
    const thirtyDaysFromNow = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    // Allow 10s tolerance
    expect(ttl).toBeGreaterThan(thirtyDaysFromNow - 10);
    expect(ttl).toBeLessThan(thirtyDaysFromNow + 10);
  });
});
