/**
 * LeadAuditor agent handler — SQS consumer (LeadAuditorQueue, standard).
 * Owns M3 Audit Studio: plans audits, generates checklists, records findings.
 *
 * Flow: SQS event → retrieve ISO KB + tenant docs (AOSS) → tool-loop (Converse) →
 * HITL gate on audit-finding-write/audit-checklist-gen → approval → ExecuteWriteback → audit.
 */

import { createHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { retrieve } from '../shared/retrieval.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import { LEAD_AUDITOR_PROMPT } from './prompt.js';
import { LEAD_AUDITOR_TOOLS } from './tools.js';

const DLQ_URL = process.env.LEAD_AUDITOR_DLQ_URL!;
const AOSS_ISO_KB_ENDPOINT = process.env.AOSS_ISO_KB_ENDPOINT!;
const AOSS_TENANT_DOCS_ENDPOINT = process.env.AOSS_TENANT_DOCS_ENDPOINT!;

const HITL_TOOLS = new Set(['audit-finding-write', 'audit-checklist-gen']);

async function processEvent(event: CumplifyEvent, _detailType: string): Promise<void> {
  const { tenantId } = event;
  const description = (event.payload as Record<string, unknown>).description as string ?? '';

  let groundingContext = '';
  if (description) {
    try {
      const placeholderVector = Array(1024).fill(0.01);
      const [isoResults, tenantResults] = await Promise.all([
        retrieve({
          tenantId,
          collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
          indexName: 'cumplify-iso-kb',
          queryText: description,
          queryVector: placeholderVector,
          topK: 3,
        }),
        retrieve({
          tenantId,
          collectionEndpoint: AOSS_TENANT_DOCS_ENDPOINT,
          indexName: 'cumplify-tenant-docs',
          queryText: description,
          queryVector: placeholderVector,
          topK: 3,
        }),
      ]);
      const isoContext = isoResults.chunks.map(c => c.text).join('\n---\n');
      const tenantContext = tenantResults.chunks.map(c => c.text).join('\n---\n');
      groundingContext = [isoContext, tenantContext].filter(Boolean).join('\n===\n');
    } catch {
      // Retrieval failure is non-blocking
    }
  }

  const userMessage = [
    `An audit task has been raised. Analyze and take appropriate action.`,
    `\nEvent: ${JSON.stringify(event.payload)}`,
    groundingContext ? `\nRelevant context:\n${groundingContext}` : '',
  ].join('');

  await toolLoop(
    [{ role: 'user', content: [{ text: userMessage }] }],
    {
      seat: 'workhorse',
      systemPrompt: LEAD_AUDITOR_PROMPT,
      tools: LEAD_AUDITOR_TOOLS,
      tenantId,
      agent: 'LeadAuditor',
      module: 'M3',
      feature: 'audit-studio',
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
