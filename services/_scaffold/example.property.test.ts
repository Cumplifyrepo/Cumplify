/**
 * Property-based test scaffold — reference pattern for services/*
 *
 * This file demonstrates how to write a property-based test using fast-check
 * with Vitest. Every services/<name>/ directory (excluding _scaffold) must
 * contain at least one *.property.test.ts file per 13-testing.md.
 *
 * Pattern:
 * 1. Define an arbitrary generator for your input domain
 * 2. State the property (invariant) that must hold for ALL inputs
 * 3. fast-check explores the input space and reports counterexamples
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Example: a pure function under test
function normalizeCredits(raw: number, weight: number): number {
  return Math.round(raw * weight);
}

describe('normalizeCredits (property-based)', () => {
  it('always returns a non-negative integer when inputs are non-negative', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }), // raw tokens: non-negative integer
        fc.double({ min: 0.001, max: 10, noNaN: true }), // weight: positive float
        (raw, weight) => {
          const result = normalizeCredits(raw, weight);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result)).toBe(true);
        },
      ),
    );
  });

  it('is monotonically non-decreasing in raw when weight is fixed', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        fc.double({ min: 0.001, max: 10, noNaN: true }),
        (a, b, weight) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(normalizeCredits(hi, weight)).toBeGreaterThanOrEqual(normalizeCredits(lo, weight));
        },
      ),
    );
  });

  it('returns zero when raw is zero regardless of weight', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 10, noNaN: true }), (weight) => {
        expect(normalizeCredits(0, weight)).toBe(0);
      }),
    );
  });
});
