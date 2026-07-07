# api-core Design R1 — Owner Ratification of REQUIRES-HUMAN Decisions

**Date:** 2026-07-07
**Design under review:** design.md R1 (commit 4554370)
**Requirements baseline:** R3 + amendments A-1..A-5 (ad1d574, 4554370)
**Owner sign-off (verbatim):** "approved"
**Presented by:** Architect, with independent validation of design R1 against
corpus (module-spec, architecture C.1/D.2, steering 01/03/16, contracts/events.md)
and the spec-30 live-verified EventBridge routing truth table
(.kiro/evidence/model-policy-evals/micro-routing-truth-table.md).

---

## Ratified Decisions

### OQ-1 — AUTH-7: user-facing auth mechanism = option (a) AWS_LAMBDA
A Lambda authorizer validates Pool B/C ID tokens via JWKS, rejects Pool A
(16-identity-boundaries Layer 1) before any role logic, performs ABAC, and
returns `resolverContext` {tenantId, role, poolClass, sub, entitlement}.
Single ABAC brain, reusable for the Part 24.1 API Gateway surface.
Requirements API-1/API-2/SCHEMA-2 supersession notes now RESOLVE to
`AWS_LAMBDA` / `@aws_lambda`. Authorizer code + IAM remain REQUIRES-HUMAN
per C-2/AUTH-5 (owner reviews diffs before merge/deploy).

### OQ-2 — RDS-4: Lambda-to-Aurora connectivity = option (a) RDS Data API
Zero standing cost (Part 27 compliant), no VPC cold start, transaction-scoped
tenant context. Includes the DataStack amendment: `enableDataApi: true` on the
existing Aurora cluster (runtime property change, no replacement) plus
`clusterArn`/`dbSecretArn` exports. RDS Proxy excluded (session pinning +
standing cost ~$44/mo dev).

### OQ-5 — Audit-trail routing: envelope `auditTrail` flag + R-3 rewrite
Root cause: design R1's declared mutation events, checked against the deployed
rules, showed only 2 of 13 reaching the audit sink (suffix-matching gap; five
events routed to zero rules — same defect class as spec 30's 22/50 zero-match
finding). Ratified structural fix:
1. Event envelope (contracts/events.md ET-4) gains a required
   `auditTrail: boolean` field.
2. Every registered detailType receives an explicit trail designation
   (appended registry section — append-only rule respected).
3. The spec-2 publisher stamps the flag from a registry-derived map; parity
   test asserts map ↔ events.md agreement.
4. EventingStack R-3 audit-sink rule pattern rewritten to
   `detail.auditTrail = [true]` — registration IS routing; the
   "registered-but-never-sealed" defect class is eliminated for M6–M13.
5. All other rules (R-1, R-2, R-4..R-7 fan-out routing) unchanged.
Rule change is a witnessed EventingStack amendment: template assertion +
live `TestEventPattern` verification, architect-executed.

## Architect-resolved open questions
- OQ-3: authorizer cache TTL 300s for dev — approved (entitlement staleness
  bounded by TTL; static stamp in P1 anyway per AUTH-3).
- OQ-4: M4 `onCalibrationDue` scheduler defers to task implementation.

## Bound to this ratification
Design R2 must also resolve architect findings D-1..D-10 (routing hole,
honest event semantics, tenant-data-role trust mechanics, operations
coverage, m1..m5 schema deviation recorded as corpus deviation with C.1
amendment carry, SECURITY DEFINER matview accessor, parameterized
set_config, real Pool-A token in ACC-3, removal of unverified CDK Nag rule
IDs, entitlement P1 = static stamp).
