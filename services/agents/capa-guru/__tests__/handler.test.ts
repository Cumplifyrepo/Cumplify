/**
 * CAPAGuru handler dispatch tests (RS-8, read-surface-completion).
 * Pins: handler() dispatches SQS-shaped events to the SQS path, everything
 * else to the new direct-invoke runCapaAnalysis path (Lambda always calls
 * the SAME configured handler regardless of trigger type — this dispatch
 * is the only thing standing between the two); requestedBy threads through
 * to toolLoop for SOD-1; stage-aware context (existing CAs) lands in the
 * prompt message; status reflects whether a proposal (HITL gate) resulted.
 *
 * Mocks toolLoop directly — CAPAGuru's OWN dispatch/message-building logic
 * is what's under test, not Bedrock/HITL internals (already covered by
 * tool-loop.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToolLoop, mockSqsHandler } = vi.hoisted(() => ({
  mockToolLoop: vi.fn(),
  mockSqsHandler: vi.fn(),
}));

vi.mock('../../shared/tool-loop.js', () => ({
  toolLoop: (...args: unknown[]) => mockToolLoop(...args),
}));

vi.mock('../../shared/invoke-transport.js', () => ({
  createInvokeFn: () => vi.fn(),
}));

vi.mock('../../shared/retrieval.js', () => ({
  retrieve: vi.fn().mockResolvedValue({ chunks: [] }),
}));

vi.mock('../../../eventing/src/consumer.js', () => ({
  createFifoHandler: () => mockSqsHandler,
}));

beforeEach(() => {
  mockToolLoop.mockReset();
  mockSqsHandler.mockReset();
  process.env.DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123/dlq.fifo';
  process.env.AOSS_NC_HISTORY_ENDPOINT = 'https://mock.aoss.amazonaws.com';
});

import { handler, runCapaAnalysis, runNcIntake } from '../handler.js';

describe('CAPAGuru handler() dispatch', () => {
  it('routes SQS-shaped events ({Records:[...]}) to the SQS path', async () => {
    mockSqsHandler.mockResolvedValueOnce({ batchItemFailures: [] });
    const sqsEvent = { Records: [{ body: '{}' }] };

    const result = await handler(sqsEvent as never);

    expect(mockSqsHandler).toHaveBeenCalledWith(sqsEvent);
    expect(mockToolLoop).not.toHaveBeenCalled();
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('routes direct-invoke payloads (no Records key) to runCapaAnalysis', async () => {
    mockToolLoop.mockResolvedValueOnce({ finalResponse: 'ok', turns: 1, totalUsage: { inputTokens: 1, outputTokens: 1 } });
    const input = {
      tenantId: 'tenant-1',
      runId: 'run-1',
      ncId: 'nc-1',
      requestedBy: 'user-9',
      context: {
        nc: { description: 'desc', ncType: 'nc', severity: 'high', standard: 'ISO9001' as const, status: 'open' },
        correctiveActions: [],
      },
    };

    const result = await handler(input);

    expect(mockSqsHandler).not.toHaveBeenCalled();
    expect(mockToolLoop).toHaveBeenCalledOnce();
    expect(result).toEqual({ runId: 'run-1', status: 'NO_PROPOSAL' });
  });
});

describe('runCapaAnalysis', () => {
  const baseInput = {
    tenantId: 'tenant-1',
    runId: 'run-42',
    ncId: 'nc-1',
    requestedBy: 'user-9',
    context: {
      nc: {
        description: 'Widget cracked in transit',
        ncType: 'nonconforming_output',
        severity: 'high',
        standard: 'ISO9001' as const,
        status: 'open',
      },
      correctiveActions: [],
    },
  };

  it('threads requestedBy + all four HITL tools into toolLoop (SOD-1, stage-aware set + S1 intake)', async () => {
    mockToolLoop.mockResolvedValueOnce({ finalResponse: 'ok', turns: 1, totalUsage: { inputTokens: 1, outputTokens: 1 } });

    await runCapaAnalysis(baseInput);

    const [, opts] = mockToolLoop.mock.calls[0];
    expect(opts.requestedBy).toBe('user-9');
    expect(opts.hitlTools).toEqual(
      new Set(['nc-draft-write', 'nc-triage-write', 'capa-open', 'capa-verify-effectiveness']),
    );
    expect(opts.agent).toBe('CAPAGuru');
    expect(opts.module).toBe('M2');
  });

  it('includes existing corrective actions in the prompt message (stage context)', async () => {
    mockToolLoop.mockResolvedValueOnce({ finalResponse: 'ok', turns: 1, totalUsage: { inputTokens: 1, outputTokens: 1 } });

    await runCapaAnalysis({
      ...baseInput,
      context: {
        ...baseInput.context,
        correctiveActions: [{ id: 'ca-1', actionDesc: 'Retrain packers', status: 'open', ownerId: 'owner-1' }],
      },
    });

    const [messages] = mockToolLoop.mock.calls[0];
    const text = messages[0].content[0].text;
    expect(text).toContain('ca-1');
    expect(text).toContain('Retrain packers');
    expect(text).toContain('status=open');
  });

  it('status is PENDING_APPROVAL when toolLoop enters the HITL gate', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'proposed',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
      hitlResult: { status: 'HITL_PENDING', executionArn: 'arn:x', hitlItemId: 'hitl-1' },
    });

    const result = await runCapaAnalysis(baseInput);
    expect(result).toEqual({ runId: 'run-42', status: 'PENDING_APPROVAL' });
  });

  it('status is NO_PROPOSAL when the model does not call a tool', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'Already at a later stage than I can address.',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await runCapaAnalysis(baseInput);
    expect(result).toEqual({ runId: 'run-42', status: 'NO_PROPOSAL' });
  });
});

describe('runNcIntake (S1 studio wave)', () => {
  const intakeInput = {
    tenantId: 'tenant-1',
    runId: 'run-77',
    requestedBy: 'user-9',
    intake: {
      description: 'Cabinet doors delivered with wrong finish on lot 42',
      evidenceNote: 'Photos in job folder',
    },
  };

  it('handler() routes intake-shaped events to runNcIntake', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await handler(intakeInput);

    expect(mockSqsHandler).not.toHaveBeenCalled();
    expect(mockToolLoop).toHaveBeenCalledOnce();
    expect(result).toEqual({ runId: 'run-77', status: 'NO_PROPOSAL' });
  });

  it('prompts INTAKE MODE with the raw report + evidence note, requestedBy threaded (SOD-1)', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    await runNcIntake(intakeInput);

    const [messages, opts] = mockToolLoop.mock.calls[0];
    const text = messages[0].content[0].text as string;
    expect(text).toContain('INTAKE MODE');
    expect(text).toContain('Cabinet doors delivered with wrong finish on lot 42');
    expect(text).toContain('Photos in job folder');
    expect(text).toContain('nc-draft-write');
    expect(opts.requestedBy).toBe('user-9');
    expect(opts.feature).toBe('capa-intake');
    // The intake tool must be HITL-gated — the reporter never bypasses review
    expect(opts.hitlTools.has('nc-draft-write')).toBe(true);
  });

  it('status is PENDING_APPROVAL when the draft enters the HITL gate', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'proposed',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
      hitlResult: { hitlItemId: 'h-1' },
    });

    const result = await runNcIntake(intakeInput);
    expect(result).toEqual({ runId: 'run-77', status: 'PENDING_APPROVAL' });
  });
});
