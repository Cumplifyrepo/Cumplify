/**
 * LeadAuditor handler dispatch tests (S4 Audit Studio).
 * Pins: SQS-shaped events route to the SQS path; findingsIntent payloads to
 * runAuditFindings; FINDINGS MODE carries auditId/checklist/prior findings;
 * requestedBy threads (SOD-1); audit-finding-write HITL-gated.
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
  process.env.LEAD_AUDITOR_DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123/la-dlq';
  process.env.AOSS_ISO_KB_ENDPOINT = 'https://mock.aoss.amazonaws.com';
  process.env.AOSS_TENANT_DOCS_ENDPOINT = 'https://mock2.aoss.amazonaws.com';
});

import { handler, runAuditFindings } from '../handler.js';

const findingsInput = {
  tenantId: 'tenant-1',
  runId: 'run-66',
  requestedBy: 'user-9',
  findingsIntent: {
    auditId: 'audit-31',
    audit: { standard: 'ISO9001', scope: 'Fabrication shop', status: 'in_progress' },
    checklist: [
      { clauseRef: '8.5.1', question: 'Is production controlled?', expectedEvidence: 'Work orders' },
    ],
    priorFindings: [{ findingType: 'observation', clauseRef: '7.2', description: 'Training log gap' }],
  },
};

describe('LeadAuditor handler() dispatch', () => {
  it('routes SQS-shaped events to the SQS path', async () => {
    mockSqsHandler.mockResolvedValueOnce({ batchItemFailures: [] });
    const sqsEvent = { Records: [{ body: '{}' }] };
    const result = await handler(sqsEvent as never);
    expect(mockSqsHandler).toHaveBeenCalledWith(sqsEvent);
    expect(mockToolLoop).not.toHaveBeenCalled();
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('routes findingsIntent payloads to runAuditFindings', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
      hitlResult: { hitlItemId: 'h-4' },
    });
    const result = await handler(findingsInput);
    expect(mockSqsHandler).not.toHaveBeenCalled();
    expect(result).toEqual({ runId: 'run-66', status: 'PENDING_APPROVAL' });
  });
});

describe('runAuditFindings (S4)', () => {
  it('FINDINGS MODE carries audit context, checklist, prior findings; requestedBy threaded; finding HITL-gated', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    await runAuditFindings(findingsInput);

    const [messages, opts] = mockToolLoop.mock.calls[0];
    const text = messages[0].content[0].text as string;
    expect(text).toContain('FINDINGS MODE');
    expect(text).toContain('audit-31');
    expect(text).toContain('8.5.1');
    expect(text).toContain('Is production controlled?');
    expect(text).toContain('Training log gap');
    expect(text).toContain('do NOT duplicate');
    expect(opts.requestedBy).toBe('user-9');
    expect(opts.feature).toBe('audit-findings');
    expect(opts.agent).toBe('LeadAuditor');
    expect(opts.hitlTools.has('audit-finding-write')).toBe(true);
  });

  it('grounding queries iso-kb as ISO canon and tenant-docs as the tenant (S2.2 lessons applied at build time)', async () => {
    mockToolLoop.mockResolvedValueOnce({
      finalResponse: 'ok',
      turns: 1,
      totalUsage: { inputTokens: 1, outputTokens: 1 },
    });

    await runAuditFindings(findingsInput);

    const calls = mockRetrieve.mock.calls.map((c) => c[0] as { indexName: string; tenantId: string });
    expect(calls.find((c) => c.indexName === 'cumplify-iso-kb')!.tenantId).toBe('__ISO_CANON__');
    expect(calls.find((c) => c.indexName === 'cumplify-tenant-docs')!.tenantId).toBe('tenant-1');
  });
});
