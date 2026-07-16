/**
 * Bedrock Converse wrapper — retry, requestMetadata, guardrail, conditional caching.
 * Extends the spec-30 runner.ts pattern (Decision D-2).
 *
 * Design §1.2 steps 3-5, §1.6.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message,
  type SystemContentBlock,
  type ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';
import { Logger } from '@aws-lambda-powertools/logger';
import type { ConversationMessage, ToolConfig, TokenUsage } from './types.js';

/**
 * Nova cannot emit hyphens inside tool-call names (live A/B proven 2026-07-09:
 * 'test-tool' -> invalid-sequence error; 'test_tool' -> clean tool_use).
 * Wire encoding is bijective for our domain names (hyphenated, no underscores).
 */
export function toWireToolName(name: string): string {
  return name.replace(/-/g, '_');
}
export function fromWireToolName(wireName: string): string {
  return wireName.replace(/_/g, '-');
}

const logger = new Logger({ serviceName: 'ai-invoker-converse' });

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export interface ConverseParams {
  modelId: string;
  messages: ConversationMessage[];
  system?: string;
  tools?: ToolConfig[];
  temperature: number;
  maxTokens: number;
  /** Converse requestMetadata for multi-tenant attribution (SERVE-7) */
  requestMetadata: Record<string, string>;
  /** Guardrail config (SERVE-5B/D-5) */
  guardrailConfig?: { guardrailIdentifier: string; guardrailVersion: string };
  /** Whether to add cachePoint to system prompt (Nova only, §1.6) */
  cachingEnabled: boolean;
}

export interface ConverseResult {
  text: string;
  toolUseBlocks: Array<{ toolUseId: string; name: string; input: unknown }>;
  stopReason: string;
  usage: TokenUsage;
  rawResponse: ConverseCommandOutput;
}

/** Singleton client (cold-cached per Lambda) */
let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

/** Reset client (for testing) */
export function resetClient(): void {
  client = null;
}

/**
 * Call Bedrock Converse with retry on 5xx/429/throttle.
 * Extends spec-30 runner.ts: same retry logic, adds requestMetadata + guardrail + caching.
 */
export async function converse(params: ConverseParams): Promise<ConverseResult> {
  const input = buildConverseInput(params);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        const jitter = Math.random() * delayMs * 0.1;
        await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
      }

      const response = await getClient().send(new ConverseCommand(input));
      return extractResult(response);
    } catch (err: unknown) {
      lastError = err as Error;
      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        logger.error('Converse invocation failed', {
          modelId: params.modelId,
          attempt,
          error: (err as Error).message,
        });
        throw err;
      }
      logger.warn('Converse retrying', {
        modelId: params.modelId,
        attempt: attempt + 1,
        error: (err as Error).message,
      });
    }
  }

  // Unreachable but TypeScript needs it
  throw lastError ?? new Error('Converse failed: unknown error');
}

function isRetryable(err: unknown): boolean {
  const statusCode = (err as any)?.$metadata?.httpStatusCode ?? 0;
  const message = ((err as Error).message ?? '').toLowerCase();
  return (
    statusCode >= 500 ||
    statusCode === 429 ||
    message.includes('throttl') ||
    message.includes('unable to process') ||
    message.includes('too many requests')
  );
}

function buildConverseInput(params: ConverseParams): ConverseCommandInput {
  const messages = params.messages.map(toBedrockMessage);

  // System prompt with conditional cachePoint (§1.6: Nova only)
  let system: SystemContentBlock[] | undefined;
  if (params.system) {
    if (params.cachingEnabled) {
      // Nova models: add cachePoint after static preamble
      system = [
        { text: params.system },
        { cachePoint: { type: 'default' } } as unknown as SystemContentBlock,
      ];
    } else {
      system = [{ text: params.system }];
    }
  }

  // Tool configuration
  // Task-11 fix (live A/B proven): Nova cannot emit HYPHENATED tool names —
  // "Model produced invalid sequence as part of ToolUse" deterministically.
  // The one-door wire-encodes names (hyphen->underscore) toward the model and
  // decodes on extraction; domain code keeps its hyphenated names untouched.
  let toolConfig: ToolConfiguration | undefined;
  if (params.tools && params.tools.length > 0) {
    toolConfig = {
      tools: params.tools.map((t) => ({
        toolSpec: {
          name: toWireToolName(t.toolSpec.name),
          description: t.toolSpec.description,
          inputSchema: { json: t.toolSpec.inputSchema.json as Record<string, unknown> },
        },
      })) as ToolConfiguration['tools'],
    };
  }

  // Task-11 fix: Nova tool calling requires GREEDY decoding per the Amazon
  // Nova tool-use troubleshooting guide (temperature=1, topP=1, topK=1) —
  // sampled decoding deterministically produced "Model produced invalid
  // sequence as part of ToolUse" live (2×, CAPAGuru E2E). Non-Nova models
  // and tool-less calls keep seat-default temperature.
  const novaToolGreedy = toolConfig !== undefined && params.modelId.includes('nova');

  const input: ConverseCommandInput = {
    modelId: params.modelId,
    messages,
    ...(system && { system }),
    ...(toolConfig && { toolConfig }),
    inferenceConfig: novaToolGreedy
      ? { temperature: 1, topP: 1, maxTokens: params.maxTokens }
      : { temperature: params.temperature, maxTokens: params.maxTokens },
    ...(novaToolGreedy && {
      additionalModelRequestFields: { inferenceConfig: { topK: 1 } },
    }),
    ...(params.guardrailConfig && { guardrailConfig: params.guardrailConfig }),
    // F-2 FIX: requestMetadata is a TOP-LEVEL Converse param (SERVE-7)
    ...(Object.keys(params.requestMetadata).length > 0 && {
      requestMetadata: params.requestMetadata,
    }),
  };

  return input;
}

function toBedrockMessage(msg: ConversationMessage): Message {
  const content = msg.content.map((block) => {
    if ('text' in block) return { text: block.text } as const;
    // Selective guardrail evaluation: only guardContent blocks are input-evaluated
    // when present (types.ts ContentBlock.guardedText).
    if ('guardedText' in block) {
      return { guardContent: { text: { text: block.guardedText } } } as const;
    }
    if ('toolUse' in block) {
      return {
        toolUse: {
          toolUseId: block.toolUse.toolUseId,
          // Wire-encode: model must see consistent (underscore) names in history
          name: toWireToolName(block.toolUse.name),
          input: block.toolUse.input as Record<string, unknown>,
        },
      } as const;
    }
    if ('toolResult' in block) {
      return {
        toolResult: {
          toolUseId: block.toolResult.toolUseId,
          content: block.toolResult.content.map((c) => {
            if ('text' in c) return { text: c.text };
            return { text: JSON.stringify(c) };
          }),
          status: block.toolResult.status ?? 'success',
        },
      } as const;
    }
    return { text: JSON.stringify(block) } as const;
  });

  return { role: msg.role, content } as unknown as Message;
}

function extractResult(response: ConverseCommandOutput): ConverseResult {
  const output = response.output;
  const messageContent = (output as any)?.message?.content ?? [];

  let text = '';
  const toolUseBlocks: Array<{ toolUseId: string; name: string; input: unknown }> = [];

  for (const block of messageContent) {
    if ('text' in block && block.text) {
      text += block.text;
    }
    if ('toolUse' in block && block.toolUse) {
      toolUseBlocks.push({
        toolUseId: block.toolUse.toolUseId ?? '',
        // Decode wire name back to the domain (hyphenated) name
        name: fromWireToolName(block.toolUse.name ?? ''),
        input: block.toolUse.input,
      });
    }
  }

  const usage: TokenUsage = {
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
    cacheReadInputTokens: (response.usage as any)?.cacheReadInputTokens ?? 0,
    cacheWriteInputTokens: (response.usage as any)?.cacheWriteInputTokens ?? 0,
  };

  return {
    text,
    toolUseBlocks,
    stopReason: response.stopReason ?? 'end_turn',
    usage,
    rawResponse: response,
  };
}
