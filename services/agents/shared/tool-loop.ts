/**
 * Multi-turn tool-use orchestration loop.
 * Design §2.5 — agents-existing-8.
 *
 * Calls invoke() repeatedly until the model returns end_turn or the loop guard fires.
 * When a mutating tool is detected, enters the HITL gate (§3).
 */

import { invoke } from '../../ai-invoker/src/index.js';
import type { InvokeRequest, ConversationMessage, ToolConfig, SeatId, ContentBlock } from '../../ai-invoker/src/types.js';
import { enterHitlGate, type HitlResult } from './hitl.js';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'agents-tool-loop' });

const MAX_TURNS = 10;

export interface ToolLoopOpts {
  seat: SeatId;
  systemPrompt: string;
  tools: ToolConfig[];
  tenantId: string;
  agent: string;
  module: string;
  feature: string;
  /** Tool names that require HITL before execution */
  hitlTools: Set<string>;
  /** Tool dispatch function — executes a tool and returns the result */
  dispatchTool: (toolName: string, input: unknown, tenantId: string) => Promise<ToolDispatchResult>;
  /** Optional: credit exemption (incident/HITL flow) */
  creditExempt?: boolean;
  /** Optional: output schema for schema-retry */
  outputSchema?: Record<string, unknown>;
}

export interface ToolDispatchResult {
  output: unknown;
  /** If true, this tool result triggers the HITL gate */
  requiresHitl?: boolean;
}

export interface AgentResult {
  finalResponse: string;
  turns: number;
  hitlResult?: HitlResult;
  totalUsage: { inputTokens: number; outputTokens: number };
}

export class LoopGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopGuardError';
  }
}

/**
 * Execute the agent tool-use loop.
 * Calls invoke() in a loop, dispatching tools until the model produces end_turn.
 */
export async function toolLoop(
  initialMessages: ConversationMessage[],
  opts: ToolLoopOpts,
): Promise<AgentResult> {
  let messages = [...initialMessages];
  let totalUsage = { inputTokens: 0, outputTokens: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const request: InvokeRequest = {
      seat: opts.seat,
      messages,
      system: opts.systemPrompt,
      tools: opts.tools,
      tenantId: opts.tenantId,
      agent: opts.agent,
      module: opts.module,
      feature: opts.feature,
      creditExempt: opts.creditExempt,
      outputSchema: opts.outputSchema,
    };

    const response = await invoke(request);
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;

    // end_turn: model is done
    if (response.stopReason === 'end_turn' || response.stopReason === 'stop') {
      return { finalResponse: response.text, turns: turn + 1, totalUsage };
    }

    // tool_use: dispatch tools
    if (response.stopReason === 'tool_use' && response.toolUseBlocks.length > 0) {
      // Build assistant message with tool_use blocks
      const assistantContent: ContentBlock[] = [];
      if (response.text) {
        assistantContent.push({ text: response.text });
      }
      for (const tu of response.toolUseBlocks) {
        assistantContent.push({ toolUse: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input } });
      }
      messages = [...messages, { role: 'assistant', content: assistantContent }];

      // Dispatch each tool
      const toolResultContent: ContentBlock[] = [];
      for (const toolUse of response.toolUseBlocks) {
        // Check if this tool requires HITL
        if (opts.hitlTools.has(toolUse.name)) {
          logger.info('HITL-gated tool detected, entering gate', {
            tool: toolUse.name,
            tenantId: opts.tenantId,
            agent: opts.agent,
          });

          const hitlResult = await enterHitlGate({
            tenantId: opts.tenantId,
            agentName: opts.agent,
            proposedAction: { tool: toolUse.name, args: toolUse.input },
            conversationState: messages,
          });

          return {
            finalResponse: `HITL gate entered for tool '${toolUse.name}'. Execution pending approval.`,
            turns: turn + 1,
            hitlResult,
            totalUsage,
          };
        }

        // Non-HITL tool: dispatch directly
        const result = await opts.dispatchTool(toolUse.name, toolUse.input, opts.tenantId);

        // R6-F1: if dispatched tool returns requiresHitl=true, route to gate
        if (result.requiresHitl) {
          logger.info('Dispatched tool returned requiresHitl=true, entering gate', {
            tool: toolUse.name,
            tenantId: opts.tenantId,
            agent: opts.agent,
          });

          const hitlResult = await enterHitlGate({
            tenantId: opts.tenantId,
            agentName: opts.agent,
            proposedAction: { tool: toolUse.name, args: toolUse.input },
            conversationState: messages,
          });

          return {
            finalResponse: `HITL gate entered for tool '${toolUse.name}' (dynamic). Execution pending approval.`,
            turns: turn + 1,
            hitlResult,
            totalUsage,
          };
        }

        toolResultContent.push({
          toolResult: {
            toolUseId: toolUse.toolUseId,
            content: [{ text: typeof result.output === 'string' ? result.output : JSON.stringify(result.output) }],
            status: 'success',
          },
        });
      }

      // Add tool results as user message
      messages = [...messages, { role: 'user', content: toolResultContent }];
    } else {
      // Unexpected stopReason — treat as end
      logger.warn('Unexpected stopReason', { stopReason: response.stopReason, turn });
      return { finalResponse: response.text, turns: turn + 1, totalUsage };
    }
  }

  throw new LoopGuardError(`Agent exceeded ${MAX_TURNS} turns without completing`);
}
