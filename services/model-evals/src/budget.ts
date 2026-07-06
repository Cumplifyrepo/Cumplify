/**
 * Budget module — cost estimation + halt-on-cap enforcement.
 * C-4: No full benchmark without architect-approved budget.
 */

import type { PriceEntry, EvalSet, SeatConfig } from './types.js';

export interface CostEstimate {
  seat: string;
  taskCount: number;
  candidateCount: number;
  totalInvocations: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  estimatedCostUsd: number;
}

export interface BudgetGuard {
  campaignCap: number; // $15 default
  perSeatCap: number; // $3 default
  consumed: number;
  seatConsumed: Record<string, number>;
}

const DEFAULT_CAMPAIGN_CAP = 15.0;
const DEFAULT_PER_SEAT_CAP = 3.0;

// Average token estimates per seat (from design §4.1)
const TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  guru: { input: 1200, output: 600 },
  workhorse: { input: 800, output: 400 },
  lightweight: { input: 800, output: 400 },
  micro: { input: 200, output: 50 },
  snapshot: { input: 800, output: 400 },
  'editor-ai': { input: 800, output: 400 },
  'pain-distiller': { input: 800, output: 400 },
  'legal-ledger': { input: 1500, output: 800 },
};

/**
 * Compute a cost estimate for a seat evaluation (EV-6 pre-flight).
 */
export function computeEstimate(
  seatConfig: SeatConfig,
  evalSet: EvalSet,
  prices: Record<string, PriceEntry>,
): CostEstimate {
  const tokens = TOKEN_ESTIMATES[seatConfig.seat] ?? { input: 800, output: 400 };
  const taskCount = evalSet.taskCount;
  const candidateCount = seatConfig.candidates.length;
  const totalInvocations = taskCount * candidateCount;

  const estimatedInputTokens = totalInvocations * tokens.input;
  const estimatedOutputTokens = totalInvocations * tokens.output;

  // Use the MOST EXPENSIVE candidate's pricing for worst-case estimate
  let maxCostPerInvocation = 0;
  for (const modelId of seatConfig.candidates) {
    const price = prices[modelId];
    if (!price) continue;
    const costPerInvocation =
      (tokens.input / 1_000_000) * price.inputPricePerMToken +
      (tokens.output / 1_000_000) * price.outputPricePerMToken;
    maxCostPerInvocation = Math.max(maxCostPerInvocation, costPerInvocation);
  }

  return {
    seat: seatConfig.seat,
    taskCount,
    candidateCount,
    totalInvocations,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedCostUsd: totalInvocations * maxCostPerInvocation,
  };
}

/**
 * Create a budget guard with campaign + per-seat caps.
 */
export function createBudgetGuard(
  campaignCap = DEFAULT_CAMPAIGN_CAP,
  perSeatCap = DEFAULT_PER_SEAT_CAP,
): BudgetGuard {
  return { campaignCap, perSeatCap, consumed: 0, seatConsumed: {} };
}

/**
 * Record spend and check budget caps. Throws BudgetExceededError on breach.
 */
export function recordSpend(guard: BudgetGuard, seat: string, amount: number): void {
  guard.consumed += amount;
  guard.seatConsumed[seat] = (guard.seatConsumed[seat] ?? 0) + amount;

  if (guard.seatConsumed[seat] > guard.perSeatCap) {
    throw new BudgetExceededError(
      `Per-seat budget exceeded for '${seat}': $${guard.seatConsumed[seat].toFixed(4)} > $${guard.perSeatCap.toFixed(2)} cap`,
    );
  }

  if (guard.consumed > guard.campaignCap) {
    throw new BudgetExceededError(
      `Campaign budget exceeded: $${guard.consumed.toFixed(4)} > $${guard.campaignCap.toFixed(2)} cap`,
    );
  }
}

export class BudgetExceededError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BudgetExceededError';
  }
}
