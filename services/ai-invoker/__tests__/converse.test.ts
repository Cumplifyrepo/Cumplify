/**
 * Unit tests for converse module.
 * Verifies: retry on 5xx; no retry on 4xx; requestMetadata attached;
 * cachePoint present for Nova, absent for qwen/kimi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: class {
      send = mockSend;
    },
    ConverseCommand: class {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
  };
});

import { converse, resetClient } from '../src/converse.js';
import type { ConverseParams } from '../src/converse.js';

function baseParams(overrides: Partial<ConverseParams> = {}): ConverseParams {
  return {
    modelId: 'us.amazon.nova-pro-v1:0',
    messages: [{ role: 'user', content: [{ text: 'hello' }] }],
    system: 'You are a helpful assistant.',
    temperature: 0.3,
    maxTokens: 4096,
    requestMetadata: {
      tenantId: 'tenant-1',
      agent: 'CAPAGuru',
      module: 'M2',
      feature: 'capa-open',
    },
    cachingEnabled: true,
    ...overrides,
  };
}

function successResponse(text = 'response text') {
  return {
    output: { message: { content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

describe('converse', () => {
  beforeEach(() => {
    mockSend.mockReset();
    resetClient();
  });

  it('returns text and usage on successful invocation', async () => {
    mockSend.mockResolvedValueOnce(successResponse('hello world'));

    const result = await converse(baseParams());
    expect(result.text).toBe('hello world');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
  });

  it('retries on 5xx errors', async () => {
    const serverError = new Error('Internal Server Error');
    (serverError as any).$metadata = { httpStatusCode: 500 };

    mockSend.mockRejectedValueOnce(serverError).mockResolvedValueOnce(successResponse());

    const result = await converse(baseParams());
    expect(result.text).toBe('response text');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 throttle errors', async () => {
    const throttleError = new Error('Too Many Requests');
    (throttleError as any).$metadata = { httpStatusCode: 429 };

    mockSend.mockRejectedValueOnce(throttleError).mockResolvedValueOnce(successResponse());

    const result = await converse(baseParams());
    expect(result.text).toBe('response text');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx client errors (non-429)', async () => {
    const clientError = new Error('Bad Request');
    (clientError as any).$metadata = { httpStatusCode: 400 };

    mockSend.mockRejectedValueOnce(clientError);

    await expect(converse(baseParams())).rejects.toThrow('Bad Request');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const serverError = new Error('Service Unavailable');
    (serverError as any).$metadata = { httpStatusCode: 503 };

    mockSend.mockRejectedValue(serverError);

    await expect(converse(baseParams())).rejects.toThrow('Service Unavailable');
    expect(mockSend).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it('includes requestMetadata at top-level Converse param (SERVE-7, F-2 fix)', async () => {
    mockSend.mockResolvedValueOnce(successResponse());

    await converse(baseParams());

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.requestMetadata).toEqual({
      tenantId: 'tenant-1',
      agent: 'CAPAGuru',
      module: 'M2',
      feature: 'capa-open',
    });
    // Must NOT be in additionalModelRequestFields
    expect(cmd.input.additionalModelRequestFields).toBeUndefined();
  });

  it('adds cachePoint to system prompt when cachingEnabled=true (Nova)', async () => {
    mockSend.mockResolvedValueOnce(successResponse());

    await converse(baseParams({ cachingEnabled: true, system: 'System prompt.' }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.system).toHaveLength(2);
    expect(cmd.input.system[0]).toEqual({ text: 'System prompt.' });
    expect(cmd.input.system[1]).toEqual({ cachePoint: { type: 'default' } });
  });

  it('does NOT add cachePoint when cachingEnabled=false (qwen/kimi)', async () => {
    mockSend.mockResolvedValueOnce(successResponse());

    await converse(baseParams({ cachingEnabled: false, system: 'System prompt.' }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.system).toHaveLength(1);
    expect(cmd.input.system[0]).toEqual({ text: 'System prompt.' });
  });

  it('includes guardrailConfig when provided', async () => {
    mockSend.mockResolvedValueOnce(successResponse());

    await converse(
      baseParams({
        guardrailConfig: { guardrailIdentifier: 'grl-123', guardrailVersion: '1' },
      }),
    );

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.guardrailConfig).toEqual({
      guardrailIdentifier: 'grl-123',
      guardrailVersion: '1',
    });
  });

  it('maps guardedText blocks to Bedrock guardContent (selective evaluation, spec-40 Task 4)', async () => {
    mockSend.mockResolvedValueOnce(successResponse());

    await converse(
      baseParams({
        messages: [
          {
            role: 'user',
            content: [
              { text: 'Format instruction scaffolding.' },
              { guardedText: 'F1: tenant-entered fact.' },
            ],
          },
        ],
      }),
    );

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.messages[0].content).toEqual([
      { text: 'Format instruction scaffolding.' },
      { guardContent: { text: { text: 'F1: tenant-entered fact.' } } },
    ]);
  });

  it('extracts tool_use blocks from response', async () => {
    mockSend.mockResolvedValueOnce({
      output: {
        message: {
          content: [
            { toolUse: { toolUseId: 'tu-1', name: 'capa-open', input: { ncId: 'nc-123' } } },
          ],
        },
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 200, outputTokens: 100 },
    });

    const result = await converse(baseParams());
    expect(result.stopReason).toBe('tool_use');
    expect(result.toolUseBlocks).toHaveLength(1);
    expect(result.toolUseBlocks[0].name).toBe('capa-open');
    expect(result.toolUseBlocks[0].input).toEqual({ ncId: 'nc-123' });
  });
});

describe('Nova tool-use greedy decoding (Task 11 fix)', () => {
  const SAMPLE_TOOLS = [
    {
      toolSpec: {
        name: 'capa-open',
        description: 'Propose a corrective action',
        inputSchema: {
          json: { type: 'object', required: ['ncId'], properties: { ncId: { type: 'string' } } },
        },
      },
    },
  ];
  const okResponse = () => successResponse('ok');
  beforeEach(() => {
    mockSend.mockReset();
    resetClient();
  });

  it('applies greedy params (temp=1, topP=1, topK=1) for Nova WITH tools', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    await converse({ ...baseParams(), modelId: 'us.amazon.nova-pro-v1:0', tools: SAMPLE_TOOLS });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.inferenceConfig.temperature).toBe(1);
    expect(input.inferenceConfig.topP).toBe(1);
    expect(input.additionalModelRequestFields).toEqual({ inferenceConfig: { topK: 1 } });
  });

  it('keeps seat temperature for Nova WITHOUT tools', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    await converse({ ...baseParams(), modelId: 'us.amazon.nova-pro-v1:0', tools: undefined });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.inferenceConfig.temperature).toBe(baseParams().temperature);
    expect(input.additionalModelRequestFields).toBeUndefined();
  });

  it('wire-encodes hyphenated tool names (Nova A/B proven) and decodes extraction', async () => {
    mockSend.mockResolvedValueOnce({
      output: {
        message: {
          content: [{ toolUse: { toolUseId: 't1', name: 'capa_open', input: { ncId: 'x' } } }],
        },
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const result = await converse({
      ...baseParams(),
      tools: [
        {
          toolSpec: {
            name: 'capa-open',
            description: 'd',
            inputSchema: { json: { type: 'object' } },
          },
        },
      ],
    });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.toolConfig.tools[0].toolSpec.name).toBe('capa_open'); // wire
    expect(result.toolUseBlocks[0].name).toBe('capa-open'); // domain
  });

  it('keeps seat temperature for non-Nova WITH tools (qwen)', async () => {
    mockSend.mockResolvedValueOnce(okResponse());
    await converse({ ...baseParams(), modelId: 'qwen.qwen3-next-80b-a3b', tools: SAMPLE_TOOLS });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.inferenceConfig.temperature).toBe(baseParams().temperature);
    expect(input.additionalModelRequestFields).toBeUndefined();
  });
});
