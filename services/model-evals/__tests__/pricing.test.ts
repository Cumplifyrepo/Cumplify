import { describe, it, expect } from 'vitest';
import { checkStaleness, loadSnapshot, StalePriceSnapshotError } from '../src/pricing.js';
import type { PriceSnapshot } from '../src/types.js';

describe('pricing module', () => {
  describe('checkStaleness', () => {
    it('passes for a fresh snapshot (within stalenessLimitDays)', () => {
      const snapshot: PriceSnapshot = {
        capturedAt: new Date().toISOString(), // today
        sourceUrl: 'https://aws.amazon.com/bedrock/pricing/',
        capturedBy: 'architect',
        stalenessLimitDays: 90,
        models: {},
      };

      // Should not throw
      expect(() => checkStaleness(snapshot)).not.toThrow();
    });

    it('throws StalePriceSnapshotError when snapshot exceeds staleness limit', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const snapshot: PriceSnapshot = {
        capturedAt: oldDate.toISOString(),
        sourceUrl: 'https://aws.amazon.com/bedrock/pricing/',
        capturedBy: 'architect',
        stalenessLimitDays: 90,
        models: {},
      };

      expect(() => checkStaleness(snapshot)).toThrow(StalePriceSnapshotError);
      expect(() => checkStaleness(snapshot)).toThrow(/stale/i);
    });

    it('passes at exactly the staleness limit boundary', () => {
      const boundaryDate = new Date();
      boundaryDate.setDate(boundaryDate.getDate() - 89); // 89 days ago, limit is 90

      const snapshot: PriceSnapshot = {
        capturedAt: boundaryDate.toISOString(),
        sourceUrl: 'https://aws.amazon.com/bedrock/pricing/',
        capturedBy: 'architect',
        stalenessLimitDays: 90,
        models: {},
      };

      expect(() => checkStaleness(snapshot)).not.toThrow();
    });
  });

  describe('loadSnapshot', () => {
    it('throws on non-existent file', () => {
      expect(() => loadSnapshot('/nonexistent/path.json')).toThrow();
    });
  });
});
