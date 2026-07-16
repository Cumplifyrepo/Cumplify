/**
 * CAPAGuru agent handler — SQS consumer (CapaIntakeQueue, FIFO).
 * Owns M2 CAPA: proposes corrective actions from NC/incident events.
 *
 * Flow: SQS event → retrieve similar NCs (AOSS) → tool-loop (Converse) →
 * HITL gate on mutating tools (capa-open) → approval → ExecuteWriteback → audit.
 *
 * Uses: createFifoHandler (eventing consumer lib), toolLoop (shared), retrieve (shared).
 * Calls AI Invoker via lambda:InvokeFunction (AgentHandlerReadOnlyPolicy).
 */

import { createFifoHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { createInvokeFn } from '../shared/invoke-transport.js';
import { retrieve } from '../shared/retrieval.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import { CAPA_GURU_PROMPT } from './prompt.js';
import { CAPA_GURU_TOOLS } from './tools.js';

const DLQ_URL = process.env.DLQ_URL!;
const AOSS_ENDPOINT = process.env.AOSS_NC_HISTORY_ENDPOINT!;

const HITL_TOOLS = new Set(['capa-open', 'capa-verify-effectiveness']);
const invokeFn = createInvokeFn();

async function processEvent(event: CumplifyEvent, _detailType: string): Promise<void> {
  const { tenantId } = event;
  const ncDescription = ((event.payload as Record<string, unknown>).description as string) ?? '';

  // Retrieve similar past NCs for grounding (REQ-RET-6)
  let groundingContext = '';
  if (ncDescription) {
    try {
      // Note: in production, queryVector is computed by calling Titan Embed v2.
      // For now, placeholder — the embedding step is integrated at Task 9 deploy.
      const placeholderVector = Array(1024).fill(0.01);
      const results = await retrieve({
        tenantId,
        collectionEndpoint: AOSS_ENDPOINT,
        indexName: 'cumplify-nc-history',
        queryText: ncDescription,
        queryVector: placeholderVector,
        topK: 3,
      });
      groundingContext = results.chunks.map((c) => c.text).join('\n---\n');
    } catch {
      // AOSS retrieval failure is non-blocking for CAPAGuru — proceed without grounding
    }
  }

  // Build initial message with event context + grounding
  const userMessage = [
    `A nonconformity has been raised. Analyze and propose a corrective action.`,
    `\nEvent: ${JSON.stringify(event.payload)}`,
    groundingContext ? `\nSimilar past NCs for reference:\n${groundingContext}` : '',
  ].join('');

  // Tool-loop: may invoke Converse multiple times, dispatch tools, enter HITL gate
  await toolLoop([{ role: 'user', content: [{ text: userMessage }] }], {
    seat: 'workhorse',
    systemPrompt: CAPA_GURU_PROMPT,
    tools: CAPA_GURU_TOOLS,
    tenantId,
    agent: 'CAPAGuru',
    module: 'M2',
    feature: 'capa-intake',
    hitlTools: HITL_TOOLS,
    invokeFn,
    dispatchTool: async (toolName, input, tid) => {
      // Non-HITL tools execute directly (read-only / advisory)
      // HITL tools are caught by the tool-loop and routed to the gate
      return { output: { toolName, input, tenantId: tid }, requiresHitl: false };
    },
  });
}

export const handler = createFifoHandler({
  fifo: true,
  dlqUrl: DLQ_URL,
  handler: processEvent,
  idempotentErrors: [],
});
