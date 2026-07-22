/**
 * DocStudio handler dispatch tests (S2 studio wave).
 * Pins: handler() dispatches SQS-shaped events to the SQS path, draftIntent
 * payloads to runDocDraft; requestedBy threads to toolLoop (SOD-1);
 * doc-draft is HITL-gated; DRAFT MODE message carries the intent.
 * Mocks toolLoop directly — DocStudio's dispatch/message logic is under
 * test, not Bedrock/HITL internals.
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
  createHandler: () => mockSqsHandler,
}));

beforeEach(() => {
  mockToolLoop.mockReset();
  mockSqsHandler.mockReset();
  process.env.DOC_STUDIO_DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123/doc-dlq';
  process.env.AOSS_ISO_KB_ENDPOINT = 'https://mock.aoss.amazonaws.com';
  process.env.AOSS_TENANT_DOCS_ENDPOINT = 'https://mock2.aoss.amazonaws.com';
});

import { handler, runDocDraft } from '../handler.js';

const draftInput = {
  tenantId: 'tenant-1',
  runId: 'run-88',
  requestedBy: 'user-9',
  draftIntent: {
    intent: 'A procedure for controlling subcontractor site work',
    docType: 'procedure',
    standard: 'ISO9001',
  },
};

describe('DocStudio handler() dispatch', () => {
  it('routes SQS-shaped events to the SQS path', async () => {
    mockSqsHandler.mockResolvedValueOnce({ batchItemFailures: [] });
    const sqsEvent = { Records: [{ body: '{}' }] };

    const result = await handler(sqsEvent as never);

    expect(mockSqsHandler).toHaveBeenCalledWith(sqsEvent);
    expect(mockToolLoop).not.toHaveBeenCalled();
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('routes draftIntent payloads to runDocDraft', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await handler(draftInput);

    expect(mockSqsHandler).not.toHaveBeenCalled();
    expect(mockToolLoop).toHaveBeenCalledOnce();
    expect(result).toEqual({ runId: 'run-88', status: 'NO_PROPOSAL' });
  });
});

describe('runDocDraft (S2)', () => {
  it('prompts DRAFT MODE with the intent; requestedBy threaded; doc-draft HITL-gated', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    await runDocDraft(draftInput);

    const [messages, opts] = mockToolLoop.mock.calls[0];
    const text = messages[0].content[0].text as string;
    expect(text).toContain('DRAFT MODE');
    expect(text).toContain('subcontractor site work');
    expect(text).toContain('doc-draft');
    expect(opts.requestedBy).toBe('user-9');
    expect(opts.feature).toBe('doc-draft');
    expect(opts.agent).toBe('DocStudio');
    // The whole-document draft must be human-gated
    expect(opts.hitlTools).toEqual(new Set(['doc-draft', 'doc-publish', 'doc-version-control']));
  });

  it('status is PENDING_APPROVAL when the draft enters the HITL gate', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'proposed',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
      hitlResult: { hitlItemId: 'h-9' },
    });

    const result = await runDocDraft(draftInput);
    expect(result).toEqual({ runId: 'run-88', status: 'PENDING_APPROVAL' });
  });
});
