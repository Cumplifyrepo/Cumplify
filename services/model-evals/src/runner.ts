/**
 * Benchmark runner — invokes Bedrock Converse per candidate per task,
 * records token usage, computes $/task.
 * C-1: Bedrock Converse calls allowed ONLY within services/model-evals.
 *
 * FINDING-K: per-candidate isolation, transient retry, truncation honesty.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { EvalTask, EvalResult, SeatConfig, PriceEntry } from './types.js';
import { recordSpend, type BudgetGuard } from './budget.js';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 1000;

/**
 * Run a single task against a single candidate model.
 * Retries up to MAX_RETRIES on 5xx/throttle/transient errors.
 * Returns result with flags: truncated, invocationError.
 */
export async function invokeCandidate(
  modelId: string,
  task: EvalTask,
  seatConfig: SeatConfig,
  price: PriceEntry,
  budgetGuard: BudgetGuard,
): Promise<EvalResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const start = Date.now();
      const response = await client.send(
        new ConverseCommand({
          modelId,
          messages: [{ role: 'user', content: [{ text: task.prompt }] }],
          inferenceConfig: {
            temperature: seatConfig.temperature,
            maxTokens: seatConfig.maxTokens,
          },
        }),
      );

      const latencyMs = Date.now() - start;
      const inputTokens = response.usage?.inputTokens ?? 0;
      const outputTokens = response.usage?.outputTokens ?? 0;

      // Compute cost from actual token usage × price
      const costUsd =
        (inputTokens / 1_000_000) * price.inputPricePerMToken +
        (outputTokens / 1_000_000) * price.outputPricePerMToken;

      // Record spend against budget guard
      recordSpend(budgetGuard, seatConfig.seat, costUsd);

      // Extract response text
      const responseText =
        response.output?.message?.content
          ?.map((block) => ('text' in block ? block.text : ''))
          .join('') ?? '';

      // FINDING-K: truncation honesty
      const stopReason = response.stopReason ?? '';
      const truncated = stopReason === 'max_tokens';

      return {
        taskId: task.id,
        candidateModelId: modelId,
        response: responseText,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsd,
        truncated,
        invocationError: undefined,
      };
    } catch (err: unknown) {
      lastError = err as Error;
      const statusCode = (err as any)?.$metadata?.httpStatusCode ?? 0;
      const message = (err as Error).message ?? '';
      const isRetryable =
        statusCode >= 500 ||
        statusCode === 429 ||
        message.toLowerCase().includes('throttl') ||
        message.toLowerCase().includes('unable to process');

      if (!isRetryable || attempt === MAX_RETRIES) {
        // Non-retryable or exhausted retries: return INVOCATION-ERROR result
        return {
          taskId: task.id,
          candidateModelId: modelId,
          response: '',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          costUsd: 0,
          truncated: false,
          invocationError: `${lastError.name}: ${lastError.message}`,
        };
      }
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    taskId: task.id,
    candidateModelId: modelId,
    response: '',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
    truncated: false,
    invocationError: `Exhausted retries: ${lastError?.message}`,
  };
}
