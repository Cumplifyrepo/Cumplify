/**
 * Unit tests for profile resolver.
 * Tests: getProfile (found + not found), updateProfile (valid + invalid locale).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDdbSend } = vi.hoisted(() => {
  process.env.CLUSTER_ARN = 'arn:aws:rds:us-east-1:123:cluster:test';
  process.env.APP_ROLE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:app-role';
  process.env.TABLE_NAME = 'CumplifyCore';
  process.env.BUS_NAME = 'cumplify-events';
  process.env.TENANT_DATA_ROLE_ARN = 'arn:aws:iam::123:role/tenant-data-role';
  process.env.REGION = 'us-east-1';

  const mockDdbSend = vi.fn();
  return { mockDdbSend };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = mockDdbSend;
  },
  GetItemCommand: class {
    constructor(public input: unknown) {}
  },
  PutItemCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: class {
    send = vi.fn().mockResolvedValue({
      Credentials: {
        AccessKeyId: 'AKIA_TEST',
        SecretAccessKey: 'secret',
        SessionToken: 'token',
        Expiration: new Date(Date.now() + 900_000),
      },
    });
  },
  AssumeRoleCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-rds-data', () => ({
  RDSDataClient: class {
    send = vi.fn();
  },
  BeginTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  CommitTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  RollbackTransactionCommand: class {
    constructor(public input: unknown) {}
  },
  ExecuteStatementCommand: class {
    constructor(public input: unknown) {}
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

vi.mock('../../../../eventing/src/publisher.js', () => ({
  publish: vi.fn().mockResolvedValue('mock-event-id'),
}));

import { handler } from '../../src/resolvers/profile.js';

function makeEvent(fieldName: string, args: Record<string, unknown> = {}) {
  return {
    info: { fieldName },
    arguments: args,
    identity: {
      resolverContext: {
        tenantId: 'tenant-001',
        sub: 'user-abc',
        role: 'Employee',
        poolClass: 'tenant-user',
        entitlement: '{}',
      },
    },
  };
}

beforeEach(() => {
  mockDdbSend.mockReset();
});

describe('profile resolver — getProfile', () => {
  it('returns profile when item exists', async () => {
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    mockDdbSend.mockResolvedValueOnce({
      Item: marshall({
        PK: 'TENANT#tenant-001#PROFILE',
        SK: 'USER#user-abc',
        locale: 'es',
        updatedAt: '2024-01-15T10:00:00.000Z',
      }),
    });

    const result = await handler(makeEvent('getProfile'));
    expect(result).toEqual({
      userId: 'user-abc',
      locale: 'es',
      updatedAt: '2024-01-15T10:00:00.000Z',
    });
  });

  it('returns default profile when item not found', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent('getProfile'));
    expect(result).toEqual({
      userId: 'user-abc',
      locale: 'en',
      updatedAt: null,
    });
  });
});

describe('profile resolver — updateProfile', () => {
  it('upserts profile with valid locale', async () => {
    mockDdbSend.mockResolvedValueOnce({}); // PutItem response

    const result = await handler(makeEvent('updateProfile', { input: { locale: 'pt' } }));
    expect(result).toMatchObject({
      userId: 'user-abc',
      locale: 'pt',
    });
    expect((result as { updatedAt: string }).updatedAt).toBeTruthy();
    expect(mockDdbSend).toHaveBeenCalledTimes(1);
  });

  it('throws error for invalid locale', async () => {
    await expect(handler(makeEvent('updateProfile', { input: { locale: 'fr' } }))).rejects.toThrow(
      'Invalid locale "fr"',
    );
  });

  it('accepts all valid locales: en, es, pt', async () => {
    for (const locale of ['en', 'es', 'pt']) {
      mockDdbSend.mockResolvedValueOnce({});
      const result = await handler(makeEvent('updateProfile', { input: { locale } }));
      expect((result as { locale: string }).locale).toBe(locale);
    }
  });
});

describe('profile resolver — getTenantSettings', () => {
  it('returns tenant name + document locale when the ORG item exists', async () => {
    const { marshall } = await import('@aws-sdk/util-dynamodb');
    mockDdbSend.mockResolvedValueOnce({
      Item: marshall({
        PK: 'TENANT#tenant-001#META',
        SK: 'ORG',
        tenantName: 'Acme Manufacturing',
        documentLocale: 'es',
      }),
    });

    const result = await handler(makeEvent('getTenantSettings'));
    expect(result).toEqual({ tenantName: 'Acme Manufacturing', documentLocale: 'es' });
    const [call] = mockDdbSend.mock.calls[0];
    expect(call.input.Key).toEqual({ PK: { S: 'TENANT#tenant-001#META' }, SK: { S: 'ORG' } });
  });

  it('defaults gracefully (tenantId as name, en locale) when no ORG item exists yet', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const result = await handler(makeEvent('getTenantSettings'));
    expect(result).toEqual({ tenantName: 'tenant-001', documentLocale: 'en' });
  });
});

describe('profile resolver — error handling', () => {
  it('throws on unknown field', async () => {
    await expect(handler(makeEvent('unknownField'))).rejects.toThrow('Unknown field: unknownField');
  });
});
