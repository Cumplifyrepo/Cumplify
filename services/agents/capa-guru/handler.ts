/**
 * CAPAGuru agent handler — TWO entry points sharing the same tool-loop/
 * prompt/tools plumbing (same pattern as guru-9001's handleQuery/handler
 * split): the ORIGINAL SQS consumer (CapaIntakeQueue, FIFO, event-triggered
 * NC intake) and a NEW direct-invoke path (RS-8, read-surface-completion —
 * m2.ts's runCapaAnalysis resolver invokes this Lambda by ARN with a plain
 * JSON payload, not an SQS event). Lambda always calls whatever `handler`
 * is configured as the function's entry point regardless of trigger type,
 * so `handler` dispatches on event shape: `'Records' in event` -> SQS path
 * (unchanged); else -> the new stage-aware direct path.
 *
 * Flow (either path): context (event payload or runCapaAnalysis's RDS
 * fetch) -> tool-loop (Converse, stage-aware prompt picks the NEXT
 * unresolved CAPA-shall-workflow stage) -> HITL gate on mutating tools
 * (nc-triage-write / capa-open / capa-verify-effectiveness) -> approval ->
 * ExecuteWriteback -> audit.
 *
 * Uses: createFifoHandler (eventing consumer lib), toolLoop (shared), retrieve (shared).
 * Calls AI Invoker via lambda:InvokeFunction (AgentHandlerReadOnlyPolicy).
 */

import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { createFifoHandler } from '../../eventing/src/consumer.js';
import { toolLoop } from '../shared/tool-loop.js';
import { createInvokeFn } from '../shared/invoke-transport.js';
import { retrieve } from '../shared/retrieval.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';
import { CAPA_GURU_PROMPT } from './prompt.js';
import { CAPA_GURU_TOOLS } from './tools.js';

const DLQ_URL = process.env.DLQ_URL!;
const AOSS_ENDPOINT = process.env.AOSS_NC_HISTORY_ENDPOINT!;

const HITL_TOOLS = new Set(['nc-triage-write', 'capa-open', 'capa-verify-effectiveness']);
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

const sqsHandler = createFifoHandler({
  fifo: true,
  dlqUrl: DLQ_URL,
  handler: processEvent,
  idempotentErrors: [],
});

// ─── RS-8 direct-invoke path (runCapaAnalysis) ──────────────────────────────

export interface CapaAnalysisContext {
  nc: {
    description: string;
    ncType: string;
    severity: string;
    standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
    status: string;
  };
  correctiveActions: Array<{ id: string; actionDesc: string; status: string; ownerId: string }>;
}

export interface RunAnalysisInput {
  tenantId: string;
  runId: string;
  ncId: string;
  /** RS-8 SOD-1: the human who clicked "AI: draft this" — threaded to enterHitlGate. */
  requestedBy: string;
  context: CapaAnalysisContext;
}

export interface RunAnalysisResult {
  runId: string;
  status: string;
}

export async function runCapaAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const { tenantId, ncId, requestedBy, context } = input;

  const caSummary =
    context.correctiveActions.length > 0
      ? context.correctiveActions
          .map((ca) => `  - ${ca.id}: "${ca.actionDesc}" (status=${ca.status}, owner=${ca.ownerId})`)
          .join('\n')
      : '  (none yet)';

  const userMessage = [
    `Analyze this nonconformity's CURRENT state and act on its NEXT unresolved CAPA shall-workflow stage only.`,
    `\nNC ID: ${ncId}`,
    `Standard: ${context.nc.standard}`,
    `Current classification: ${context.nc.ncType}`,
    `Severity: ${context.nc.severity}`,
    `NC status: ${context.nc.status}`,
    `Description: ${context.nc.description}`,
    `\nExisting corrective actions:\n${caSummary}`,
  ].join('\n');

  const result = await toolLoop([{ role: 'user', content: [{ text: userMessage }] }], {
    seat: 'workhorse',
    systemPrompt: CAPA_GURU_PROMPT,
    tools: CAPA_GURU_TOOLS,
    tenantId,
    agent: 'CAPAGuru',
    module: 'M2',
    feature: 'capa-analysis',
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

/**
 * Lambda entry point — dispatches on event shape. SQS always delivers
 * {Records: [...]}; runCapaAnalysis's direct invoke never does.
 */
export async function handler(
  event: SQSEvent | RunAnalysisInput,
): Promise<SQSBatchResponse | RunAnalysisResult> {
  if ('Records' in event) {
    return sqsHandler(event);
  }
  return runCapaAnalysis(event);
}
