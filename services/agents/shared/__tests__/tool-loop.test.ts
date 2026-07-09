/**
 * Unit tests for tool-loop module.
 * Verifies: end_turn exits; tool_use dispatches; loop guard throws; HITL tool triggers gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the invoke function
const mockInvoke = vi.fn();
vi.mock('../../../ai-invoker/src/index.js', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

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
    tools: [{ toolSpec: { name: 'read-data', description: 'Read data', inputSchema: { json: {} } } }],
    tenantId: 'tenant-1',
    agent: 'CAPAGuru',
    module: 'M2',
    feature: 'capa',
    hitlTools: new Set(['capa-open']),
    dispatchTool: vi.fn().mockResolvedValue({ output: 'tool result' }),
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
    mockInvoke.mockReset();
    mockEnterHitlGate.mockReset();
  });

  it('returns immediately on end_turn', async () => {
    mockInvoke.mockResolvedValueOnce(endTurnResponse('done'));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'hello' }] }],
      baseOpts(),
    );

    expect(result.finalResponse).toBe('done');
    expect(result.turns).toBe(1);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('dispatches non-HITL tools and continues loop', async () => {
    const dispatchTool = vi.fn().mockResolvedValue({ output: { data: 'result' } });

    mockInvoke
      .mockResolvedValueOnce(toolUseResponse('read-data', { id: '123' }))
      .mockResolvedValueOnce(endTurnResponse('processed'));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'fetch data' }] }],
      baseOpts({ dispatchTool }),
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

    mockInvoke.mockResolvedValueOnce(toolUseResponse('capa-open', { ncId: 'nc-1' }));

    const result = await toolLoop(
      [{ role: 'user', content: [{ text: 'open capa' }] }],
      baseOpts(),
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
    // Always return tool_use to exhaust the loop
    mockInvoke.mockResolvedValue(toolUseResponse('read-data', {}));
    const dispatchTool = vi.fn().mockResolvedValue({ output: 'ok' });

    await expect(
      toolLoop(
        [{ role: 'user', content: [{ text: 'infinite' }] }],
        baseOpts({ dispatchTool }),
      ),
    ).rejects.toThrow(LoopGuardError);

    expect(mockInvoke).toHaveBeenCalledTimes(10);
  });
});
