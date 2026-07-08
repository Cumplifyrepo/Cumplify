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

### ACC-1 — RESOLVED ✅ (2026-07-08, after marshalling fix 019dea8 deployed)
Full spine witnessed end-to-end. createRisk(category:QUALITY) → returned marshalled Risk
{id:86477be6-a8ff-4935-9791-a785ba76a54c, category:QUALITY (reverse-mapped from db 'quality'),
riskRating:20 (db-computed 4×5), status:open, ownerId populated}. Traced:
1. RDS row (app_role tenant-AAA): id=86477be6, category='quality', risk_rating=20. ✓
2. Event Risk.Created published (auditTrail:true) → R-3 → audit-sink FIFO → appender. ✓
3. Hash-chained AUDITLOG item: PK=TENANT#tenant-AAA#AUDITLOG,
   SK=EVENT#2026-07-08T14:07:27.903Z#01KX10W4F2N9AH7WCY5YKS5ZQ2, prevHash links to prior. ✓
4. WORM S3 object: audit-trail/tenant-AAA/2026/07/08/01KX10W4F2N9AH7WCY5YKS5ZQ2.json,
   Object Lock Mode=COMPLIANCE, RetainUntilDate=2026-07-09. ✓

### ACC-4 — GREEN ✅
Chain verifier (Dev-AuditTrailStack-ChainVerifierFn) invoked → 200,
result: {tenantId:tenant-AAA, itemsChecked:3, chainValid:true, s3Mismatches:0, brokenLinks:[]}.
Hash chain intact AND DDB↔S3 WORM copies consistent.

### Task 18 (loop guard) — GREEN ✅
Published ONE AuditEvent.Appended for fresh tenant-LOOP (FailedEntryCount:0) → exactly 1 AUDITLOG
item (SK=...#01LOOPGUARDTEST0000000001). No re-emit loop (FF-2 no-re-emit invariant holds live).

## ALL ACCEPTANCE CRITERIA GREEN — spec proven live
ACC-1 ✅ | ACC-2 ✅ | ACC-3 ✅ | ACC-4 ✅ | ACC-5 ✅ | Loop guard ✅

## Post-acceptance carries (non-blocking, for closure/follow-up)
- Real-Pool-A LITERAL 401: Pool A enforces MFA=ON; issuer-pinning mechanism proven via
  wrong-issuer JWT + valid-Pool-B-accepted. Enrol a Pool-A MFA user for the literal case if desired.
- Subscriptions (5): C-6 VTL tenant check verified at SYNTH; NOT live-exercised (needs AppSync
  realtime WebSocket + cross-tenant subscribe attempt). Carry: live subscription isolation test.
- C-7 CI denial suite: committed but deferred to post-deploy execution — wire into CI.
- L-2: matview refresh automation (event/schedule-driven REFRESH) — mechanism sound, not automated.
- Dev test artifacts: Cognito Pool B user acc-aaa-admin@example.com; RDS rows (tenant-AAA/BBB risks);
  AUDITLOG items + 3 WORM objects (COMPLIANCE-locked until 2026-07-09, cannot delete by design);
  tenant-LOOP loop-guard item. Left in dev; clean RDS rows/user when acceptance run wraps.

## Dev test artifacts created (cleanup awareness)
- Cognito Pool B user: acc-aaa-admin@example.com (custom:tenantId=tenant-AAA).
- m5.risks: 2 test rows (tenant-AAA, tenant-BBB) from ACC-5.
- (Pool A test user NOT created — email-username + MFA constraints.)
