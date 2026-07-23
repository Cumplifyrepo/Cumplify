/**
 * billing resolver — createBillingPortalSession dispatch test.
 * Hermetic: Secrets Manager + Stripe SDK fully mocked; no network, no AWS.
 * Pins:
 * - tenantId from resolverContext (SCHEMA-5); mapped customer reused, no create
 * - unmapped tenant → stripe.customers.create stamped with tenantId
 * - returnUrl validated BEFORE any secret read (INVALID_RETURN_URL)
 * - missing secretKey → STRIPE_NOT_CONFIGURED (billing stays inert)
 * - portal session gets return_url + the stored configuration id
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSecretSend, mockCustomersCreate, mockPortalCreate } = vi.hoisted(() => ({
  mockSecretSend: vi.fn(),
  mockCustomersCreate: vi.fn(),
  mockPortalCreate: vi.fn(),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = mockSecretSend;
  },
  GetSecretValueCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('stripe', () => ({
  default: class {
    customers = { create: mockCustomersCreate };
    billingPortal = { sessions: { create: mockPortalCreate } };
    constructor(public key: string) {}
  },
}));

vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    appendKeys = vi.fn();
  },
}));

// Read at CALL time inside the handler — set before import.
process.env.STRIPE_SECRET_NAME = 'cumplify/test/stripe';

import { handler } from '../../src/resolvers/billing.js';

function makeEvent(args: Record<string, unknown> = {}, ctx: Record<string, string> | null = {}) {
  return {
    info: { fieldName: 'createBillingPortalSession' },
    arguments: args,
    identity:
      ctx === null ? {} : { resolverContext: { tenantId: 'tenant-AAA', sub: 'u', role: 'IMSLead', ...ctx } },
  };
}

const secretResp = (obj: Record<string, unknown>) => ({ SecretString: JSON.stringify(obj) });
const RETURN_URL = 'https://app.example.com/billing';

beforeEach(() => {
  mockSecretSend.mockReset();
  mockCustomersCreate.mockReset();
  mockPortalCreate
    .mockReset()
    .mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test_live' });
});

describe('createBillingPortalSession', () => {
  it('reuses the mapped tenant customer, mints a portal session with the stored configuration, returns url', async () => {
    mockSecretSend.mockResolvedValueOnce(
      secretResp({
        secretKey: 'sk_test_x',
        portalConfigurationId: 'bpc_x',
        customersByTenant: { 'tenant-AAA': 'cus_mapped' },
      }),
    );

    const result = (await handler(makeEvent({ returnUrl: RETURN_URL }))) as { url: string };

    expect(result.url).toBe('https://billing.stripe.com/p/session/test_live');
    expect(mockCustomersCreate).not.toHaveBeenCalled(); // mapped → no create
    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_mapped',
      return_url: RETURN_URL,
      configuration: 'bpc_x',
    });
  });

  it('creates a Stripe customer stamped with tenantId when the tenant is unmapped', async () => {
    mockSecretSend.mockResolvedValueOnce(
      secretResp({ secretKey: 'sk_test_x', portalConfigurationId: 'bpc_x', customersByTenant: {} }),
    );
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' });

    await handler(makeEvent({ returnUrl: RETURN_URL }));

    expect(mockCustomersCreate).toHaveBeenCalledWith({ metadata: { tenantId: 'tenant-AAA' } });
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_new', return_url: RETURN_URL }),
    );
  });

  it('omits configuration when the secret has none', async () => {
    mockSecretSend.mockResolvedValueOnce(
      secretResp({ secretKey: 'sk_test_x', customersByTenant: { 'tenant-AAA': 'cus_mapped' } }),
    );

    await handler(makeEvent({ returnUrl: RETURN_URL }));

    expect(mockPortalCreate).toHaveBeenCalledWith({
      customer: 'cus_mapped',
      return_url: RETURN_URL,
    });
  });

  it('rejects a missing/non-http returnUrl BEFORE reading the secret (INVALID_RETURN_URL)', async () => {
    await expect(handler(makeEvent({}))).rejects.toThrow('INVALID_RETURN_URL');
    await expect(handler(makeEvent({ returnUrl: 'javascript:alert(1)' }))).rejects.toThrow(
      'INVALID_RETURN_URL',
    );
    expect(mockSecretSend).not.toHaveBeenCalled();
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it('throws STRIPE_NOT_CONFIGURED when the secret has no secretKey', async () => {
    mockSecretSend.mockResolvedValueOnce(secretResp({ portalConfigurationId: 'bpc_x' }));
    await expect(handler(makeEvent({ returnUrl: RETURN_URL }))).rejects.toThrow(
      'STRIPE_NOT_CONFIGURED',
    );
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it('fails closed when resolverContext.tenantId is absent (SCHEMA-5)', async () => {
    await expect(handler(makeEvent({ returnUrl: RETURN_URL }, null))).rejects.toThrow(
      'resolverContext.tenantId',
    );
    expect(mockSecretSend).not.toHaveBeenCalled();
  });
});
