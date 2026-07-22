/**
 * DocStudio agent handler — SQS consumer (DocStudioQueue, standard) + the
 * S2 direct-invoke drafting path (runDocDraft).
 * Owns M1 Document Studio: drafts, versions, and publishes IMS documents.
 *
 * SQS flow: event → retrieve ISO KB + tenant docs (AOSS) → tool-loop →
 * HITL gate on doc-draft/doc-version-control/doc-publish → approval →
 * ExecuteWriteback → audit.
 * Direct-invoke flow (S2): m1's runDocDraft resolver Event-invokes this
 * Lambda by deterministic name with a `draftIntent` payload; DocStudio
 * drafts the COMPLETE document and proposes it via doc-draft.
 */

import { createHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { createInvokeFn } from '../shared/invoke-transport.js';
import { retrieve } from '../shared/retrieval.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { DOC_STUDIO_PROMPT } from './prompt.js';
import { DOC_STUDIO_TOOLS } from './tools.js';

const DLQ_URL = process.env.DOC_STUDIO_DLQ_URL!;
const AOSS_ISO_KB_ENDPOINT = process.env.AOSS_ISO_KB_ENDPOINT!;
const AOSS_TENANT_DOCS_ENDPOINT = process.env.AOSS_TENANT_DOCS_ENDPOINT!;

const HITL_TOOLS = new Set(['doc-draft', 'doc-publish', 'doc-version-control']);
const invokeFn = createInvokeFn();

async function retrieveGrounding(tenantId: string, text: string): Promise<string> {
  try {
    const placeholderVector = Array(1024).fill(0.01);
    const [isoResults, tenantResults] = await Promise.all([
      retrieve({
        tenantId,
        collectionEndpoint: AOSS_ISO_KB_ENDPOINT,
        indexName: 'cumplify-iso-kb',
        queryText: text,
        queryVector: placeholderVector,
        topK: 3,
      }),
      retrieve({
        tenantId,
        collectionEndpoint: AOSS_TENANT_DOCS_ENDPOINT,
        indexName: 'cumplify-tenant-docs',
        queryText: text,
        queryVector: placeholderVector,
        topK: 3,
      }),
    ]);
    const isoContext = isoResults.chunks.map((c) => c.text).join('\n---\n');
    const tenantContext = tenantResults.chunks.map((c) => c.text).join('\n---\n');
    return [isoContext, tenantContext].filter(Boolean).join('\n===\n');
  } catch {
    // Retrieval failure is non-blocking
    return '';
  }
}

async function processEvent(event: CumplifyEvent, _detailType: string): Promise<void> {
  const { tenantId } = event;
  const description = ((event.payload as Record<string, unknown>).description as string) ?? '';

  const groundingContext = description ? await retrieveGrounding(tenantId, description) : '';

  const userMessage = [
    `A document task has been raised. Analyze and take appropriate action.`,
    `\nEvent: ${JSON.stringify(event.payload)}`,
    groundingContext ? `\nRelevant context:\n${groundingContext}` : '',
  ].join('');

  await toolLoop([{ role: 'user', content: [{ text: userMessage }] }], {
    seat: 'workhorse',
    systemPrompt: DOC_STUDIO_PROMPT,
    tools: DOC_STUDIO_TOOLS,
    tenantId,
    agent: 'DocStudio',
    module: 'M1',
    feature: 'document-studio',
    hitlTools: HITL_TOOLS,
    invokeFn,
    dispatchTool: async (toolName, input, tid) => {
      return { output: { toolName, input, tenantId: tid }, requiresHitl: false };
    },
  });
}

// ─── S2 direct-invoke drafting path (runDocDraft) ───────────────────────────

export interface RunDocDraftInput {
  tenantId: string;
  runId: string;
  /** S2 SOD-1: the human who described the document — cannot approve the draft. */
  requestedBy: string;
  draftIntent: {
    intent: string;
    docType?: string;
    standard?: string;
  };
}

export interface RunDocDraftResult {
  runId: string;
  status: string;
}

export async function runDocDraft(input: RunDocDraftInput): Promise<RunDocDraftResult> {
  const { tenantId, requestedBy, draftIntent } = input;

  const groundingContext = await retrieveGrounding(tenantId, draftIntent.intent);

  const userMessage = [
    `DRAFT MODE. The user needs a NEW controlled document — draft it WHOLE`,
    `via doc-draft (title, governing clauses, complete section prose).`,
    `\nRequested document: ${draftIntent.intent}`,
    ...(draftIntent.docType ? [`Requested docType: ${draftIntent.docType}`] : []),
    ...(draftIntent.standard ? [`Requested standard: ${draftIntent.standard}`] : []),
    groundingContext ? `\nRelevant context:\n${groundingContext}` : '',
  ].join('\n');

  const result = await toolLoop([{ role: 'user', content: [{ text: userMessage }] }], {
    seat: 'workhorse',
    systemPrompt: DOC_STUDIO_PROMPT,
    tools: DOC_STUDIO_TOOLS,
    tenantId,
    agent: 'DocStudio',
    module: 'M1',
    feature: 'doc-draft',
    hitlTools: HITL_TOOLS,
    requestedBy,
    invokeFn,
    dispatchTool: async (toolName, toolInput, tid) => ({
      output: { toolName, input: toolInput, tenantId: tid },
      requiresHitl: false,
    }),
  });

  return {
    runId: input.runId,
    status: result.hitlResult ? 'PENDING_APPROVAL' : 'NO_PROPOSAL',
  };
}

const sqsHandler = createHandler({
  dlqUrl: DLQ_URL,
  handler: processEvent,
});

/**
 * Lambda entry point — dispatches on event shape (capa-guru precedent):
 * SQS always delivers {Records}; the S2 draft payload alone carries
 * `draftIntent`.
 */
export async function handler(
  event: SQSEvent | RunDocDraftInput,
): Promise<SQSBatchResponse | RunDocDraftResult | void> {
  if ('Records' in event) {
    return sqsHandler(event);
  }
  return runDocDraft(event);
}
