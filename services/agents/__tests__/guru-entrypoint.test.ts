/**
 * Guru AppSync entrypoint tests (Task 8R-2 hotfix, architect).
 *
 * Pins the defect class found at 8R-2 validation: guru handler modules exported
 * only handleQuery() — no `handler` entrypoint — so every AppSync invocation
 * would fail with Runtime.HandlerNotFound. Also pins the security contract:
 * tenantId comes ONLY from the authorizer's resolverContext (fail-closed),
 * never from client arguments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = mockSend;
  },
  InvokeCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.stubEnv('AI_INVOKER_ARN', 'arn:aws:lambda:us-east-1:000000000000:function:ai-invoker');
vi.stubEnv('AOSS_ISO_KB_ENDPOINT', 'https://example.aoss.amazonaws.com');

const GURUS = [
  { name: 'guru-9001', mod: () => import('../guru-9001/handler.js') },
  { name: 'guru-14001', mod: () => import('../guru-14001/handler.js') },
  { name: 'guru-45001', mod: () => import('../guru-45001/handler.js') },
] as const;

function invokerPayload(text: string): Uint8Array {
  return Buffer.from(JSON.stringify({ text, usage: { inputTokens: 1, outputTokens: 1 } }));
}

describe('guru AppSync entrypoints', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ Payload: invokerPayload('advisory answer') });
  });

  for (const guru of GURUS) {
    describe(guru.name, () => {
      it('exports a `handler` entrypoint (CDK wires handler: "handler")', async () => {
        const mod = await guru.mod();
        expect(typeof (mod as Record<string, unknown>).handler).toBe('function');
      });

      it('FAIL-CLOSED: throws Unauthorized when resolverContext.tenantId is absent', async () => {
        const { handler } = (await guru.mod()) as { handler: (e: unknown) => Promise<string> };
        await expect(handler({ arguments: { question: 'What is clause 4.1?' } })).rejects.toThrow(
          /Unauthorized/,
        );
        // tenantId in client ARGUMENTS must not be accepted as identity
        await expect(
          handler({
            arguments: { question: 'q', tenantId: 'tenant-EVIL' },
            identity: { resolverContext: {} },
          }),
        ).rejects.toThrow(/Unauthorized/);
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('answers with tenantId from resolverContext; no vector → ungrounded (no AOSS call)', async () => {
        const { handler } = (await guru.mod()) as { handler: (e: unknown) => Promise<string> };
        const answer = await handler({
          arguments: { question: 'What is clause 4.1?' },
          identity: { resolverContext: { tenantId: 'tenant-AAA' } },
        });
        expect(answer).toBe('advisory answer');
        // one-door transport used exactly once
        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });
  }
});
