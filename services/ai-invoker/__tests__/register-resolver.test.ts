/**
 * Unit tests for register-resolver.
 * Verifies: ASSIGNED passes, EXPIRED fails, UNASSIGNED fails, past-expiry fails.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveModel, resetCache } from '../src/register-resolver.js';
import { InvokeError } from '../src/types.js';
import type { CompiledRegister } from '../src/types.js';

function makeRegister(overrides: Partial<CompiledRegister['seats']['workhorse']> = {}): CompiledRegister {
  return {
    seats: {
      workhorse: {
        modelId: 'us.amazon.nova-pro-v1:0',
        status: 'ASSIGNED',
        expiry: '2099-12-31',
        marginHeadroom: 0.948,
        tier: 'workhorse',
        cachingSupported: true,
        ...overrides,
      },
    } as CompiledRegister['seats'],
    compiledAt: '2026-07-08T00:00:00Z',
    sourceCommit: 'abc1234',
  };
}

describe('register-resolver', () => {
  beforeEach(() => {
    resetCache();
  });

  it('resolves an ASSIGNED seat with future expiry', () => {
    const reg = makeRegister({ status: 'ASSIGNED', expiry: '2099-12-31' });
    const entry = resolveModel('workhorse', reg);
    expect(entry.modelId).toBe('us.amazon.nova-pro-v1:0');
    expect(entry.status).toBe('ASSIGNED');
  });

  it('resolves a PROVISIONAL seat with future expiry', () => {
    const reg = makeRegister({ status: 'PROVISIONAL', expiry: '2099-12-31' });
    const entry = resolveModel('workhorse', reg);
    expect(entry.modelId).toBe('us.amazon.nova-pro-v1:0');
    expect(entry.status).toBe('PROVISIONAL');
  });

  it('throws MODEL_SEAT_EXPIRED for EXPIRED status', () => {
    const reg = makeRegister({ status: 'EXPIRED' });
    expect(() => resolveModel('workhorse', reg)).toThrow(InvokeError);
    try {
      resolveModel('workhorse', reg);
    } catch (err) {
      expect((err as InvokeError).code).toBe('MODEL_SEAT_EXPIRED');
    }
  });

  it('throws MODEL_SEAT_UNASSIGNED for UNASSIGNED status', () => {
    const reg = makeRegister({ status: 'UNASSIGNED', modelId: '' });
    expect(() => resolveModel('workhorse', reg)).toThrow(InvokeError);
    try {
      resolveModel('workhorse', reg);
    } catch (err) {
      expect((err as InvokeError).code).toBe('MODEL_SEAT_UNASSIGNED');
    }
  });

  it('throws MODEL_SEAT_EXPIRED when expiry date is in the past (live check)', () => {
    const reg = makeRegister({ status: 'ASSIGNED', expiry: '2020-01-01' });
    expect(() => resolveModel('workhorse', reg)).toThrow(InvokeError);
    try {
      resolveModel('workhorse', reg);
    } catch (err) {
      expect((err as InvokeError).code).toBe('MODEL_SEAT_EXPIRED');
      expect((err as InvokeError).message).toContain('2020-01-01');
    }
  });

  it('resolves a seat with null expiry (contingent — no date check)', () => {
    const reg = makeRegister({ status: 'PROVISIONAL', expiry: null });
    const entry = resolveModel('workhorse', reg);
    expect(entry.status).toBe('PROVISIONAL');
  });

  it('throws for unknown seat ID', () => {
    const reg = makeRegister();
    expect(() => resolveModel('nonexistent' as any, reg)).toThrow(InvokeError);
  });
});
