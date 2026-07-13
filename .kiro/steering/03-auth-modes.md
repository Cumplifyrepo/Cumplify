---
inclusion: fileMatch
fileMatchPattern: "{**/*.graphql,services/api/**}"
---
# AppSync Auth Modes (spine D.2 + Part 24.1)
Two auth modes, one authorization brain. Never mix them on the wrong surface.

## Source of truth
The DEPLOYED schema is the only authority on fields, args, and directives —
read it, never recall it: #[[file:services/api/schema/schema.graphql]]
Mechanical invariants (no extend blocks, SCHEMA-5, subscription tenantId
args, auth directives) are enforced by
`services/api/__tests__/schema-guard.test.ts` — it runs in every
`npm run test` and via the schema-guard hook on save. Never weaken it.

## Modes (as deployed — FIX-1)
- `@aws_lambda` (AWS_LAMBDA auth mode) = ALL user-facing operations. The
  Lambda authorizer verifies the Cognito **ID token** (issuer + pinned
  audience of Pool B/C app clients) and returns `resolverContext.tenantId`,
  `role`, `permissions` via ABAC. Entitlement stamp (plan, seats, features)
  included. (`@aws_cognito` is NOT used on this API — superseded by FIX-1.)
- `@aws_iam` = agent-to-agent / service-to-service writes.
- Why: one authorizer brain, two front doors — AppSync and API Gateway share
  the same ABAC logic.

## Rules
1. User mutations (publish doc, close CAPA, evaluate obligation) annotate
   `@aws_lambda`. Clients pass the Cognito-issued ID token as `authToken`
   (tenantId is in the ID token only, never the access token); resolvers
   read tenant identity from `resolverContext` ONLY.
2. Agent writes (appendAuditEvent, publishAgentMessage) annotate `@aws_iam`.
   The calling Lambda's role carries `aws:PrincipalTag/tenantId`.
3. Subscriptions use a **None** data source. The subscription resolver MUST
   verify `tenantId` against the caller's claim before delivering events.
   A subscriber can never receive another tenant's events.
4. WAFv2 REGIONAL scope protects AppSync via `api.graphQLEndpointArn`.
5. CfnApiCache provides per-resolver TTL for read-heavy register queries
   (complements ElastiCache).

## Public API (Part 24.1)
- api.cumplify.ai → API Gateway REST API, same Lambda-authorizer ABAC path.
- AuthN: OAuth2 client-credentials (Cognito app clients per tenant) OR scoped
  API keys. Every token/key carries tenantId + scopes.
- Rate limits per tenant per plan (Launch 60rpm / Pro 300rpm / Enterprise
  contracted); 429 with Retry-After.
- Scopes: read/write per resource, plan-gated (read-only on Launch; full on
  Enterprise). Publishing approval cannot be API-bypassed (HITL stays in-app).
- Why: the API is a door, never a tunnel — same auth, same audit trail.

## Anti-pattern (review-blocking)
Any resolver that reads/writes tenant data without asserting `tenantId` from
the authorizer context is a security defect regardless of functional correctness.
