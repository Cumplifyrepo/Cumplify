---
inclusion: always
---
# Tenant Isolation Rules (Part 9 + spine C.2)
Every data path enforces tenant isolation at the layer closest to storage.
A cross-tenant data leak is the highest-severity defect in this platform.

## DynamoDB (CumplifyCore)
- IAM condition: `dynamodb:LeadingKeys` + `ForAllValues:StringLike` on
  `aws:PrincipalTag/tenantId` restricts every principal to its own
  `TENANT#<tenantId>#*` partition.
- Why: PK-prefix isolation is the cheapest and most audit-friendly DynamoDB
  multi-tenancy pattern; it makes cross-tenant reads impossible at IAM, not
  just application logic.

## RDS PostgreSQL
- Row-Level Security (RLS) keyed to the Lambda-authorizer
  `resolverContext.tenantId`. Every table carries `tenant_id`; RLS policies
  are enforced on every session.
- Why: relational joins + RLS = tenant-safe reporting without per-tenant DBs.

## OpenSearch Serverless (AOSS)
- TENANT-DOCS-KB metadata filter on `tenantId` in every retrieval call.
  No unfiltered vector query may execute against tenant-scoped indexes.
- Why: shared index + metadata filter = cost-efficient vector search without
  cross-tenant embedding leakage.

## ElastiCache (Redis)
- All keys are tenant-namespaced: `tenant:<tenantId>:<register>`.
- Why: namespace isolation prevents cache-poisoning across tenants.

## Cognito
- 3 hard-separated pools (A=SaaS Admin, B=Tenant Admin, C=Tenant User).
- `custom:tenantId` is immutable (set at creation only, never updated).
- PreTokenGeneration V1_0 stamps tenantId into the **ID token only**.
- Why: immutable claim + ID-token-only = the tenantId cannot be spoofed or
  rotated by application code.

## AppSync subscriptions
- Every subscription resolver MUST verify the tenant claim before delivering.
- Why: without claim verification, a subscriber could receive another tenant's
  real-time events.

## Integration tests (mandatory)
- A cross-tenant denial integration test suite runs in CI for every spec that
  touches data paths. A missing denial test is a review-blocking defect.
- Why: isolation is only proven by adversarial assertion, not by absence of bugs.
