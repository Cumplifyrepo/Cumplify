/**
 * Hash-chain canonicalization tests (Task-11 live fix, architect).
 * Pins: payloadHash must be independent of object key order — DynamoDB
 * returns map keys lexicographically, so insertion-order hashing produced
 * a false tamper alarm live (byte-verified 2026-07-09).
 */
import { describe, it, expect } from 'vitest';
import { computePayloadHash, computePrevHash, GENESIS_HASH } from '../src/hash-chain.js';

describe('payloadHash key-order canonicalization (Task-11 live fix)', () => {
  it('hash is identical regardless of key insertion order (DDB round-trip)', () => {
    const insertionOrder = { before: null, after: { tool: 'capa-open', result: { records: 1 } } };
    const ddbOrder = { before: null, after: { result: { records: 1 }, tool: 'capa-open' } };
    expect(computePayloadHash(insertionOrder)).toBe(computePayloadHash(ddbOrder));
  });

  it('nested objects and arrays are canonicalized deeply', () => {
    const a = { after: { z: [{ b: 1, a: 2 }], m: { y: 1, x: 2 } }, before: null };
    const b = { before: null, after: { m: { x: 2, y: 1 }, z: [{ a: 2, b: 1 }] } };
    expect(computePayloadHash(a)).toBe(computePayloadHash(b));
  });

  it('different VALUES still produce different hashes', () => {
    expect(computePayloadHash({ before: null, after: { tool: 'a' } })).not.toBe(
      computePayloadHash({ before: null, after: { tool: 'b' } }),
    );
  });

  it('absent before/after default to null (constant hash preserved)', () => {
    expect(computePayloadHash({})).toBe(computePayloadHash({ unrelated: 'x' }));
  });

  it('prevHash unchanged (string concatenation, no ordering concern)', () => {
    expect(computePrevHash('PK', 'SK', 'hash')).toMatch(/^[0-9a-f]{64}$/);
    expect(GENESIS_HASH).toBe('GENESIS');
  });
});
