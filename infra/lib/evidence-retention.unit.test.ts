/**
 * Tripwire for the EvidenceVault Object-Lock retention config.
 *
 * The EvidenceVault default retention was hardcoded COMPLIANCE / 2555 days in
 * EVERY environment. Two real consequences, both caught 2026-07-14 before a
 * single object was written:
 *
 *   1. Dev poisoning — COMPLIANCE retention cannot be shortened or removed by
 *      ANY principal, including the account root. One sealed object and the
 *      dev bucket is undeletable (and un-emptyable) for seven years.
 *   2. Tenant retention policies became a lie — m4.retention_policies lets a
 *      tenant set e.g. 3-year retention with a disposition rule, but a 7-year
 *      COMPLIANCE default silently overrides it. ISO 9001 7.5.3 disposition
 *      and GDPR erasure both become impossible to honour.
 *
 * The bucket default is now a SAFETY NET only, parameterized per env; the real
 * retention is written per-object from the tenant's own policy.
 *
 * These tests exist so the hardcode cannot come back.
 */

import { describe, it, expect } from 'vitest';
import { ENV_CONFIGS } from './env-config.js';

describe('EvidenceVault Object-Lock retention (regression guard)', () => {
  it('dev and staging are GOVERNANCE — the bucket must stay disposable', () => {
    for (const env of ['dev', 'staging'] as const) {
      const cfg = ENV_CONFIGS[env];
      expect(cfg.evidenceRetentionMode, `${env} must not be COMPLIANCE`).toBe('GOVERNANCE');
      expect(cfg.evidenceRetentionDays, `${env} retention must be short`).toBeLessThanOrEqual(30);
    }
  });

  it('prod keeps a COMPLIANCE floor', () => {
    const prod = ENV_CONFIGS.prod;
    expect(prod.evidenceRetentionMode).toBe('COMPLIANCE');
    expect(prod.evidenceRetentionDays).toBe(2555);
  });

  it('no non-prod environment carries the 2555-day retention', () => {
    for (const [name, cfg] of Object.entries(ENV_CONFIGS)) {
      if (name === 'prod') continue;
      expect(cfg.evidenceRetentionDays, `${name} must not inherit the 7-year default`).not.toBe(
        2555,
      );
    }
  });

  it('the audit-archive bucket keeps its own independent retention knob', () => {
    // Regression: the two buckets must not be collapsed onto one setting —
    // the audit ledger and the evidence vault have different legal lifetimes.
    for (const cfg of Object.values(ENV_CONFIGS)) {
      expect(typeof cfg.auditArchiveRetentionDays).toBe('number');
      expect(typeof cfg.evidenceRetentionDays).toBe('number');
    }
  });
});
