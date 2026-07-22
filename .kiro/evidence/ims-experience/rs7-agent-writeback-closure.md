# RS-7 CLOSED — six agent* writeback-door handlers (architect, 2026-07-22)

Closes AUD-7 (six schema-wired `agent*` `@aws_iam` mutations, no handler —
`Unknown field` on every call) per read-surface-completion REQ-RS-7 and the
AGENT-FIRST LAW scope amendment (55a6dac). All six implemented, tested,
committed in this wave.

## Two findings surfaced and resolved during build (neither is "just add a
switch case" — both are pre-existing gaps in the AUD-7/RS-7 design that
predate this session)

### Finding A — circular stack dependency blocks direct SFN access from ApiStack
`infra/lib/cumplify-stage.ts:173`: `aiStack.addDependency(apiStack)` already
exists (AiStack needs `apiStack.appRoleSecretArn`/`graphqlApiId`/
`graphqlApiUrl`). Wiring `agentTriageNC`/`agentAssessRisk`'s resolver
Lambdas (ApiStack) to call `AiStack.hitlStateMachine` directly (the design
implied by "HITL-gated" in commit 55a6dac and requirements.md) would
require the reverse dependency — CDK/CloudFormation rejects the resulting
cycle at synth time. Verified empirically: exposed both as public stack
properties, wired the Stage-level cross-reference, and confirmed the
circularity via the dependency graph before reverting (clean revert — zero
diff in `ai-stack.ts`/`api-stack.ts` in the final commit).

**Resolution:** all six mutations ship as direct, synchronous, immediately-
committing writes today. `agentTriageNC`/`agentAssessRisk` specifically are
NOT the compliance-gated path (architecture §4: CAPA stage 2 "QM/EHS Mgr
accepts classification" requires a real approval gate) — that gate is
RS-8's job, via CAPAGuru/RiskSentinel's own tool-loop (already living in
AiStack, zero circularity) calling `enterHitlGate` with two NEW tool names
(`nc-triage-write`, `risk-assessment-write`), landing in
`execute-writeback.ts` (extended there, not here — zero new cross-stack
infra needed since execute-writeback.ts already lives in AiStack).
`role-matrix.ts` TOOL_MODULES already carries both tool names, ready for
RS-8. This direct-write mutation pair remains available as a separate,
explicitly-ungated utility surface — documented as such in both handlers'
code comments.

### Finding B — @aws_iam-only fields have no tenant-context mechanism
`infra/lib/api-stack.ts:144-155`: the API's primary auth is the Lambda
authorizer (`AuthorizationType.LAMBDA`); `AWS_IAM` is only an ADDITIONAL
mode. A field carrying only `@aws_iam` (all six do — confirmed, none also
carry `@aws_lambda`) is IAM-only: the Lambda authorizer, the SOLE source of
`identity.resolverContext`, never runs for these calls. Every resolver in
the codebase (`extractContext`, called by every m1-m5 handler) throws
without `resolverContext.tenantId` — meaning these six mutations, as
originally schema'd, had NO caller that could work, with or without a
switch case. This is the real, deeper mechanism behind AUD-7's "500 on
invocation," not just the missing switch statement.

**Owner-ruled resolution (2026-07-22):** explicit `tenantId: ID!` on each
of the four Input types + as a second argument on the two bare-arg
mutations (`agentGenerateChecklist`, `agentScoreReadiness`) — a narrow,
documented exception to SCHEMA-5. Justified because SCHEMA-5's threat model
is a malicious BROWSER client spoofing tenantId via mutation input; these
fields are reachable only with signed AWS IAM (SigV4) credentials, never
exposed to a browser, so that spoofing vector does not apply. New
`extractAgentContext` helper (`shared.ts`) added alongside `extractContext`
(never merged — `extractContext` stays exactly as strict as before for
every human-facing mutation). `schema-guard.test.ts`'s existing
`TENANT_ID_ALLOWLIST` mechanism (built for exactly this class of exception
— precedent: `PublishGenerationEventInput`) extended with the four new
input type names; the guard test's own comment ("the agent's IAM principal
tag IS the tenant identity on that path") independently corroborates this
was always the intended design for `@aws_iam` inputs.

## What shipped (all direct writes, no HITL pause — see Finding A)

| Mutation | Resolver | Behavior |
|---|---|---|
| `agentDraftDocument` | m1.ts | Creates DRAFT document + its version-1 row in one transaction (new: no handler previously wrote `document_versions` in m1.ts at all) |
| `agentProposeCorrectiveAction` | m2.ts | Creates a corrective action (status `open`); `dueDate` not in input (unlike the human-facing mutation) — defaults server-side to now()+14d |
| `agentTriageNC` | m2.ts | Reclassifies an existing NC's `nc_type`; `classification` mapped through the same `NC_TYPE_MAP` as `raiseNonconformity` |
| `agentGenerateChecklist` | m3.ts | Delegates to the SAME internal function the user-facing `generateAuditChecklist` uses — one implementation, two entry points, per the spec's explicit instruction |
| `agentScoreReadiness` | m3.ts | NEW capability — `m3.audit_readiness_scores` had no writer anywhere in the codebase before this. Scoring signal: the LATEST `qms.generation_sections.status` covering each registry clause (`prose`/`na_justified` = 100, else 0) — spec-40's own "honest gaps" mechanism (BC-3), not a fabricated heuristic. Upsert via new migration 018 (`UNIQUE(tenant_id, standard, clause_ref)`) |
| `agentAssessRisk` | m5.ts | Updates an existing risk's likelihood/severity, refreshes `risk_register_view` in the same transaction (same SECURITY DEFINER pattern as `createRisk`); `rationale` has no register column — preserved in the audit event payload only, same convention as `closeCapa`'s `closureNotes` |

Two new audit-trail registrations (`NC.Triaged`, `Risk.Assessed` — both
`auditTrail: true`) in `audit-trail-registry.ts` + `contracts/events.md`,
verified against the parity test before commit (learned from Finding 1 in
the prior witness evidence log — never ship a new `detailType` unregistered
again).

## Gates (architect-run)
| Gate | Result |
|---|---|
| `rs7-agent-writeback.test.ts` (new) | 11/11 pass — all six mutations + `extractAgentContext` missing-tenantId guard |
| `schema-guard.test.ts` | 5/5 pass (SCHEMA-5 allowlist extended) |
| `api-stack.unit.test.ts` | 16/16 pass — resolver count still 86 (unchanged: new arguments on existing fields, no new resolvers) |
| `cdk synth` | Successfully synthesized (confirms Finding A's circularity does NOT exist in the shipped code — the reverted infra edits left zero diff) |
| `npm run typecheck` | clean |
| Backend `npm run test` | 1183 passed / 3 skipped (was 1170 baseline → +2 RS-1 clauseRefs, already committed → +11 this wave; clean, no shrinkage) |
| Frontend `npm run test` | 155 passed (unchanged — RS-7 touches no frontend code) |

## Deferred to RS-8 (next build item)
- Real HITL gating for triage/risk-assessment (Finding A's resolution path).
- `execute-writeback.ts` new cases `nc-triage-write` / `risk-assessment-write`.
- Standing up the RiskSentinel seat (Register-resolved Nova Pro, Part 30).
- `runCapaAnalysis`/`runRiskAssessment` user-triggered mutations + `AgentRunAck` type.
