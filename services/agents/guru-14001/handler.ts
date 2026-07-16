/**
 * ISO14001Guru agent handler — AppSync resolver (user-triggered, NOT SQS consumer).
 * Advisory-only: retrieves ISO 14001 clause context and answers questions.
 *
 * Flow: AppSync query → retrieve ISO KB (AOSS) → invoke Converse via Lambda
 * transport (one-door) → return answer.
 * No tool-loop needed (no tools, advisory only).
 *
 * C-1 (BINDING): uses createInvokeFn() Lambda transport to reach AI Invoker.
 * NEVER imports invoke() directly from ai-invoker.
 */

import { retrieve } from '../shared/retrieval.js';
import { createInvokeFn } from '../shared/invoke-transport.js';
import { ISO14001_GURU_PROMPT } from './prompt.js';

const AOSS_ISO_KB_ENDPOINT = process.env.AOSS_ISO_KB_ENDPOINT!;

const invokeFn = createInvokeFn();

export async function handleQuery(
  tenantId: string,
  question: string,
  queryVector?: number[],
): Promise<string> {
  // Retrieve relevant ISO 14001 clause text
  let groundingContext = '';
  // Retrieval requires a 1024-dim query vector; skip grounding when absent
  // (embed() door is BLOCKED-ON-DESIGN — vector arrives via the API arg for now).
  try {
    if (!queryVector) throw new Error('no query vector');
    const results = await retrieve({
      tenantId,
      collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
      indexName: 'cumplify-iso-kb',
      queryText: question,
      queryVector,
      topK: 5,
    });
    groundingContext = results.chunks.map((c) => c.text).join('\n---\n');
  } catch {
    // Retrieval failure — respond without grounding
  }

  const userMessage = [
    question,
    groundingContext ? `\nRelevant ISO 14001:2015 clauses:\n${groundingContext}` : '',
  ].join('');

  const response = await invokeFn({
    seat: 'guru-14001',
    system: ISO14001_GURU_PROMPT,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    tools: [],
    tenantId,
    agent: 'ISO14001Guru',
    module: 'advisory',
    feature: 'clause-qa',
  });

  return response.text || 'Unable to generate a response.';
}

/**
 * AppSync direct-Lambda-resolver entrypoint (Task 8R-2 hotfix, architect).
 * - question/queryVector come from event.arguments (schema: askISO14001).
 * - tenantId comes ONLY from the Lambda authorizer's resolverContext (verified
 *   claim) — NEVER from client arguments. Fail-closed if absent.
 */
interface AppSyncGuruEvent {
  arguments: { question: string; queryVector?: string };
  identity?: { resolverContext?: { tenantId?: string } };
}

export async function handler(event: AppSyncGuruEvent): Promise<string> {
  const tenantId = event.identity?.resolverContext?.tenantId;
  if (!tenantId) {
    throw new Error('Unauthorized: missing tenantId in resolver context');
  }
  const queryVector = event.arguments.queryVector
    ? (JSON.parse(event.arguments.queryVector) as number[])
    : undefined;
  return handleQuery(tenantId, event.arguments.question, queryVector);
}
