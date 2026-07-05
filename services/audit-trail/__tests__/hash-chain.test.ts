import { describe, it, expect } from 'vitest';
import { computePrevHash, computePayloadHash, GENESIS_HASH } from '../src/hash-chain.js';
import { createHash } from 'node:crypto';

describe('hash-chain', () => {
  describe('computePrevHash', () => {
    it('produces a deterministic SHA-256 hex digest', () => {
      const pk = 'TENANT#t1#AUDITLOG';
      const sk = 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001';
      const payloadHash = 'abc123def456';

      const result = computePrevHash(pk, sk, payloadHash);

      // Manually compute expected
      const expected = createHash('sha256')
        .update(`${pk}${sk}${payloadHash}`)
        .digest('hex');

      expect(result).toBe(expected);
      expect(result).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('produces different output for different inputs', () => {
      const hash1 = computePrevHash('PK1', 'SK1', 'hash1');
      const hash2 = computePrevHash('PK2', 'SK2', 'hash2');
      expect(hash1).not.toBe(hash2);
    });

    it('is consistent across multiple calls with same input', () => {
      const args = ['TENANT#x#AUDITLOG', 'EVENT#2026-01-01T00:00:00.000Z#ulid1', 'deadbeef'] as const;
      const first = computePrevHash(...args);
      const second = computePrevHash(...args);
      expect(first).toBe(second);
    });
  });

  describe('computePayloadHash', () => {
    it('hashes canonical {before, after} JSON', () => {
      const payload = { before: { status: 'open' }, after: { status: 'closed' } };
      const result = computePayloadHash(payload);

      const expected = createHash('sha256')
        .update(JSON.stringify({ before: { status: 'open' }, after: { status: 'closed' } }))
        .digest('hex');

      expect(result).toBe(expected);
    });

    it('defaults missing before/after to null', () => {
      const payload = { someOtherField: 'value' };
      const result = computePayloadHash(payload);

      const expected = createHash('sha256')
        .update(JSON.stringify({ before: null, after: null }))
        .digest('hex');

      expect(result).toBe(expected);
    });

    it('uses only before and after, ignoring other fields', () => {
      const payload1 = { before: null, after: { x: 1 }, extra: 'noise' };
      const payload2 = { before: null, after: { x: 1 } };
      expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload2));
    });
  });

  describe('GENESIS_HASH', () => {
    it('is the string "GENESIS"', () => {
      expect(GENESIS_HASH).toBe('GENESIS');
    });
  });
});
