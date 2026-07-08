# api-core Acceptance Proofs — Architect-Witnessed (dev, 2026-07-07/08)

Executor: architect, AWS_PROFILE=cumplify-dev-admin, dev 697114252993, us-east-1.
GraphQL endpoint: https://42yckio3gbbgphpdkpl7vux3v4.appsync-api.us-east-1.amazonaws.com/graphql

## GREEN
### ACC-2 — CARRY-1 tenant-scoped denial matrix (incl. GSI)  ✅
simulate-principal-policy on cumplify-dev-tenant-data-role, tag tenantId=tenant-AAA:
same-tenant GetItem allowed; cross-tenant GetItem/PutItem implicitDeny; same-tenant
GSI Query allowed; cross-tenant GSI Query implicitDeny. R-1 GSI concern closed on simulator.

### ACC-5 — RLS + matview isolation  ✅
Run live as app_role via Data API (exactly the resolver path):
- Seeded one m5.risks row per tenant (each under its own set_config session).
- Session tenant-AAA sees ONLY AAA's row; session tenant-BBB sees ONLY BBB's row; no cross leak.
- Session with NO app.tenant_id set → 0 rows (M-1 fail-closed via current_setting(...,true) confirmed).
- Matview: master bypasses RLS → REFRESH populates all rows (2); SECURITY DEFINER accessor
  get_risk_register_view() as app_role tenant-AAA returns 1 (its own only) — accessor filter isolates.
- Observation: the RDS master user BYPASSES RLS (saw all rows with no tenant ctx). This is why
  resolvers MUST use app_role (they do, proven above); master is migrator-only.

### ACC-3 — Authorizer proofs (live endpoint)  ✅ (negatives + positive)
- garbage token → 401 UnauthorizedException
- empty token → 401
- well-formed JWT, wrong issuer (evil.example.com) → 401  (proves issuer-pinning = Layer-1 mechanism)
- VALID Pool-B ID token (SRP-minted, aud=deployed client, custom:tenantId=tenant-AAA,
  PreTokenGen stamped poolClass=tenant-admin) → 200 + data (positive auth accepted)
- Real Pool-A token case: Pool A enforces MFA=ON — token not mintable without MFA enrolment.
  Issuer-pinning (the exact code path that rejects Pool A) is proven by the wrong-issuer case.
  Follow-up: enrol a Pool-A MFA test user for the literal real-Pool-A 401, or accept the
  mechanism proof.

## BLOCKED — resolver defect (back to Kiro)
### ACC-1 — E2E mutation → sealed event  ❌ (blocked at hop 1)
createRisk(input:{standard:ISO9001, category:QUALITY, ...}) → HTTP 200 but
errors: DatabaseErrorException "violates check constraint risks_category_check" (SQLState 23514).
Root cause (SYSTEMIC): resolvers pass GraphQL enum values verbatim into SQL, but GraphQL enums
are UPPERCASE (QUALITY/ENVIRONMENTAL/OHS/...) while DB CHECK constraints are lowercase
(quality/...). Not a blanket lowercase — `standard` (ISO9001) must NOT be transformed. Needs a
per-enum GraphQL↔DB value mapping across all 5 resolvers (m1..m5: category, status, doc_type,
nc_type, decision, disposition, finding_type, approval_status, etc.) + unit tests. Positive auth,
context extraction, app_role Data API connection, and transaction all worked — the failure is
purely enum value mapping.
### ACC-1 UPDATE (2026-07-08, after enum fix 5a50a30 redeployed)
Enum fix confirmed deployed (category QUALITY→quality no longer violates CHECK). But ACC-1 still
blocked on TWO deeper, systemic resolver gaps found live:
1. NO RESULT MARSHALLING (systemic, all 5 resolvers, 34 ops): every resolver does `return result`
   where `result` is the RAW RDS Data API response ({records:[[typed]], numberOfRecordsUpdated}),
   never mapped to the GraphQL type. AppSync → "Cannot return null for non-nullable type 'ID'/
   'RiskCategory'/... within parent 'Risk'". Resolvers must parse result.records (+ columnMetadata)
   into an object with camelCase field names (risk_rating→riskRating, owner_id→ownerId). Confirmed:
   grep shows 0 resolvers parse .records; 34 `return result;`.
2. AUDIT PAYLOAD PLACEHOLDER: m5 publishAuditEvent sends payload {riskId:'created'} — a literal
   placeholder, not the real created id (must come from the marshalled INSERT result).
3. RESOLVER RESUME-RETRY MISSING (robustness): resolver createRisk returned raw
   DatabaseResumingException on the first call after Aurora 0-ACU auto-pause. Only the migrator got
   withResumeRetry. A real user's first mutation after idle sees a raw 500. Resolvers should retry
   (or the shared Data API helper should) on the resume transient.
Root cause class: resolvers were never run live (unit tests mock Data API), so response marshalling
was never exercised. Back to Kiro as a resolver-correctness pass. ACC-1/ACC-4/loop-guard gated on it.

### ACC-4 (chain verifier) + Task 18 (loop guard) — pending ACC-1 (needs marshalling fix first).

## Dev test artifacts created (cleanup awareness)
- Cognito Pool B user: acc-aaa-admin@example.com (custom:tenantId=tenant-AAA).
- m5.risks: 2 test rows (tenant-AAA, tenant-BBB) from ACC-5.
- (Pool A test user NOT created — email-username + MFA constraints.)
