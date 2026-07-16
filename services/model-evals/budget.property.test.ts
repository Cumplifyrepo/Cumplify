/**
 * Property-based tests for the model-evals budget module.
 * Per 13-testing.md: property-based tests mandatory on services/* code.
 * (Added 2026-07-16 with the verify-gate cleanup — this was the one service
 * the step-4 policy check flagged: top-level sources, no property suite.)
 *
 * Properties verified:
 * 1. recordSpend NEVER lets consumed exceed the campaign cap without throwing
 *    (C-4 halt-on-cap is the money invariant of the whole eval harness).
 * 2. Per-seat cap: any sequence of spends on one seat that sums past the
 *    per-seat cap throws, regardless of split.
 * 3. Spends within both caps never throw, and the guard's ledger equals the
 *    exact sum recorded (no drift, no rounding surprises at the guard layer).
 * 4. computeEstimate is monotonically non-decreasing in taskCount and never
 *    negative; zero candidates → zero cost.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeEstimate,
  createBudgetGuard,
  recordSpend,
  BudgetExceededError,
} from './src/budget.js';
import type { SeatConfig, EvalSet, PriceEntry } from './src/types.js';

const spendArb = fc.double({ min: 0.0001, max: 2.0, noNaN: true });

const seatConfig = (candidates: string[]): SeatConfig =>
  ({ seat: 'guru', candidates }) as SeatConfig;

const evalSet = (taskCount: number): EvalSet => ({ taskCount }) as EvalSet;

const prices: Record<string, PriceEntry> = {
  'model-a': { inputPricePerMToken: 1.0, outputPricePerMToken: 3.2 } as PriceEntry,
  'model-b': { inputPricePerMToken: 0.06, outputPricePerMToken: 0.24 } as PriceEntry,
};

describe('recordSpend (property-based)', () => {
  it('consumed can never silently exceed the campaign cap', () => {
    fc.assert(
      fc.property(fc.array(spendArb, { minLength: 1, maxLength: 50 }), (spends) => {
        const guard = createBudgetGuard(5.0, Infinity); // isolate the campaign cap
        let threw = false;
        for (const s of spends) {
          try {
            recordSpend(guard, 'guru', s);
          } catch (e) {
            expect(e).toBeInstanceOf(BudgetExceededError);
            threw = true;
            break;
          }
        }
        // Either every spend fit under the cap, or the guard threw the
        // moment the running total crossed it — never a silent overrun.
        if (!threw) expect(guard.consumed).toBeLessThanOrEqual(5.0);
        else expect(guard.consumed).toBeGreaterThan(5.0);
      }),
    );
  });

  it('per-seat cap throws on any split of spends summing past the cap', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.5, max: 1.5, noNaN: true }), {
          minLength: 3,
          maxLength: 10,
        }),
        (spends) => {
          // 3+ spends of >= 0.5 always total > 1.0 cap
          const guard = createBudgetGuard(Infinity, 1.0);
          expect(() => {
            for (const s of spends) recordSpend(guard, 'micro', s);
          }).toThrow(BudgetExceededError);
        },
      ),
    );
  });

  it('within-cap sequences never throw and the ledger is the exact sum', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 0.01, noNaN: true }), {
          minLength: 1,
          maxLength: 20,
        }),
        (spends) => {
          const guard = createBudgetGuard(100.0, 50.0);
          for (const s of spends) recordSpend(guard, 'guru', s);
          const sum = spends.reduce((a, b) => a + b, 0);
          expect(guard.consumed).toBeCloseTo(sum, 10);
          expect(guard.seatConsumed['guru']).toBeCloseTo(sum, 10);
        },
      ),
    );
  });
});

describe('computeEstimate (property-based)', () => {
  it('cost is non-negative and monotonically non-decreasing in taskCount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 1, max: 500 }),
        (tasks, extra) => {
          const cfg = seatConfig(['model-a', 'model-b']);
          const smaller = computeEstimate(cfg, evalSet(tasks), prices);
          const larger = computeEstimate(cfg, evalSet(tasks + extra), prices);
          expect(smaller.estimatedCostUsd).toBeGreaterThanOrEqual(0);
          expect(larger.estimatedCostUsd).toBeGreaterThanOrEqual(smaller.estimatedCostUsd);
        },
      ),
    );
  });

  it('zero candidates → zero invocations and zero cost', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500 }), (tasks) => {
        const est = computeEstimate(seatConfig([]), evalSet(tasks), prices);
        expect(est.totalInvocations).toBe(0);
        expect(est.estimatedCostUsd).toBe(0);
      }),
    );
  });
});
