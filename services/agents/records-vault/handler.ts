/**
 * RecordsVault agent handler — SQS consumer (RecordsQueue, standard).
 * Owns M4 Records Management: retention, sealing, audit trail.
 *
 * Flow: SQS event → tool-loop (Converse) →
 * HITL gate on records-retention-schedule → approval → ExecuteWriteback → audit.
 *
 * Lightweight seat: no AOSS retrieval needed (operates on record metadata).
 */

import { createHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { createInvokeFn } from '../shared/invoke-transport.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import { RECORDS_VAULT_PROMPT } from './prompt.js';
import { RECORDS_VAULT_TOOLS } from './tools.js';

const DLQ_URL = process.env.RECORDS_VAULT_DLQ_URL!;

const HITL_TOOLS = new Set(['records-retention-schedule']);
const invokeFn = createInvokeFn();

async function processEvent(event: CumplifyEvent, _detailType: string): Promise<void> {
  const { tenantId } = event;

  const userMessage = [
    `A records management task has been raised. Analyze and take appropriate action.`,
    `\nEvent: ${JSON.stringify(event.payload)}`,
  ].join('');

  await toolLoop(
    [{ role: 'user', content: [{ text: userMessage }] }],
    {
      seat: 'lightweight',
      systemPrompt: RECORDS_VAULT_PROMPT,
      tools: RECORDS_VAULT_TOOLS,
      tenantId,
      agent: 'RecordsVault',
      module: 'M4',
      feature: 'records-management',
      hitlTools: HITL_TOOLS,
      invokeFn,
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
