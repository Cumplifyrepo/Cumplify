/**
 * Unit tests for tool-loop module.
 * Verifies: end_turn exits; tool_use dispatches; loop guard throws; HITL tool triggers gate.
 *
 * C-1 (Task 8R): invokeFn is injected via opts — no module mock of ai-invoker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the HITL gate
const mockEnterHitlGate = vi.fn();
vi.mock('../hitl.js', () => ({
  enterHitlGate: (...args: unknown[]) => mockEnterHitlGate(...args),
}));

const { toolLoop, LoopGuardError } = await import('../tool-loop.js');

function baseOpts(overrides: Partial<Parameters<typeof toolLoop>[1]> = {}) {
  return {
    seat: 'workhorse' as const,
    systemPrompt: 'You are a helpful agent.',
    tools: [
      { toolSpec: { name: 'read-data', description: 'Read data', inputSchema: { json: {} } } },
    ],
    tenantId: 'tenant-1',
    agent: 'CAPAGuru',
    module: 'M2',
    feature: 'capa',
    hitlTools: new Set(['capa-open']),
    dispatchTool: vi.fn().mockResolvedValue({ output: 'tool result' }),
    invokeFn: vi.fn(), // C-1: injected, not mocked at module level
    ...overrides,
  };
}

const endTurnResponse = (text = 'final answer') => ({
  text,
  toolUseBlocks: [],
  stopReason: 'end_turn',
  usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
  credits: 0.5,
  modelId: 'us.amazon.nova-pro-v1:0',
  seat: 'workhorse',
});

const toolUseResponse = (toolName: string, input: unknown) => ({
  text: '',
  toolUseBlocks: [{ toolUseId: 'tu-1', name: toolName, input }],
  stopReason: 'tool_use',
  usage: { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
  credits: 0.5,
  modelId: 'us.amazon.nova-pro-v1:0',
  seat: 'workhorse',
});

describe('toolLoop', () => {
  beforeEach(() => {
    mockEnterHitlGate.mockReset();
  });

  it('returns immediately on end_turn', async () => {
    const invokeFn = vi.fn().mockResolvedValueOnce(endTurnResponse('done'));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'hello' }] }],
      baseOpts({ invokeFn }),
    );

    expect(result.finalResponse).toBe('done');
    expect(result.turns).toBe(1);
    expect(invokeFn).toHaveBeenCalledTimes(1);
  });

  it('dispatches non-HITL tools and continues loop', async () => {
    const dispatchTool = vi.fn().mockResolvedValue({ output: { data: 'result' } });
    const invokeFn = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse('read-data', { id: '123' }))
      .mockResolvedValueOnce(endTurnResponse('processed'));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'fetch data' }] }],
      baseOpts({ dispatchTool, invokeFn }),
    );

    expect(result.finalResponse).toBe('processed');
    expect(result.turns).toBe(2);
    expect(dispatchTool).toHaveBeenCalledWith('read-data', { id: '123' }, 'tenant-1');
  });

  it('enters HITL gate when a HITL-gated tool is called', async () => {
    mockEnterHitlGate.mockResolvedValueOnce({
      status: 'HITL_PENDING',
      executionArn: 'arn:aws:states:us-east-1:123:execution:hitl-abc',
      hitlItemId: 'hitl-001',
    });

    const invokeFn = vi.fn().mockResolvedValueOnce(toolUseResponse('capa-open', { ncId: 'nc-1' }));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'open capa' }] }],
      baseOpts({ invokeFn }),
    );

    expect(result.hitlResult).toBeDefined();
    expect(result.hitlResult!.status).toBe('HITL_PENDING');
    expect(result.hitlResult!.executionArn).toContain('hitl-abc');
    expect(mockEnterHitlGate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        agentName: 'CAPAGuru',
        proposedAction: { tool: 'capa-open', args: { ncId: 'nc-1' } },
      }),
    );
  });

  it('throws LoopGuardError after MAX_TURNS (10)', async () => {
    const invokeFn = vi.fn().mockResolvedValue(toolUseResponse('read-data', {}));
    const dispatchTool = vi.fn().mockResolvedValue({ output: 'ok' });

    await expect(
      toolLoop(
        [{ role: 'user', content: [{ text: 'infinite' }] }],
        baseOpts({ dispatchTool, invokeFn }),
      ),
    ).rejects.toThrow(LoopGuardError);

    expect(invokeFn).toHaveBeenCalledTimes(10);
  });

  it('accumulates token usage across turns', async () => {
    const invokeFn = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse('read-data', {}))
      .mockResolvedValueOnce(endTurnResponse('done'));
    const dispatchTool = vi.fn().mockResolvedValue({ output: 'ok' });

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'go' }] }],
      baseOpts({ dispatchTool, invokeFn }),
    );

    expect(result.totalUsage.inputTokens).toBe(200); // 100 per turn × 2
    expect(result.totalUsage.outputTokens).toBe(100); // 50 per turn × 2
  });

  it('handles stop stopReason as end_turn', async () => {
    const invokeFn = vi.fn().mockResolvedValueOnce({
      ...endTurnResponse('stopped'),
      stopReason: 'stop',
    });

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'hi' }] }],
      baseOpts({ invokeFn }),
    );

    expect(result.finalResponse).toBe('stopped');
    expect(result.turns).toBe(1);
  });

  it('RS-8: threads requestedBy to enterHitlGate for user-triggered runs (SOD-1)', async () => {
    mockEnterHitlGate.mockResolvedValueOnce({
      status: 'HITL_PENDING',
      executionArn: 'arn:aws:states:us-east-1:123:execution:hitl-req',
      hitlItemId: 'hitl-req-1',
    });
    const invokeFn = vi.fn().mockResolvedValueOnce(toolUseResponse('capa-open', { ncId: 'nc-1' }));

    await toolLoop(
      [{ role: 'user', content: [{ text: 'open capa' }] }],
      baseOpts({ invokeFn, requestedBy: 'user-42' }),
    );

    expect(mockEnterHitlGate).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: 'user-42' }),
    );
  });

  it('omits requestedBy entirely for event-triggered runs (no human proposer)', async () => {
    mockEnterHitlGate.mockResolvedValueOnce({
      status: 'HITL_PENDING',
      executionArn: 'arn:aws:states:us-east-1:123:execution:hitl-noreq',
      hitlItemId: 'hitl-noreq-1',
    });
    const invokeFn = vi.fn().mockResolvedValueOnce(toolUseResponse('capa-open', { ncId: 'nc-1' }));

    await toolLoop([{ role: 'user', content: [{ text: 'open capa' }] }], baseOpts({ invokeFn }));

    const call = mockEnterHitlGate.mock.calls[0][0];
    expect('requestedBy' in call).toBe(false);
  });

  it('handles dynamic HITL (dispatchTool returns requiresHitl=true)', async () => {
    mockEnterHitlGate.mockResolvedValueOnce({
      status: 'HITL_PENDING',
      executionArn: 'arn:aws:states:us-east-1:123:execution:dyn-hitl',
      hitlItemId: 'hitl-dyn',
    });

    const invokeFn = vi.fn().mockResolvedValueOnce(toolUseResponse('read-data', { id: '99' }));
    const dispatchTool = vi.fn().mockResolvedValue({ output: 'blocked', requiresHitl: true });

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'do it' }] }],
      baseOpts({ invokeFn, dispatchTool }),
    );

    expect(result.hitlResult).toBeDefined();
    expect(result.hitlResult!.hitlItemId).toBe('hitl-dyn');
  });
});
