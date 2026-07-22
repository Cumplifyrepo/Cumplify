/**
 * DocStudio handler dispatch tests (S2 studio wave).
 * Pins: handler() dispatches SQS-shaped events to the SQS path, draftIntent
 * payloads to runDocDraft; requestedBy threads to toolLoop (SOD-1);
 * doc-draft is HITL-gated; DRAFT MODE message carries the intent.
 * Mocks toolLoop directly — DocStudio's dispatch/message logic is under
 * test, not Bedrock/HITL internals.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToolLoop, mockSqsHandler, mockRetrieve } = vi.hoisted(() => ({
  mockToolLoop: vi.fn(),
  mockSqsHandler: vi.fn(),
  mockRetrieve: vi.fn(),
}));

vi.mock('../../shared/tool-loop.js', () => ({
  toolLoop: (...args: unknown[]) => mockToolLoop(...args),
}));

vi.mock('../../shared/invoke-transport.js', () => ({
  createInvokeFn: () => vi.fn(),
  // S2.1: real embeddings replaced the placeholder vector
  createEmbedFn: () => vi.fn().mockResolvedValue({ embedding: Array(1024).fill(0.2) }),
}));

vi.mock('../../shared/retrieval.js', () => ({
  retrieve: (...args: unknown[]) => mockRetrieve(...args),
}));

vi.mock('../../../eventing/src/consumer.js', () => ({
  createHandler: () => mockSqsHandler,
}));

beforeEach(() => {
  mockToolLoop.mockReset();
  mockSqsHandler.mockReset();
  mockRetrieve.mockReset();
  mockRetrieve.mockResolvedValue({ chunks: [] });
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
    const content = messages[0].content as Array<Record<string, string>>;
    const preamble = content[0].text;
    expect(preamble).toContain('DRAFT MODE');
    expect(preamble).toContain('doc-draft');
    // S2.1: the tenant-typed intent rides in guardedText (selective
    // PROMPT_ATTACK evaluation) — the trusted framing must NOT contain it.
    const guarded = content.filter((b) => 'guardedText' in b).map((b) => b.guardedText);
    expect(guarded).toContain('A procedure for controlling subcontractor site work');
    expect(preamble).not.toContain('subcontractor site work');
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

  it('grounding (S2.2): iso-kb queried as ISO canon, tenant-docs as the tenant; a failed leg never discards the other', async () => {
    // Live 2026-07-22: tenant-docs 404s (no indexer yet) and Promise.all
    // threw away a SUCCEEDED iso-kb result; iso-kb filtered by the caller's
    // tenantId returned 0 rows (canon chunks live under __ISO_CANON__).
    mockRetrieve.mockImplementation(async (req: { indexName: string }) => {
      if (req.indexName === 'cumplify-tenant-docs') {
        throw new Error('AOSS search failed: 404 index_not_found_exception');
      }
      return { chunks: [{ text: 'iso canon chunk 8.1', score: 0.9, metadata: {} }] };
    });
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    await runDocDraft(draftInput);

    const calls = mockRetrieve.mock.calls.map((c) => c[0] as { indexName: string; tenantId: string });
    expect(calls.find((c) => c.indexName === 'cumplify-iso-kb')!.tenantId).toBe('__ISO_CANON__');
    expect(calls.find((c) => c.indexName === 'cumplify-tenant-docs')!.tenantId).toBe('tenant-1');
    // The surviving iso leg still reaches the prompt
    const [messages] = mockToolLoop.mock.calls[0];
    expect(JSON.stringify(messages[0].content)).toContain('iso canon chunk 8.1');
  });
});
