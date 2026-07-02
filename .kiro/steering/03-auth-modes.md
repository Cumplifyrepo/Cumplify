---
inclusion: fileMatch
fileMatchPattern: "{**/*.graphql,services/api/**}"
---
# AppSync Auth Modes (spine D.2 + Part 24.1)
Two auth modes, one authorization brain. Never mix them on the wrong surface.

## Modes
- `@aws_cognito` (COGNITO_USER_POOLS) = user-facing operations.
- `@aws_iam` = agent-to-agent / service-to-service writes.
- Lambda Authorizer: returns `resolverContext.tenantId`, `role`, `permissions`
  via ABAC. Entitlement stamp (plan, seats, features) included.
- Why: one authorizer brain, two front doors — AppSync and API Gateway share
  the same ABAC logic.

## Rules
1. User mutations (publish doc, close CAPA, evaluate obligation) annotate
   `@aws_cognito`. The resolver reads the Cognito-issued ID token (tenantId
   is in the ID token only, never the access token).
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
