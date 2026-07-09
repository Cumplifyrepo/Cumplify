/**
 * Unit tests for credit-precheck module.
 * Verifies: exhausted blocks; incident exemption passes; HITL exemption passes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvokeError } from '../src/types.js';

// Mock DynamoDB
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: class {
      send = mockSend;
    },
    GetItemCommand: class {
      input: unknown;
      constructor(input: unknown) { this.input = input; }
    },
  };
});

// Set env before import
vi.stubEnv('TABLE_NAME', 'CumplifyCore');

const { checkCreditBalance } = await import('../src/credit-precheck.js');

describe('credit-precheck', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('skips pre-check when creditExempt is true (incident/HITL exemption)', async () => {
    // Should not call DynamoDB at all
    await expect(checkCreditBalance('tenant-1', true)).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('passes when credits are within grant', async () => {
    // First call: meter read
    mockSend.mockResolvedValueOnce({
      Item: { creditsUsed: { N: '5000' } },
    });
    // Second call: entitlement read
    mockSend.mockResolvedValueOnce({
      Item: {
        monthlyGrant: { N: '30000' },
        paygoEnabled: { BOOL: false },
        autoRefill: { BOOL: false },
        planTier: { S: 'launch' },
      },
    });

    await expect(checkCreditBalance('tenant-1', false)).resolves.toBeUndefined();
  });

  it('throws PAUSED_FOR_CREDITS when grant exhausted (no auto-refill)', async () => {
    mockSend.mockResolvedValueOnce({
      Item: { creditsUsed: { N: '31000' } },
    });
    mockSend.mockResolvedValueOnce({
      Item: {
        monthlyGrant: { N: '30000' },
        paygoEnabled: { BOOL: false },
        autoRefill: { BOOL: false },
        planTier: { S: 'launch' },
      },
    });

    try {
      await checkCreditBalance('tenant-1', false);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvokeError);
      expect((err as InvokeError).code).toBe('PAUSED_FOR_CREDITS');
    }
  });

  it('does not block enterprise with auto-refill even when over grant', async () => {
    mockSend.mockResolvedValueOnce({
      Item: { creditsUsed: { N: '250000' } },
    });
    mockSend.mockResolvedValueOnce({
      Item: {
        monthlyGrant: { N: '200000' },
        paygoEnabled: { BOOL: true },
        autoRefill: { BOOL: true },
        planTier: { S: 'enterprise' },
      },
    });

    await expect(checkCreditBalance('tenant-1', false)).resolves.toBeUndefined();
  });

  it('applies trial defaults (15,000) when no entitlement record exists', async () => {
    mockSend.mockResolvedValueOnce({
      Item: { creditsUsed: { N: '14000' } },
    });
    mockSend.mockResolvedValueOnce({ Item: undefined }); // no entitlement

    await expect(checkCreditBalance('tenant-1', false)).resolves.toBeUndefined();
  });

  it('blocks on trial defaults when exhausted', async () => {
    mockSend.mockResolvedValueOnce({
      Item: { creditsUsed: { N: '16000' } },
    });
    mockSend.mockResolvedValueOnce({ Item: undefined }); // no entitlement

    await expect(checkCreditBalance('tenant-1', false)).rejects.toThrow(InvokeError);
  });
});
