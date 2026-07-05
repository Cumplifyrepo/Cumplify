# HITL Sign-off — immutable-trail Task 6 (REQUIRES-HUMAN gate)

**Commit reviewed:** 421f2fe (tasks 1–5 build) + this remediation commit
**Date:** 2026-07-05
**Gate:** Task 6 — no deploy proceeds until owner authorizes the three REQUIRES-HUMAN artifacts.

## Artifacts presented to the owner (architect review summary)

1. **IAM Deny policy** — design §5.1/§5.2 + `infra/lib/audit-trail-stack.ts`.
   Explicit `Deny` on 5 actions (`UpdateItem`, `DeleteItem`, `BatchWriteItem`,
   `PartiQLUpdate`, `PartiQLDelete`) against CumplifyCore, conditioned on
   `ForAnyValue:StringLike` `dynamodb:LeadingKeys` = `TENANT#*#AUDITLOG`,
   attached to all 4 Lambda roles.
2. **WORM sealer handler** — `services/audit-trail/handlers/sealer.ts`.
   DynamoDB Stream (INSERT + itemType=AUDITLOG) → S3 `PutObject` with
   `ObjectLockMode: COMPLIANCE`, retention from env (dev 1 day / prod 2555 days),
   `ChecksumAlgorithm: SHA256`.
3. **Sealer IAM permissions** — design §6.2 / stack. Minimal: KMS decrypt (stream),
   `s3:PutObject` + `s3:PutObjectRetention` on the archive bucket only, KMS encrypt (S3).

## Architect independent verification (template + tests, 2026-07-05)

- Synthesized `Dev-AuditTrailStack` template audited directly:
  - Deny policy: 5 actions + `ForAnyValue:StringLike` LeadingKeys, attached to 4/4 roles. ✓
  - Sealer ESM filter: `INSERT` + `NewImage.itemType.S=[AUDITLOG]`. ✓
  - Tripwire ESM filter: `MODIFY,REMOVE` + `OldImage.itemType.S=[AUDITLOG]`. ✓
  - `events:PutEvents` absent from entire template (LOOP-3). ✓
  - Archive bucket: Object Lock COMPLIANCE, 1-day retention (dev). ✓
  - CDK Nag: 0 Non-Compliant (Dev/Staging/Prod). ✓
- Full test suite: 80/80 green, incl. replay-detection, SHA256-checksum,
  itemType-filter, and 5-action-Deny assertions.

## Owner decision

The owner (Julio, account owner) was presented the three artifacts above in the
architect's review of 421f2fe and directed the architect to proceed, verbatim:

> "please proceed to setup the next step, you have all the necessary credentials"

**Scope of this authorization:** owner GO for the **DEV** deployment
(account 697114252993, `auditArchiveRetentionDays: 1` — sealed test objects are
physically immutable for 24h only). This is owner authorization informed by the
architect's review summary; it is not a line-by-line human code audit.

**Carried forward for the owner before the PROD gate:** production uses
`auditArchiveRetentionDays: 2555` (7-year COMPLIANCE — physically undeletable by
anyone, including root, for 7 years). That permanence dimension warrants a
dedicated owner review at the prod-promotion gate, separate from this dev GO.

**Status: APPROVED for dev deployment.**
