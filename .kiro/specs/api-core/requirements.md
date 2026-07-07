# API Core — Requirements (EARS Format)

**Spec:** `api-core`
**Spine references:** D.2 (AppSync modes), A.2/A.4 (modules M1–M5), C.2 (audit-event schema), E.1 (immutable trail)
**Source documents:**
- `.kiro/steering/01-tenancy-rules.md` — tenant isolation at every layer
- `.kiro/steering/03-auth-modes.md` — AppSync auth modes, Lambda authorizer, ABAC
- `.kiro/steering/16-identity-boundaries.md` — four never-cross layers
- `.kiro/steering/04-immutability.md` — every mutation names its audit event in design
- `.kiro/steering/07-events.md` + `contracts/events.md` — event taxonomy, publisher
- `docs/architecture/cumplify-architecture.md` — Sections A.2, A.4, C.1, D.2, D.6
- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — v7 spec table row 3
- `docs/architecture/module-spec.md` — M1–M5 domain models, RDS system-of-record rule
- `.kiro/specs/platform-foundation/design.md` — §6 Aurora (RLS/schema deferred to spec 3)

**Depends on:** Spec 1 (`platform-foundation`), Spec 2 (`eventing-backbone`), Spec 5 (`immutable-trail`)
**P0-GATE CARRY-1:** This spec deploys the tenant-scoped runtime data role.
**Revision:** R3 — 7 findings resolved (F-1 API-2 stale pool ref, F-2 auth-mode mechanism-neutrality, F-3 ACC-1 RDS chain, F-4 RDS-1 M4 coverage, F-5 AUTH-6 reword, F-6 SCHEMA-5 trust rule, F-7 RDS-4 criteria)

---

## 1. Constraints

| ID | Constraint |
|----|-----------|
| C-1 | All P0/P1 build rules carry forward: NodejsFunction node22/ARM_64/512MB, no hardcoded names (except CumplifyCore, cumplify-events), CfnOutputs, CDK Nag zero, template assertions for L1 details, evidence from executed commands only, rules 7-8. |
| C-2 | IAM + authorizer code = REQUIRES-HUMAN throughout. Every diff flagged for owner review before merge/deploy. |
| C-3 | Every mutation MUST name its audit event in design BEFORE implementation (04-immutability build rule). |
| C-4 | Events MUST be registered in `contracts/events.md` BEFORE publishing (append-only registry rule). |
| C-5 | A resolver that reads/writes tenant data without asserting `tenantId` from the request's verified authorization context is a security defect (03-auth-modes anti-pattern). The mechanism delivering tenantId is resolved by AUTH-7. |
| C-6 | AppSync subscriptions MUST verify tenant claim before delivering (01-tenancy-rules, 16-identity-boundaries). |
| C-7 | Cross-tenant denial integration test = mandatory for every data path (01-tenancy-rules). |
| C-8 | The authorizer reads the ID token (not access token) — tenantId is in the ID token only (01-tenancy-rules, 16-identity-boundaries). |

---

## 2. ApiStack (Infrastructure)

| ID | Requirement (EARS) |
|----|-------------------|
| API-1 | **The ApiStack shall** deploy an AppSync GraphQL API with two auth modes: `AMAZON_COGNITO_USER_POOLS` (user-facing, default) and `AWS_IAM` (agent/service). |
| API-2 | **The ApiStack shall** deploy a Lambda authorizer that: (a) validates JWT from Pool B or Pool C, (b) extracts `tenantId`, `role`, `poolClass` from the ID token claims, (c) returns `resolverContext` with tenantId, role, permissions, and entitlement stamp. Auth-mode mechanics resolved by AUTH-7; this requirement assumes the architect-recommended AWS_LAMBDA path but is superseded by AUTH-7 if option (b) is chosen. |
| API-3 | **The entitlement stamp shall** include: plan tier (Launch/Pro/Enterprise), seat count, feature flags. Billing enforcement (blocking on exhausted credits) is P2 — this spec stamps the context; it does not enforce limits. |
| API-4 | **The ApiStack shall** join CumplifyStage and declare cross-stack dependencies on DataStack, IdentityStack, SecurityStack, EventingStack. |
| API-5 | **The ApiStack shall** associate the existing WAFv2 REGIONAL WebACL (SecurityStack) with the AppSync API endpoint. |
| API-6 | **CfnOutputs shall** include: GraphQL API URL, API ID, authorizer Lambda ARN, tenant-data-role ARN. |

---

## 3. Lambda Authorizer

| ID | Requirement (EARS) |
|----|-------------------|
| AUTH-1 | **The authorizer shall** accept JWTs issued by Pool B (`cumplify-tenant-admin`) or Pool C (`cumplify-tenant-user`). Pool A tokens (`cumplify-internal`) are REJECTED — per 16-identity-boundaries Layer 1, the tenant-facing API rejects Pool-A tokens with 401 BEFORE any role logic. Pool C carries the operational ISO roles (InternalAuditor, ProcessOwner, Employee, etc.) that perform actual M1–M5 work. |
| AUTH-2 | **The authorizer shall** verify: (a) token signature (JWKS), (b) issuer matches known pool(s), (c) expiry (reject expired tokens), (d) `custom:tenantId` is present and non-empty. |
| AUTH-3 | **The authorizer shall** populate `resolverContext`: `tenantId` (from `custom:tenantId`), `role` (from `custom:role`), `poolClass` (from `custom:poolClass`), `sub` (user identity), `entitlement` (plan/seats/features — initially a static stamp until billing wires in P2). |
| AUTH-4 | **The authorizer shall** REJECT (401) any token where `poolClass` is `internal` (Pool A). Only `tenant-admin` (Pool B) and `tenant-user` (Pool C) are accepted on this surface (16-identity-boundaries Layer 1). |
| AUTH-5 | **[REQUIRES-HUMAN]** The authorizer code and its IAM policies require owner review before merge. |
| AUTH-6 | **A negative-proof readback test shall** confirm: synthetic JWTs that are (a) issued by Pool A (`cumplify-internal`), (b) expired, or (c) missing/empty `custom:tenantId` are each REJECTED with a 401 response. Cross-tenant access with a valid token is proven separately by ACC-2 (IAM) and ACC-5 (RLS) — not duplicated here. |
| AUTH-7 | **[REQUIRES-HUMAN — design decision]** The user-facing auth mechanism is resolved under REQUIRES-HUMAN: either (a) `AWS_LAMBDA` mode — a Lambda authorizer validates Pool B/C ID tokens via JWKS, performs ABAC, returns `resolverContext` including entitlement stamp [architect-recommended: satisfies v7 row 3 "authorizer + entitlement stamp", C.1, steering 01, and reuse for the Part 24.1 API Gateway surface], or (b) `AMAZON_COGNITO_USER_POOLS` mode with tenant context from ID-token claims and entitlement stamped via PreTokenGeneration. **Whichever is chosen:** Pool-A rejection happens before any role logic; `tenantId` + entitlement reach every resolver via ONE mechanism; the RLS session variable (RDS-3) is set from that same mechanism. |

---

## 4. Tenant-Scoped Data Role (P0-GATE CARRY-1)

| ID | Requirement (EARS) |
|----|-------------------|
| ROLE-1 | **The ApiStack shall** deploy a tenant-scoped runtime data role for resolver Lambdas with an IAM Allow policy: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:Query`, `dynamodb:TransactWriteItems` on CumplifyCore, conditioned on `ForAllValues:StringLike` `dynamodb:LeadingKeys` matching `TENANT#${aws:PrincipalTag/tenantId}#*`. |
| ROLE-2 | **The role shall** carry `aws:PrincipalTag/tenantId` as a session tag, set by the resolver invocation from the authorizer's `resolverContext.tenantId`. |
| ROLE-3 | **A cross-tenant denial readback test shall** prove: (a) same-tenant `GetItem` → allowed, (b) cross-tenant `GetItem` → denied (implicitDeny), using `aws iam simulate-principal-policy` with both `LeadingKeys` and `PrincipalTag/tenantId` context entries. |
| ROLE-4 | **This readback re-runs the P0-GATE CARRY-1 matrix.** Green = CARRY-1 closed. |

---

## 5. RDS PostgreSQL — Schema, RLS, and Connectivity

| ID | Requirement (EARS) |
|----|-------------------|
| RDS-1 | **This spec shall** own schema creation and migration for all M1–M5 RDS tables per the module-spec "Core data entities" lists: **M1** (documents, document_versions, document_approvals, document_distribution, policies, ims_scope), **M2** (nonconformities, root_cause_analyses, corrective_actions, capa_effectiveness_checks, nonconforming_outputs), **M3** (audit_programmes, audits, audit_checklists, audit_findings, audit_readiness_scores), **M4** (records, retention_policies, measuring_resources, calibration_records), **M5** (risks, risk_treatments, change_plans, risk_register_view). Every table carries `tenant_id` + standard audit columns (`created_at`, `created_by`, `updated_at`, `version`). |
| RDS-2 | **Row-Level Security (RLS) policies shall** be applied to every M1–M5 table, keyed to the session variable set from `resolverContext.tenantId`. A query from tenant-A's session MUST return zero rows from tenant-B's data — enforced at the database layer, not application logic. |
| RDS-3 | **The session-variable wiring mechanism shall** set `app.tenant_id` (or equivalent) on every database session BEFORE any query executes. The resolver Lambda sets this from the request's verified authorization context (the mechanism delivering tenantId is resolved by AUTH-7). |
| RDS-4 | **Lambda-to-Aurora connectivity** method shall be decided in design. Candidates: (a) RDS Data API (serverless, no VPC attachment needed for Lambda, connection pooling built-in), (b) RDS Proxy (connection pooling, VPC-attached Lambdas), (c) direct VPC connection. Design must evaluate against: cold-start impact, connection-pool exhaustion at scale, RLS session-variable support, cost, and specifically: (i) RDS Proxy is a standing cost → Part 27 estimate mandatory before selection; (ii) RLS session variables cause session pinning under RDS Proxy multiplexing and are transaction-scoped under Data API (`SET LOCAL` per transaction) — the chosen connectivity MUST demonstrably support per-request tenant context; (iii) Aurora 0-ACU resume (~15 s) → client/Lambda timeout budgets must accommodate. |
| RDS-5 | **An RLS acceptance test (ACC-5) shall** prove: a resolver Lambda executing a query with tenant-A session context returns tenant-A rows; the same query with tenant-B context returns zero rows from tenant-A's data. Captured verbatim. |
| RDS-6 | **Schema migrations shall** be managed by a committed migration tool (design decides: raw SQL files, or a migration framework). Migrations are versioned, idempotent, and run as part of the deploy pipeline (not ad-hoc). |

---

## 6. GraphQL Schema (M1–M5)

| ID | Requirement (EARS) |
|----|-------------------|
| SCHEMA-1 | **The GraphQL schema shall** define types, queries, and mutations for M1 (Document Studio), M2 (CAPA), M3 (Audit Studio), M4 (Records Management), M5 (Risk Management) per the module-spec data models. |
| SCHEMA-2 | **Every mutation shall** be annotated with `@aws_cognito_user_pools` for user-facing operations. Agent-path mutations (appendAuditEvent, publishAgentMessage) annotate `@aws_iam`. |
| SCHEMA-3 | **Queries reading tenant data shall** include a resolver that asserts `tenantId` from the request's verified authorization context (per AUTH-7 mechanism) before accessing any data store. |
| SCHEMA-4 | **Subscriptions (if any for M1–M5) shall** verify tenant claim in the subscription resolver before delivering events (C-6). Design must determine which M1–M5 operations require real-time subscriptions by consulting the module-spec — do not assume. |
| SCHEMA-5 | **Client-supplied `tenantId` arguments shall** NEVER be trusted. Resolvers MUST overwrite or validate any client-provided tenantId against the verified claim from the authorization context. A resolver that uses a client-supplied tenantId without this check is a security defect (C-5 explicit corollary). |

---

## 7. Resolvers & Mutations

| ID | Requirement (EARS) |
|----|-------------------|
| RES-1 | **Every mutation resolver shall**: (a) enforce tenant isolation via RLS on the RDS system-of-record (the primary write path for M1–M5 domain entities), (b) optionally write metadata/session items to CumplifyCore DynamoDB under the caller's `TENANT#<tenantId>#<module>` partition (via the tenant-scoped role from §4), (c) publish the declared audit event via `services/eventing` publisher to `cumplify-events`. RDS is the system-of-record; DynamoDB is metadata + audit-mirror only. |
| RES-2 | **Every audit event published by a resolver shall** flow through the P0 spine: cumplify-events → R-3 audit-sink rule → FIFO queue → appender → chained DDB item → WORM sealed S3 object. This is the first real exercise of the immutable-trail end-to-end. |
| RES-3 | **Design shall** declare the audit event for every mutation BEFORE implementation (C-3). The design table must list: mutation name → detailType → module → clauseRef. |
| RES-4 | **New events required by M1–M5 mutations that are not already in `contracts/events.md` shall** be registered there (C-4, append-only) BEFORE implementation. |

---

## 8. Non-Functional Requirements

| ID | Requirement (EARS) |
|----|-------------------|
| NFR-1 | **The authorizer Lambda shall** have `timeout <= 10s` (AppSync authorizer timeout limit), `memorySize >= 512`. JWT verification uses cached JWKS (refreshed on miss). |
| NFR-2 | **Resolver Lambdas shall** use the standard Lambda config (node22, ARM_64, 512MB, bundling.externalModules:[]). |
| NFR-3 | **AppSync request pricing is negligible at dev stage.** No new standing-cost resources without a design-stage estimate (Part 27). |
| NFR-4 | **Structured logging** via `@aws-lambda-powertools/logger` on authorizer and all resolvers, including tenantId + requestId in every log entry. |

---

## 9. Acceptance Criteria

| # | Criterion |
|---|-----------|
| ACC-1 | **END-TO-END MUTATION-TO-SEALED-EVENT:** A real GraphQL mutation (via AppSync) → resolver writes domain entity to RDS (RLS enforced) → optionally writes metadata item to CumplifyCore DynamoDB → publishes event to cumplify-events → audit-sink consumer → chained DDB audit item → WORM sealed S3 object. Each hop evidenced. |
| ACC-2 | **CARRY-1 MATRIX GREEN:** `simulate-principal-policy` against the tenant-scoped data role: cross-tenant GetItem → denied; same-tenant GetItem → allowed; cross-tenant PutItem → denied; same-tenant PutItem → allowed. All captured verbatim. |
| ACC-3 | **AUTHORIZER NEGATIVE PROOF:** Synthetic JWTs — (a) Pool A issued, (b) expired, (c) missing/empty `custom:tenantId` — each result in AppSync returning 401/Unauthorized. Captured verbatim. |
| ACC-4 | **The daily chain-verification job (spec 5) runs green** on the audit events generated by this spec's mutations (the trail is untampered). |
| ACC-5 | **RLS TENANT ISOLATION:** A resolver query with tenant-A session context returns tenant-A rows; the same query with tenant-B context returns zero rows from tenant-A's data. Captured verbatim. |

---

## 10. Out of Scope

| Item | Reason |
|------|--------|
| Frontend (spec 9) | No UI — this spec delivers the API layer only. |
| Agents (spec 4) | Agent invocations are `@aws_iam` paths wired in agent specs. |
| Billing enforcement | P2 — this spec stamps entitlement context; it does not enforce credit limits. |
| M6–M13 | P3 modules. |
| Realtime subscriptions beyond M1–M5 needs | Design checks the corpus; if M1–M5 don't require subscriptions, none are built. |
| Public REST API (Part 24.1) | Separate spec — shares the authorizer ABAC logic but is a distinct surface. |
| AppSync caching (CfnApiCache) | Optimization deferred; cache invalidation complexity not justified at dev traffic. |
