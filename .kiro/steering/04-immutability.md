---
inclusion: fileMatch
fileMatchPattern: "{services/audit-trail/**,**/*audit*}"
---
# Immutable Audit Trail (spine E.1 + Part 18.2 ES-3/ES-4/ES-5)
Three-layer enforcement. No single control is trusted alone.

## Layer 1 — Application (append-only writes)
- Every state transition emits an audit event via `appendAuditEvent` (@aws_iam)
  or RecordsVault using `PutItem` + `attribute_not_exists(pk)` (idempotent).
- Item schema:
  PK = TENANT#<tenantId>#AUDITLOG
  SK = EVENT#<ISO8601>#<ulid>
  eventType, actor, module, clauseRef, standard,
  payloadHash = sha256(before,after),
  prevHash = hash of previous event (hash chain)
- Why: attribute_not_exists makes overwrites impossible at the API level;
  the hash chain makes any tampering detectable.

## Layer 2 — IAM (no Update/Delete)
- The writer role has NO `UpdateItem` / `DeleteItem` on AUDITLOG items.
- Not even the admin role can modify sealed audit events.
- Why: defence-in-depth — even a code bug cannot overwrite history.

## Layer 3 — Storage (WORM sealing)
- DynamoDB Streams (24h retention) feed an S3 Object Lock COMPLIANCE sealer.
- COMPLIANCE mode = not even root can delete/overwrite within retention.
- Retrieval: AOSS `audit-trail-retrieval` index (45s cold-start budget +
  exponential-backoff retry per 02-aoss-rule.md).
- Why: physical immutability beyond IAM — the final word.

## Part 18.2 eQMS requirements satisfied
- ES-3: Signature cryptographically bound to record version — signature event
  carries `docVersionHash` and enters the hash chain.
- ES-4: Secure, time-stamped audit trail protected from alteration including
  by admins — all three layers exceed this requirement.
- ES-5: Human-readable + electronic copies producible for inspection —
  audit-trail export + record bundles.

## Build rules
- Every mutation in any spec MUST name its audit event in design BEFORE
  implementation (evidence-first rule from 14-simplicity.md).
- Every clauseRef in an audit event must exist in the canonical spine
  (validated by the clause-integrity hook).
- An audit-trail code path without all three layers passing review is a
  blocking defect.
