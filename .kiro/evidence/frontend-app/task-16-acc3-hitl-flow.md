# Task 16 — ACC-3: Full HITL Approval Flow — WITNESSED GREEN

**Executed:** 2026-07-11 → 2026-07-13 (architect, standing auth; owner IAM sign-off for BUG-14).
**Final witnessed run:** 2026-07-13 11:57–11:58Z, dev 697114252993.
**HEAD at closure:** d09ec9f (all fixes below committed on develop).

## Verdict

ACC-3 PASS — the complete HITL approval spine proven live, through the REAL
GraphQL surface with a REAL Pool-B QualityManager token, including the live
WebSocket subscription delivery (closes Task 15's WSS carry):

NC.Raised (bus, auditTrail:true) → R-2 → FIFO router → capa-intake →
CAPAGuru (nova-pro via one-door) → capa-open proposal → HITL SFN
(hitl-CAPAGuru-01KXDNDA8W5YD45BRAC5GSNKQX) → store-token upsert (item born
with taskToken + REAL sfnExecutionArn) → listPendingHitlItems (module M2) →
approveHitlItem (Pool-B QM token) → SendTaskSuccess → ExecuteWriteback
COMMITTED → m2.corrective_actions row → Hitl.Approved + Agent.WritebackCommitted
hash-chained → WORM → verifier chainValid=TRUE.

## Checklist evidence (all witnessed; raw captures in session scratchpad acc3-*)

1. **Agent HITL gate triggered** — NC.Raised eventId 01KXDND761EMPR2229F0KHRMPW
   published 11:57:11Z (payload carried real ncId 11111111-2222-4333-8444-555566667777;
   imperative capa-open instruction). CAPAGuru consumed (FIFO), proposed capa-open
   with correct ncId/owner/dueDate 2026-08-12; SFN execution
   hitl-CAPAGuru-01KXDNDA8W5YD45BRAC5GSNKQX RUNNING; store-token item PENDING with
   taskToken + sfnExecutionArn (real ARN — first time ever stored; see BUG-11c).
2. **listPendingHitlItems** — witnessed 11:45Z (items incl. pending target, module
   M2 via tool registry, no taskToken field); post-approval list shows the item gone.
3. **approveHitlItem** — HTTP 200, full HitlApprovalResult:
   hitlItemId 01KXDNDA8W5YD45BRAC5GSNKQX, tenantId tenant-AAA, decision APPROVE,
   auditEventId 01KXDNE8KJ15YGGY165V31FVWV, resolvedBy 04184428-e0e1-7058-6cdb-21ff3e3e1f51
   (architect Pool-B sub), 11:57:44Z.
4. **Item resolved** — DDB status APPROVED, GSI9PK REMOVED (post-approval GetItem:
   GSI9PK null, approver = sub, ttl set +30d); disappears from pending query.
5. **Sealed audit event** — Hitl.Approved 01KXDNE8KJ… in TENANT#tenant-AAA#AUDITLOG
   at 11:57:45.215Z, prevHash-linked; the mutation's auditEventId matches the sealed
   item EXACTLY (one door, one ULID).
6. **SFN completed** — execution SUCCEEDED 11:58Z; history: TaskSucceeded
   (WaitForApproval) + TaskSucceeded (ExecuteWriteback) + ExecutionSucceeded.
   Writeback log: "Executing approved writeback" → Aurora resume-retry (M-1 fired,
   worked) → "Writeback committed"; RDS row 5076b811-4ff3-48fc-b95e-7be89d5dffb7,
   status open, due_date 2026-08-12 (model-proposed, sane — no 2023 hallucination),
   created_by agent:CAPAGuru+human:04184428-… (M-2 dual actor).
7. **No taskToken anywhere** — grep across every captured GraphQL response and WSS
   frame: CLEAN.

**WSS (Task 15 carry, closed):** onHitlItemResolved(tenantId:"tenant-AAA") delivered
over the AppSync realtime WebSocket 476ms after the mutation, payload identical to
the mutation result (witness log acc3-wss-final.log; protocol = the proven C-7
graphql-ws client). Delivered live TWICE (11:45 run + 11:57 run).

**Negative (bonus, ACC-7 preview):** Pool-B user with NO groups (PreTokenGen
fallback role=Employee) → approveHitlItem → 403 "Role 'Employee' cannot approve
items in module 'M2'" — fail-closed BEFORE any state change. Witnessed 09:21Z 07-13.

**Chain verifier:** tenant-AAA itemsChecked=7, chainValid=true, s3Mismatches=0,
brokenLinks=[] (verifier Lambda invoked 11:59Z — includes WORM S3 comparison).

## Five defects found + fixed by this acceptance run (never-run-live class, again)

Every one of these made production HITL approval impossible; all were invisible to
unit suites and prior readbacks:

- **BUG-11a (5e9ff9c):** Cognito groups are PascalCase, role-matrix keys kebab-case,
  PreTokenGen stamps group verbatim → canApprove denied EVERY real token.
  Fix: COGNITO_GROUP_ROLES alias map (IMSLead→management-rep per Part 13 R2).
- **BUG-11b (5e9ff9c):** items carry no module; fallback derived 'capa' — not in
  M1..M13 vocabulary → second universal 403. Fix: TOOL_MODULES registry grounded in
  execute-writeback SQL targets + sync-pin test on the dispatch switch.
- **BUG-11c (5e9ff9c):** ASL passes sfnExecutionArn as a taskToken SIBLING;
  store-token destructured it from input → 'unknown' on every item (carry #3 dead).
  Old unit test had pinned the wrong shape.
- **BUG-12/12b (ae56c1c):** approveHitlItem returned {success,…} vs schema's
  non-nullable HitlApprovalResult → response marshalling error AFTER SendTaskSuccess;
  and the result type had no tenantId, so onHitlItemResolved(tenantId:) could never
  deliver. Fix: schema-shape return + tenantId field (schema + Lambda).
- **BUG-13 (210ae20):** listPendingHitlItems — module String! null on real items →
  the WHOLE pending list failed marshalling. Fix: resolveModule in the query mapper.
- **BUG-14 (d09ec9f, OWNER-SIGNED — bug14-iam-signoff.md):** neither the tenant-data
  role nor the approval Lambda's ambient role EVER had dynamodb:UpdateItem — both
  approval-path writes were dead. Fix: single statement, LeadingKeys pinned EXACTLY
  to TENANT#<t>#HITL (deliberately not tenant-wide: AUDITLOG modify surface);
  resolveHitlItem rides the tenant-scoped client. simulate-principal-policy allowed;
  note: IAM propagation lag produced one post-deploy false AccessDenied (~2min,
  known class).
- **BUG-15 (prior commit):** execute-writeback gated on approvalResult.approved —
  a shape only Task 11's hand-crafted CLI callback ever sent; the real Lambda sends
  the SIGNED design §2.3 contract {decision, approverSub,…} → every live APPROVE
  silently skipped the write while SFN reported SUCCEEDED (witnessed:
  "Writeback rejected by human" on an approved item, 11:45Z run). Fix: contract
  aligned to the signed shape, legacy shape fails CLOSED, editedPayload now applies
  (approve-with-edits was silently dropped).

## Findings routed to Kiro backlog (not fixed here)

- **F-A:** raiseNonconformity publishes NC.Raised with payload {input} — WITHOUT the
  new NC id (m2.ts). The mutation→agent chain cannot work E2E until the payload
  carries ncId (Task-11/16 triggers hand-supplied it). Route: api-core closure sweep.
- **F-B:** production handler AOSS retrieval 401s live (agents-retrieval,
  "AOSS search failed: 401") — first live proof that handler grounding is broken
  (known spec-4 carry #1 / placeholder vectors; strengthens spec-35 priority).
  Non-blocking (catch → ungrounded proceed).
- **F-C:** CAPAGuru only calls capa-open when the event description is imperative —
  2 of 3 otherwise-identical events produced NO gate (model answered with advice).
  Prompt-quality item; fold into spec-35 L4 prompt library with carry #5.
- **F-D:** old poison message (01KX48FKTD, 2026-07-09, receiveCount 4) still in
  capa-intake DLQ — needs drain decision.

## Dev artifacts

Stale PENDING item 01KX4A4Z83PP0R8V9SJWH6A9HX (Task-15 era, its SFN execution long
SUCCEEDED — dead token): KEPT as the natural 410-path fixture for later ACC tests.
Pool-B users: acc-aaa-admin@example.com (group QualityManager — added 07-11),
acc-aaa-employee@example.com (no groups, negative fixture). Corrective-action rows
9185bd84 (07-09 run) + 5076b811 (this run) in m2.corrective_actions, tenant-AAA.
