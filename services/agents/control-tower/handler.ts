/**
 * ControlTower agent handler — SQS consumer (ControlTowerQueue, standard).
 * Owns cross-standard governance: roles, authorities, task routing.
 *
 * Flow: SQS event → retrieve tenant docs (AOSS) → tool-loop (Converse) →
 * HITL gate on ct-governance-write → approval → ExecuteWriteback → audit.
 */

import { createHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { retrieve } from '../shared/retrieval.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import { CONTROL_TOWER_PROMPT } from './prompt.js';
import { CONTROL_TOWER_TOOLS } from './tools.js';

const DLQ_URL = process.env.CONTROL_TOWER_DLQ_URL!;
const AOSS_TENANT_DOCS_ENDPOINT = process.env.AOSS_TENANT_DOCS_ENDPOINT!;

const HITL_TOOLS = new Set(['ct-governance-write']);

async function processEvent(event: CumplifyEvent, _detailType: string): Promise<void> {
  const { tenantId } = event;
  const description = (event.payload as Record<string, unknown>).description as string ?? '';

  let groundingContext = '';
  if (description) {
    try {
      const placeholderVector = Array(1024).fill(0.01);
      const results = await retrieve({
        tenantId,
        collectionEndpoint: AOSS_TENANT_DOCS_ENDPOINT,
        indexName: 'cumplify-tenant-docs',
        queryText: description,
        queryVector: placeholderVector,
        topK: 3,
      });
      groundingContext = results.chunks.map(c => c.text).join('\n---\n');
    } catch {
      // Retrieval failure is non-blocking
    }
  }

  const userMessage = [
    `A governance task has been raised. Analyze and take appropriate action.`,
    `\nEvent: ${JSON.stringify(event.payload)}`,
    groundingContext ? `\nRelevant tenant documents:\n${groundingContext}` : '',
  ].join('');

  await toolLoop(
    [{ role: 'user', content: [{ text: userMessage }] }],
    {
      seat: 'workhorse',
      systemPrompt: CONTROL_TOWER_PROMPT,
      tools: CONTROL_TOWER_TOOLS,
      tenantId,
      agent: 'ControlTower',
      module: 'cross-standard',
      feature: 'governance',
      hitlTools: HITL_TOOLS,
      dispatchTool: async (toolName, input, tid) => {
        return { output: { toolName, input, tenantId: tid }, requiresHitl: false };
      },
    },
  );
}

export const handler = createHandler({
  dlqUrl: DLQ_URL,
  handler: processEvent,
});
