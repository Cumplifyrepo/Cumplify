# Task 8R Architect Validation — agents-existing-8

Validated: 2026-07-09 (architect). State: UNCOMMITTED working tree at HEAD f3e7025 (correct repo —
Kiro's workspace is now correctly targeting ~/cumplify). Method: independent re-execution — full
suite + tsc re-run, every finding's diff read line-by-line, SQL cross-checked against migrations
009/007 (RLS+grants confirmed on new target tables), publisher/registry cross-checked, IAM
mechanism verified against actual SFN auth semantics.

## Re-executed claims
- vitest: claimed "429 passed | 3 skipped | 0 failed". ACTUAL: exact match, 40/41 files, exit clean.
- tsc: claimed "1 error (pre-existing env-config.unit.test.ts:13)". ACTUAL: exact match, single error.

## VERDICT: 8 of 10 findings CONFIRMED FIXED. 2 new issues found during verification (1 HIGH, not
previously flagged; 1 MEDIUM regression in a claimed fix). Recommend: fix the HIGH (real runtime
bug), accept the rest, then proceed to Task 9 with both new items as carries.

---

## CONFIRMED FIXED (verified against code, not just the report)

**C-1 (one-door):** `services/agents/shared/invoke-transport.ts` — new `createInvokeFn()` wraps
LambdaClient/InvokeCommand against `AI_INVOKER_ARN`. `tool-loop.ts` takes `invokeFn` as a required
opt, no longer imports `invoke()`. Grepped all of `services/agents/` for the banned import — zero
hits outside test files that assert its absence. All 8 handlers (5 SQS + 3 guru) wire
`createInvokeFn()` and pass it through. Genuine fix.

**C-2 (SFN):** `ExecuteWriteback` state now points at `executeWritebackLambda.functionArn` (was
`PLACEHOLDER_WRITEBACK_LAMBDA`). `EmitAuditEvent` state deleted entirely (was
`PLACEHOLDER_AUDIT_LAMBDA` + would have double-emitted — execute-writeback.ts already emits
post-commit). Retry blocks added on both remaining task states. Genuine fix.

**H-1 (T-8b):** Wildcard `addPermission('AllowSfnInvokeOnly', ...)` deleted. Replaced with
`storeTokenLambda.grantInvoke(hitlStateMachine.role)` and
`executeWritebackLambda.grantInvoke(hitlStateMachine.role)` — the correct mechanism (SFN task
states sign with the state-machine role's own credentials; resource-based Lambda permissions never
evaluate for that call path, which is exactly why the old wildcard permission was decorative).
Genuine, correct fix — this is the right IAM primitive, not just a narrower version of the wrong one.

**H-2 (T-8c), partial — see gap below:** 8 agent-handler Lambdas defined via a `createAgentHandler`
helper; each gets `agentHandlerPolicy` attached via `fn.role!.addManagedPolicy`. ESMs wired on 5
queues (capa-intake FIFO, doc-studio, lead-auditor, control-tower, records — batchSize 1,
reportBatchItemFailures true). AOSS `AiAossDataAccessPolicy` READ block amended:
`Principal: [aiInvoker.role!.roleArn, ...agentHandlerRoleArns]` with the real 8 role ARNs collected
post-creation. Embedding path correctly left as `BLOCKED-ON-DESIGN` rather than faked further.

**C-3 (SQL), verified against live migrations:**
- `capa-open`: `due_date` added to INSERT — confirmed NOT NULL, no default in `003_m2_capa.sql:41`.
- `audit-checklist-gen`: `created_by` added — confirmed NOT NULL in `004_m3_audit_studio.sql:41`.
- `ct-governance-write`: now throws a clear `BLOCKED-ON-DESIGN` error instead of writing to a
  phantom table. Correct call — did not invent a migration to paper over the gap.
- `finding_type`: `mapFindingType()` translates hyphenated model output to underscore DB values at
  the dispatch layer (not by re-prompting the model) — exactly as ordered.
- `DB_NAME`: hardcoded default changed `'cumplify'` → `'postgres'`; CDK env now also sets it
  explicitly on the Lambda. Matches api-core's `DATABASE: 'postgres'` (api-stack.ts:189).
- Dispatch switch extended to all 8 declared HITL tools (was 5, missing 3): added
  `capa-verify-effectiveness` (targets `m2.capa_effectiveness_checks` — confirmed exists,
  RLS-enabled, app_role granted, `007_rls_policies.sql:19` / `009_app_role.sql:35`),
  `doc-version-control` (targets `m1.document_versions` — pre-existing table, confirmed),
  `records-retention-schedule` (targets `m4.retention_policies` — confirmed exists, RLS-enabled,
  app_role granted, `007:31` / `009:47`, upsert via `ON CONFLICT (tenant_id, record_category)`).
  No invented tables. Genuine, schema-verified fix.

**H-3 (audit registry):** `Agent.WritebackCommitted` registered in both `contracts/events.md` and
`services/eventing/src/audit-trail-registry.ts` (`auditTrail: true`). `execute-writeback.ts` now
calls the pre-existing `publish()` from `services/eventing/src/publisher.ts` (verified: this
function looks up the registry and throws on unregistered detailType — fail-closed, "registration
IS routing" per OQ-5) instead of hand-rolled `PutEventsCommand`. `eventId` is `ulid()` (package
confirmed pre-existing, resolvable — not phantom) replacing the collision-prone
`writeback-${Date.now()}`. Genuine fix for the registration/ULID parts. **`standard` resolution has
a residual bug — see MEDIUM finding below.**

**M-1 (resume-retry):** `withResumeRetry()` wraps `BeginTransaction`, matching the ACC-1 pattern
(retries on `DatabaseResumingException`/timeout/communications-link-failure, 3 attempts, 15s delay).
Genuine fix.

**M-2 (actor provenance):** `actor` (`agent:<name>+human:<sub>`) now threaded into every
`dispatchToolWrite` call and persisted as `created_by` on every INSERT (previously hardcoded
per-function strings like `'agent:CAPAGuru'`, losing the approver's identity). Genuine fix.

**M-3 (Task 7 nits):** Sparse-projection test added (`resolveHitlItem` REMOVEs GSI9PK/GSI9SK,
`enterHitlGate` SETs them — both directions asserted). Negative scan broadened from
hitl.ts-only to a real recursive glob of `services/agents/**` (verified: walks directories, skips
`__tests__`/`node_modules`, checks every `.ts` file). Genuine fix.

**H-4 (tests):** 239 new lines across `agent-handlers.test.ts` (91) and `execute-writeback.test.ts`
(148) — real assertions per finding (due_date, created_by, finding-type mapping, BLOCKED-ON-DESIGN
throw, all-8-tools coverage, unknown-tool throw, DB_NAME default, resume-retry, publish() usage,
ULID format, standard resolution), not stubs. `ai-stack.unit.test.ts` gained 4 template-assertion
tests: no PLACEHOLDER strings in any state machine, no EmitAuditEvent state, SM role has
lambda:InvokeFunction grants (≥2 targets), no wildcard-sourceArn Lambda::Permission for
states.amazonaws.com, 8 handler Lambdas present with AI_INVOKER_ARN env, ESMs ≥5. One of these
(AgentHandlerReadOnlyPolicy negative test) is weaker than its name claims — see nit below.

---

## HIGH — new, not previously flagged: empty DLQ_URL breaks poison-message path

`services/eventing/src/consumer.ts:49,139` uses `config.dlqUrl` unconditionally in the explicit
poison-send path (`SendMessageCommand({QueueUrl: config.dlqUrl, ...})`). In `ai-stack.ts`, two of
the five agent handlers get an **empty string**:
- `capaGuruHandler`: `DLQ_URL: ''` — comment says "Resolved at runtime from queue attributes",
  which is not a real mechanism (no such runtime lookup exists in the handler or the CDK code).
- `recordsVaultHandler`: `RECORDS_VAULT_DLQ_URL: ''` / `DLQ_URL: ''` — same pattern.

Root cause: `EventingStack` (spec 2) only exports `capaIntakeQueueArn` / `recordsQueueArn` (the
queue itself), not `capaIntakeDlqArn` / `recordsDlqArn` (the paired DLQ) — those two DLQs exist
inside `eventing-stack.ts` (`capaIntakeDlq`, `recordsDlq`) but were never added to
`EventingStackOutputs`. The other 3 handlers (docStudio, leadAuditor, controlTower) get real DLQ
URLs because their queues are created fresh inside `ai-stack.ts` itself.

**Impact:** the first time CAPAGuru (FIFO — the tool explicitly named in the corpus's poison-message
design note) or RecordsVault hits its explicit-DLQ-send path, `SendMessage({QueueUrl: ''})` throws
immediately — a genuine, previously-undiscovered runtime defect, same "never-run-live" bug class as
every prior deploy surprise in this project (api-core enum-case, marshalling, migration paths).

**Fix required before Task 9:** add `capaIntakeDlqArn` / `recordsDlqArn` to `EventingStackOutputs`
(mirrors the existing `deliveryFailureDlqArn` pattern), thread through `CumplifyStage` →
`AiStackProps`, replace the two empty-string envs with real `.queueUrl` values from imported DLQ
references.

## MEDIUM — H-3 standard resolution doesn't match its own tool schema's example format

`resolveStandard()` does exact-string matching (`standard === 'ISO14001'`, `=== 'ISO9001'`, etc.),
but the only tool schema that actually surfaces a `standard` argument to the model —
`audit-checklist-gen` (`services/agents/lead-auditor/tools.ts:38`) — describes it as
`'Standard (e.g., ISO 9001:2015)'`. A model following its own schema's example returns
`"ISO 9001:2015"` or `"ISO 14001:2015"` — neither matches the exact-string checks, so
`resolveStandard` silently falls through to the hardcoded `toolModuleMap` default (`ISO9001` for
every tool). Net effect: for the one tool the fix targets, a genuine ISO 14001 or 45001
checklist-gen call still gets mis-labeled `ISO9001` in the audit trail — the underlying finding
(wrong standard on non-9001 writebacks) is not actually resolved for its real-world input shape,
though the mechanism (registry lookup, no more literal hardcode) is a structural improvement.
**Fix:** normalize the model's string (strip `:20XX` suffix, case/whitespace-insensitive match, or
constrain the tool schema to an enum) before the exact-match check.

## Nits (non-blocking)
- `ai-stack.unit.test.ts` "AgentHandlerReadOnlyPolicy does NOT grant invoke on ExecuteWriteback"
  test doesn't actually assert the negative — it only checks the policy contains
  `lambda:InvokeFunction` generically; the comment admits it doesn't verify the writeback Lambda's
  ARN is absent. Test name overstates its coverage.
- No AppSync resolver wiring exists for the 3 guru Lambdas (`infra/lib/api-stack.ts` untouched, no
  new resolver references `guru9001Handler` etc. anywhere). Not claimed as done in Kiro's report
  (so not a false tick), but it was in my ordered REV scope (#4) and isn't flagged as
  BLOCKED-ON-DESIGN either — it's just absent. The 3 gurus are deployable but unreachable from the
  frontend until this lands. Recommend folding into Task 9 or a Task 8R-2 rather than blocking
  Task 9's core deploy, since it's additive (doesn't destabilize what's already fixed).

## Not independently re-verified (lower priority, time-boxed)
- `capa-verify-effectiveness`: `effective` boolean passed as `{stringValue: String(args.effective)}`
  with SQL cast `:effective::boolean` — plausible (Postgres accepts `'true'::boolean`), not executed
  against live RDS in this pass.

---

## ADDENDUM (2026-07-09, post-commit fa67b00): NEW CRITICAL — HITL gate unenterable at runtime

Found during pre-Task-9 IAM walk-through (triggered by the unexplained `dynamodbKey.grantDecrypt`
on handler Lambdas, comment "For DDB reads through HITL gate").

**Defect:** `enterHitlGate` (services/agents/shared/hitl.ts) executes `PutItemCommand` on
`TENANT#<t>#HITL / PENDING#<id>`. It is called from `tool-loop.ts:122,148` — i.e. it runs INSIDE
the agent handler Lambda. But `AgentHandlerReadOnlyPolicy` (owner-approved, T-1/T4R-F1) grants
ZERO DynamoDB actions — by design ("TENANT#*#HITL writes are NOT on agent handlers", Task 4
ledger). First HITL tool call → StartExecution succeeds → PutItem → **AccessDenied** → tool-loop
throws → message poisons to DLQ. The HITL gate cannot be entered. Fail-closed (no isolation risk),
functionally broken. Task 11 blocker; does NOT block Task 9 deploy or Task 10 (serving path).

**Attribution:** hitl.ts's PutItem predates the Task-4 IAM review (Task 6 commit 78e1414 <
Task 4 commit a9f4142). Both Kiro's Task-4 IAM authoring AND the architect's Task-4 + Task-5/6
validations missed the cross-file conflict. Joint miss, recorded.

**Secondary defect (same fix):** enterHitlGate starts the SFN BEFORE writing the DDB item, while
store-token.ts requires `attribute_exists(PK)` — a race where WaitForApproval can fire before the
item exists (currently masked by Retry blocks, ~2-14s window).

**Ordered fix (8R-2, NO IAM change — preserves the approved zero-DDB handler surface):**
1. enterHitlGate: DELETE the PutItem; pass the full item payload (agentName, proposedAction,
   createdAt, status) in the SFN execution input (hitlItemId/tenantId already there).
2. store-token.ts: become create-or-update — drop the `attribute_exists` ConditionExpression;
   SET all item fields + GSI9PK/GSI9SK + taskToken + itemType in one UpdateItem (native upsert).
   StoreToken's existing IAM (UpdateItem, LeadingKeys TENANT#*#HITL) already covers it. This also
   removes the race: the item is born WITH its token — the gate is always approvable.
3. Remove the dead `props.dynamodbKey.grantDecrypt(fn)` on agent handlers (no DDB actions → dead
   grant; StoreToken keeps encrypt/decrypt).
4. Update hitl.test.ts to the new split; keep GSI9 assertions (now against store-token's write).

**Also in 8R-2:** guru AppSync wiring (architect ruling: [KIRO] build work — needs GraphQL schema
additions, user-facing API surface; NOT folded into architect Task 9) + tick the Task-7
sparse-projection checkbox (M-3 satisfied it; still `[ ]` at fa67b00 — 58/103).
