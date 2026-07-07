# api-core Tasks 7–9 (REQUIRES-HUMAN surface) — Owner Sign-off

**Date:** 2026-07-07
**Surface:** Lambda authorizer + ApiStack + tenant-data IAM role
**Commits:** 014da4a (Task 7 ApiStack), 65c1a59 (Task 8 authorizer), 7054c5f (Task 9 role),
a41bbd9 (surface hardening FIX-1..FIX-5)
**Owner decision (verbatim):** "Approve — proceed to Task 10"
**Architect basis:** independent code re-review + `npx vitest --run` (223/223) — report NOT trusted.

## Verified before sign-off
- Layer-1 Pool-A rejection genuine: jose jwtVerify with issuer pinned to Pool B / Pool C JWKS;
  non-B/C issuer (incl. Pool A), expired, bad-sig all rejected before role logic.
- FIX-1 audience validation LIVE and wired end-to-end: authorizer pins `audience` per pool
  (POOL_B_CLIENT_IDS vs jwksB, POOL_C_CLIENT_IDS vs jwksC); IdentityStack has real app clients
  (pool.addClient) exporting poolBClientId/poolCClientId → cumplify-stage → ApiStackProps →
  authorizer env. Not vacuous.
- FIX-2 excludeVerboseContent: true (no JWT/resolverContext in CloudWatch).
- FIX-3 IAM5 suppression scoped: Lambda log wildcards path-scoped; tenant-data role index/*
  gets its own suppression citing LeadingKeys + ACC-2 proof.
- FIX-4 explicit Deny on sts:TagSession when aws:RequestTag/tenantId contains '#'.
- FIX-5 (owner-permitted path): ALTER ROLE sync kept; plaintext-in-SQL transit documented;
  rds-data CloudTrail data events confirmed OFF in dev; single-user rotation named as prod carry.
- tenant-data role: FF-3 pattern correct (composite trust on resolver exec roles, TagSession,
  bare tenantId, LeadingKeys prepends TENANT#); untagged assume fails closed.
- authorizer DDB: GetItem-only, LeadingKeys TENANT#*, KMS decrypt granted.
- ID-token-only, custom:tenantId presence, 10s timeout, WAF associated, AWS_LAMBDA default +
  AWS_IAM additional, cache TTL 300s.

## Tracked (not code defects — carried past sign-off)
- R-1 (GSI isolation): index/* + LeadingKeys is a known DynamoDB nuance. PROVEN at ACC-2 Task 14
  cross-tenant GSI probe. Architect will NOT sign CARRY-1 matrix green without denied result;
  if it does not isolate, index/* is pulled and GSI access redesigned.
- A-2 (entitlement fail-open): authorizer entitlement DDB read defaults on failure. Acceptable P1
  (no enforcement). MUST become fail-closed for suspended/EXPIRED tenants at P2 billing
  (ties to ai-core EXPIRED-flag carry).
- P-1/P-4 (app_role secret): static creds, deploy-time password sync. Enable Secrets Manager
  single-user rotation before prod; rotation Lambda then owns the password.

## Disposition
Sign-off GRANTED. Proceed to Task 10 (resolvers — C-2 transaction-local set_config lives here)
+ Task 11 (subscriptions), both [KIRO]. Architect reviews 10/11, then Task 12 deploy + the
acceptance proofs (Tasks 13–18) under standing owner authorization. No deploy before 10/11 land
and are reviewed.
