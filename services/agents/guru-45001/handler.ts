/**
 * ISO45001Guru agent handler — AppSync resolver (user-triggered, NOT SQS consumer).
 * Advisory-only: retrieves ISO 45001 clause context and answers questions.
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
import { ISO45001_GURU_PROMPT } from './prompt.js';

const AOSS_ISO_KB_ENDPOINT = process.env.AOSS_ISO_KB_ENDPOINT!;

const invokeFn = createInvokeFn();

export async function handleQuery(
  tenantId: string,
  question: string,
  queryVector: number[],
): Promise<string> {
  // Retrieve relevant ISO 45001 clause text
  let groundingContext = '';
  try {
    const results = await retrieve({
      tenantId,
      collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
      indexName: 'cumplify-iso-kb',
      queryText: question,
      queryVector,
      topK: 5,
    });
    groundingContext = results.chunks.map(c => c.text).join('\n---\n');
  } catch {
    // Retrieval failure — respond without grounding
  }

  const userMessage = [
    question,
    groundingContext ? `\nRelevant ISO 45001:2018 clauses:\n${groundingContext}` : '',
  ].join('');

  const response = await invokeFn({
    seat: 'guru-45001',
    system: ISO45001_GURU_PROMPT,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    tools: [],
    tenantId,
    agent: 'ISO45001Guru',
    module: 'advisory',
    feature: 'clause-qa',
  });

  return response.text || 'Unable to generate a response.';
}
