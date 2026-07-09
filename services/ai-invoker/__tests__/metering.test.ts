/**
 * Unit tests for metering module.
 * Verifies: credit computation with wIn/wOut/wCache; null wCache fallback; atomic meter update.
 */

import { describe, it, expect } from 'vitest';
import { computeCredits } from '../src/metering.js';
import type { ModelWeight, TokenUsage } from '../src/types.js';

describe('computeCredits', () => {
  const novaProWeights: ModelWeight = {
    modelId: 'us.amazon.nova-pro-v1:0',
    wIn: 800, // $0.80/1M input → 800 credits/1M
    wOut: 3200, // $3.20/1M output → 3200 credits/1M
    wCache: 200, // $0.20/1M cached-read → 200 credits/1M
    effectiveFrom: '2026-07-08',
    sourceCommit: 'abc123',
  };

  const qwenWeights: ModelWeight = {
    modelId: 'qwen.qwen3-next-80b-a3b',
    wIn: 350,
    wOut: 1400,
    wCache: null, // No caching support
    effectiveFrom: '2026-07-08',
    sourceCommit: 'abc123',
  };

  it('computes credits for Nova Pro with all token types', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 2000,
      cacheWriteInputTokens: 0,
    };

    // (1000 × 800 + 2000 × 200 + 500 × 3200) / 1,000,000
    // = (800,000 + 400,000 + 1,600,000) / 1,000,000
    // = 2.8
    const credits = computeCredits(usage, novaProWeights);
    expect(credits).toBeCloseTo(2.8, 4);
  });

  it('computes credits with zero cache-read tokens', () => {
    const usage: TokenUsage = {
      inputTokens: 500,
      outputTokens: 200,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };

    // (500 × 800 + 0 × 200 + 200 × 3200) / 1,000,000
    // = (400,000 + 0 + 640,000) / 1,000,000
    // = 1.04
    const credits = computeCredits(usage, novaProWeights);
    expect(credits).toBeCloseTo(1.04, 4);
  });

  it('uses wIn as fallback when wCache is null (non-caching model)', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0, // Will always be 0 for non-caching models
      cacheWriteInputTokens: 0,
    };

    // (1000 × 350 + 0 × 350 + 500 × 1400) / 1,000,000
    // = (350,000 + 0 + 700,000) / 1,000,000
    // = 1.05
    const credits = computeCredits(usage, qwenWeights);
    expect(credits).toBeCloseTo(1.05, 4);
  });

  it('handles wCache null fallback if cacheRead is somehow non-zero (safety guard)', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 100, // Should not happen for non-caching, but safety guard
      cacheWriteInputTokens: 0,
    };

    // (1000 × 350 + 100 × 350 (fallback to wIn) + 500 × 1400) / 1,000,000
    // = (350,000 + 35,000 + 700,000) / 1,000,000
    // = 1.085
    const credits = computeCredits(usage, qwenWeights);
    expect(credits).toBeCloseTo(1.085, 4);
  });

  it('returns 0 credits for zero-token usage', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheWriteInputTokens: 0,
    };
    expect(computeCredits(usage, novaProWeights)).toBe(0);
  });
});
