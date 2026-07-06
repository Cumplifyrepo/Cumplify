import { describe, it, expect } from 'vitest';
import {
  computeEstimate,
  createBudgetGuard,
  recordSpend,
  BudgetExceededError,
} from '../src/budget.js';
import type { EvalSet, SeatConfig, PriceEntry } from '../src/types.js';

describe('budget module', () => {
  describe('computeEstimate', () => {
    it('computes correct estimate for micro seat', () => {
      const seatConfig: SeatConfig = {
        seat: 'micro',
        candidates: ['model-a', 'model-b'],
        temperature: 0,
        maxTokens: 256,
        gradingMethod: 'exact-match',
        evalSetPath: 'data/eval-sets/micro-routing.json',
        humanReviewPercent: 0,
      };

      const evalSet: EvalSet = {
        seat: 'micro',
        version: '1.0',
        taskCount: 50,
        tasks: [],
        gradingMethod: 'exact-match',
      };

      const prices: Record<string, PriceEntry> = {
        'model-a': { inputPricePerMToken: 0.10, outputPricePerMToken: 0.40, unit: 'USD per 1M tokens' },
        'model-b': { inputPricePerMToken: 0.20, outputPricePerMToken: 0.80, unit: 'USD per 1M tokens' },
      };

      const estimate = computeEstimate(seatConfig, evalSet, prices);

      expect(estimate.seat).toBe('micro');
      expect(estimate.taskCount).toBe(50);
      expect(estimate.candidateCount).toBe(2);
      expect(estimate.totalInvocations).toBe(100); // 50 tasks × 2 candidates
      // Micro: 200 input, 50 output tokens per invocation
      expect(estimate.estimatedInputTokens).toBe(20000); // 100 × 200
      expect(estimate.estimatedOutputTokens).toBe(5000); // 100 × 50
      // Worst-case cost: model-b pricing
      // (200/1M × 0.20) + (50/1M × 0.80) = 0.00004 + 0.00004 = 0.00008 per invocation
      // 100 × 0.00008 = 0.008
      expect(estimate.estimatedCostUsd).toBeCloseTo(0.008, 4);
    });
  });

  describe('createBudgetGuard', () => {
    it('creates guard with default caps', () => {
      const guard = createBudgetGuard();
      expect(guard.campaignCap).toBe(15.0);
      expect(guard.perSeatCap).toBe(3.0);
      expect(guard.consumed).toBe(0);
    });

    it('accepts custom caps', () => {
      const guard = createBudgetGuard(10, 2);
      expect(guard.campaignCap).toBe(10);
      expect(guard.perSeatCap).toBe(2);
    });
  });

  describe('recordSpend', () => {
    it('accumulates spend correctly', () => {
      const guard = createBudgetGuard(15, 3);
      recordSpend(guard, 'micro', 0.5);
      recordSpend(guard, 'micro', 0.3);
      expect(guard.consumed).toBeCloseTo(0.8);
      expect(guard.seatConsumed['micro']).toBeCloseTo(0.8);
    });

    it('throws BudgetExceededError when per-seat cap breached', () => {
      const guard = createBudgetGuard(15, 3);
      recordSpend(guard, 'guru', 2.5);

      expect(() => recordSpend(guard, 'guru', 1.0)).toThrow(BudgetExceededError);
      expect(() => recordSpend(guard, 'guru', 1.0)).toThrow(/Per-seat budget exceeded/);
    });

    it('throws BudgetExceededError when campaign cap breached', () => {
      const guard = createBudgetGuard(5, 3);
      recordSpend(guard, 'micro', 2.0);
      recordSpend(guard, 'guru', 2.0);

      const guard2 = createBudgetGuard(5, 3);
      recordSpend(guard2, 'micro', 2.0);
      recordSpend(guard2, 'guru', 2.0);

      expect(() => recordSpend(guard, 'lightweight', 2.0)).toThrow(BudgetExceededError);
      expect(() => recordSpend(guard2, 'lightweight', 2.0)).toThrow(/Campaign budget exceeded/);
    });

    it('does not throw when within caps', () => {
      const guard = createBudgetGuard(15, 3);
      expect(() => recordSpend(guard, 'micro', 2.9)).not.toThrow();
      expect(() => recordSpend(guard, 'guru', 2.9)).not.toThrow();
    });
  });
});
