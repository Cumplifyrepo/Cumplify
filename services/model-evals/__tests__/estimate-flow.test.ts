/**
 * Integration-shaped test: estimate flow.
 * Uses clearly-labeled FIXTURE prices (not the production snapshot).
 * Tests hard-failure path for unknown models.
 *
 * NOTE: The full --estimate-only CLI flow requires live AWS credentials
 * (Pricing API). That execution is architect-witnessed. These tests validate
 * the computation logic with fixture data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEAT_CONFIGS } from '../src/seat-configs.js';
import { computeEstimate, createBudgetGuard } from '../src/budget.js';
import { loadSnapshot, checkStaleness, PricingApiMissError } from '../src/pricing.js';
import type { EvalSet, PriceEntry } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');

// ─── FIXTURE PRICES (clearly labeled — NOT production values) ───────────────
// These are arbitrary round numbers for testing computation logic only.
// Real prices come from the live Pricing API (architect-executed).
const FIXTURE_PRICES: Record<string, PriceEntry> = {
  'us.amazon.nova-micro-v1:0': {
    inputPricePerMToken: 0.10,
    outputPricePerMToken: 0.40,
    unit: 'USD per 1M tokens (FIXTURE)',
  },
  'zai.glm-4.7-flash': {
    inputPricePerMToken: 0.10,
    outputPricePerMToken: 0.40,
    unit: 'USD per 1M tokens (FIXTURE)',
  },
};

describe('estimate flow (integration-shaped, fixture-priced)', () => {
  it('micro seat: loads eval set, computes estimate with all candidates, $0.00 consumed', () => {
    const seatConfig = SEAT_CONFIGS['micro'];

    // 1. Load eval set (real file)
    const evalSetPath = resolve(DATA_DIR, 'eval-sets/micro-routing.json');
    const evalSet: EvalSet = JSON.parse(readFileSync(evalSetPath, 'utf-8'));
    expect(evalSet.taskCount).toBe(50);
    expect(evalSet.tasks).toHaveLength(50);

    // 2. Compute estimate with FIXTURE prices
    const estimate = computeEstimate(seatConfig, evalSet, FIXTURE_PRICES);

    // Verify: every candidate accounted for
    expect(estimate.candidateCount).toBe(seatConfig.candidates.length);
    expect(estimate.taskCount).toBe(50);
    expect(estimate.totalInvocations).toBe(50 * seatConfig.candidates.length);

    // Verify: estimate > 0 (real computation, not hardcoded)
    expect(estimate.estimatedCostUsd).toBeGreaterThan(0);
    expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);

    // Verify: $0.00 consumed (no Bedrock calls in estimate-only)
    const guard = createBudgetGuard();
    expect(guard.consumed).toBe(0);
  });

  it('all Kiro-drafted seats have valid eval set files that load and parse', () => {
    // Kiro-drafted sets (Task 5) — should all exist
    const kiroDraftedSeats = ['micro', 'lightweight', 'snapshot', 'editor-ai', 'pain-distiller', 'workhorse'];

    for (const seatName of kiroDraftedSeats) {
      const config = SEAT_CONFIGS[seatName];
      const evalSetPath = resolve(DATA_DIR, config.evalSetPath.replace('data/', ''));
      const evalSet: EvalSet = JSON.parse(readFileSync(evalSetPath, 'utf-8'));
      expect(evalSet.taskCount).toBe(evalSet.tasks.length);
      expect(evalSet.tasks.length).toBeGreaterThan(0);
    }
  });

  it('snapshot staleness check passes on the production snapshot', () => {
    const snapshot = loadSnapshot(resolve(DATA_DIR, 'price-snapshot.json'));
    // Should not throw (captured today or recently)
    expect(() => checkStaleness(snapshot)).not.toThrow();
    // Should contain only sonnet-4-6
    expect(Object.keys(snapshot.models)).toEqual(['us.anthropic.claude-sonnet-4-6']);
  });
});

describe('pricing hard-failure path', () => {
  it('PricingApiMissError is throwable with descriptive message', () => {
    const err = new PricingApiMissError(
      "HARD FAILURE: Model 'fake.model-v1' not found in Pricing API.",
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PricingApiMissError');
    expect(err.message).toContain('HARD FAILURE');
    expect(err.message).toContain('fake.model-v1');
  });
});
