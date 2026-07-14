import { describe, it, expect } from 'vitest';
import {
  assertWorkloadAccountBoundary,
  ENV_CONFIGS,
  MGMT_ACCOUNT,
  type EnvConfig,
} from './env-config.js';

// Minimal valid EnvConfig factory for boundary tests (fields beyond account
// are irrelevant to the guardrail).
function cfg(account: string): EnvConfig {
  return {
    envName: 'dev',
    account,
    region: 'us-east-1',
    auditArchiveRetentionDays: 1,
    evidenceRetentionDays: 1,
    evidenceRetentionMode: 'GOVERNANCE',
    alertEmail: 'test-alerts@example.com',
    availabilityZones: ['us-east-1b', 'us-east-1c'],
    globalTableReplica: false,
    drRegionStack: false,
    secretsReplica: false,
    s3Crr: false,
    aossStandby: false,
    auroraMinCapacity: 0,
    auroraMaxCapacity: 4,
    cacheMultiAz: false,
    cacheNodeType: 'cache.t4g.micro',
  };
}

describe('workload/management account boundary guardrail', () => {
  it('accepts the real ENV_CONFIGS (dev/staging/prod, distinct, none = mgmt)', () => {
    expect(() => assertWorkloadAccountBoundary(ENV_CONFIGS)).not.toThrow();
  });

  it('throws if any workload env targets the management account', () => {
    expect(() =>
      assertWorkloadAccountBoundary({ dev: cfg(MGMT_ACCOUNT) }),
    ).toThrow(/management account/i);
  });

  it('throws on account collision between two envs', () => {
    expect(() =>
      assertWorkloadAccountBoundary({
        dev: cfg('111111111111'),
        staging: cfg('111111111111'),
      }),
    ).toThrow(/collision/i);
  });

  it('no ENV_CONFIGS entry equals the management account', () => {
    for (const c of Object.values(ENV_CONFIGS)) {
      expect(c.account).not.toBe(MGMT_ACCOUNT);
    }
  });
});
