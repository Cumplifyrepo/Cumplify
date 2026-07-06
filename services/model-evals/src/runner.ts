/**
 * Benchmark runner — invokes Bedrock Converse per candidate per task,
 * records token usage, computes $/task.
 * C-1: Bedrock Converse calls allowed ONLY within services/model-evals.
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { EvalTask, EvalResult, SeatConfig, PriceEntry } from './types.js';
import { recordSpend, type BudgetGuard } from './budget.js';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

/**
 * Run a single task against a single candidate model.
 */
export async function invokeCandidate(
  modelId: string,
  task: EvalTask,
  seatConfig: SeatConfig,
  price: PriceEntry,
  budgetGuard: BudgetGuard,
): Promise<EvalResult> {
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

  return {
    taskId: task.id,
    candidateModelId: modelId,
    response: responseText,
    inputTokens,
    outputTokens,
    latencyMs,
    costUsd,
  };
}
