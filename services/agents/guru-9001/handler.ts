/**
 * ISO9001Guru agent handler — AppSync resolver (user-triggered, NOT SQS consumer).
 * Advisory-only: retrieves ISO 9001 clause context and answers questions.
 *
 * Flow: AppSync query → retrieve ISO KB (AOSS) → invoke Converse → return answer.
 * No tool-loop needed (no tools, advisory only).
 */

import { retrieve } from '../shared/retrieval.js';
import { invoke } from '../../ai-invoker/src/index.js';
import { ISO9001_GURU_PROMPT } from './prompt.js';

const AOSS_ISO_KB_ENDPOINT = process.env.AOSS_ISO_KB_ENDPOINT!;


export async function handleQuery(
  tenantId: string,
  question: string,
  queryVector: number[],
): Promise<string> {
  // Retrieve relevant ISO 9001 clause text
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
    groundingContext ? `\nRelevant ISO 9001:2015 clauses:\n${groundingContext}` : '',
  ].join('');

  const response = await invoke({
    seat: 'guru-9001',
    system: ISO9001_GURU_PROMPT,
    messages: [{ role: 'user', content: [{ text: userMessage }] }],
    tools: [],
    tenantId,
    agent: 'ISO9001Guru',
    module: 'advisory',
    feature: 'clause-qa',
  });

  return response.text || 'Unable to generate a response.';
}
