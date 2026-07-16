# Spec-35 design D2 + tasks — architect review (2026-07-16T18:28Z)

**Verdict: NOT APPROVED — revision D3 ordered (bounded).** All seven D1
findings (H-1..3, M-1..4) and all six lows landed faithfully and were
independently re-verified — no regression, no fold missed. Two NEW blocking
findings surfaced during this round's deeper live verification, one of which
partially invalidates the architect's own D1 H-2 instruction (owned below).
Three new mediums and four lows ride along. No architecture rewrite; the
four-guardrail topology, layer flows, and task lane structure stand.

Reviewed at HEAD 73915e2 (D2 committed by Kiro — rule 7 satisfied this round).

## 1. D1 fix verification (all seven CONFIRMED landed)

| D1 finding | D2 resolution | Independent check (2026-07-16, exit 0) |
|---|---|---|
| H-1 handler wiring | design §4, Task 19 [KIRO], Task 20 [ARCHITECT] live ACC-1/2 | `guru-9001/handler.ts` read: retrieve() already wired, embed door stubbed "BLOCKED-ON-DESIGN" (line 29), chunks joined `\n---\n` (line 40) — §4.3 delimiter matches reality; L1-11 correctly placed in handler layer (retrieval.ts carries the 45s backoff: BACKOFF_CEILING_MS=45_000, base 500ms, factor 2, jitter) |
| H-2 AR quarantine | §1.1 four-guardrail table; Agent/RecordWrite grounding-only, NO CrossRegionConfig; DQ-1 marked DISSOLVED | ai-stack.ts:99–140 baseline verbatim-preserved as Task 5 claims; **but see NEW H-1 below — the single ArCheckGuardrail cannot carry 3 AR policies** |
| H-3 L5 producer chain | §8.3, Task 31 | store-token.ts:27–38 `StoreTokenInput.input` interface exists exactly as design assumes; hitl.ts:52 `enterHitlGate` + sfnInput passthrough confirmed viable; GSI9 projection real (store-token.ts:79) |
| M-1 named detailType | `Ai.GuardrailChecked` in Task 1 + §9.1 | contracts/events.md has no Ai.* yet (correct — Task 1 adds); parity test exists (`services/eventing/__tests__/audit-trail-registry.test.ts`) |
| M-2 per-clauseRef AR deleted | §7.4: L4-8 satisfied by L2 response-level check; optional pre-filter is DETERMINISTIC (corpus-map hash-set) | No invented API remains in D2 text |
| M-3 1,000-char query cap | §0.3, §3.4, Task 9 `validateGroundingContext` + truncation tests | Cap documented in all three places |
| M-4 empirical probes | Task 7 (M-4a no-source probe, M-4b weight-row verify) | weight-seeder.ts exists (custom-resource seeder claim genuine); seed JSON has no titan-embed entry yet (correct — Task 2 adds) |

Lows: entityId '' consistently (§9.1) ✓; eventing `publish()` direct (§9.2 —
publisher.ts:25 confirmed) ✓; documentLocale via `InvokeRequest.locale`
(§10.2) ✓; `buildSystemPrompt(basePrompt)` reconciled (§7.2 = Task 17) ✓;
base commit cc64741 ✓; committed ✓. SEAT_DEFAULTS table in §7.3 matches
types.ts:160–176 exactly (editor-ai 0.4 flagged correctly).

Requirements coverage sweep (R2, all IDs): EMB-1..6, L1-1..11, L2-1..8,
L3-1..4, L4-1..7, L5-1..5, TEL-1..6, CDK-1..5, INV-1..5, ACC-1..7 all map to
tasks — one mapping gap only (L4-8, see LOW-1).

## 2. NEW blocking findings

**NEW H-1 — CFN caps AR policies at TWO per guardrail; the single
ArCheckGuardrail carrying three policies is undeployable.**
Live registry re-read (readonly profile, us-east-1, 2026-07-16, exit 0):
`aws cloudformation describe-type AWS::Bedrock::Guardrail` →
`AutomatedReasoningPolicyConfig.Policies: {minItems: 1, maxItems: 2,
required}`. Design §1.1/§1.3/§5.2 and Tasks 25/29/38 attach clause-canon +
role-permissions + plan-entitlements (3) to one guardrail — CFN rejects at
deploy (Task 29), NOT at synth (Task 25's `cdk synth` evidence would go green
and the failure lands in the architect deploy lane).
*Architect ownership:* the D1 H-2 instruction said "a FOURTH guardrail
carries ONLY automatedReasoningPolicyConfig" with all three policies — the
D1 verification table recorded `ARConfig = {ConfidenceThreshold, Policies[]}`
without the item constraints. That miss is the architect's; D2 implemented
the instruction as given. The D3 order supersedes it.
FIX: TWO AR guardrails, split by evaluation path (stronger L2-7 conformance
and cheaper — only relevant policies evaluate per check):
`ArClauseGuardrail` (clause-canon; clause-citing paths) and
`ArAdvisoryGuardrail` (role-permissions + plan-entitlements; role/plan
advisory paths). Both carry CrossRegionConfig (required with AR). ar-check.ts
selects by path. Same quarantine principle, five guardrails total.

**NEW H-2 — The embed door has no door: EMB-2 vs §4.1/Task 19 contradiction,
and the transport/dispatch plumbing is unspecified.**
§2.1/Task 3: embed() is "invoker-internal... NOT exported from package
index" (EMB-2). §4.1/Task 19 step 1: agent handlers "call invoker
embed({...})". Handlers are SEPARATE Lambdas that reach the invoker
exclusively via `services/agents/shared/invoke-transport.ts` (C-1 one-door:
"They MUST NOT import invoke() directly... This is the ONLY way agent handler
code reaches Bedrock"), whose payload is `InvokeRequest` only. Handler roles
(AgentHandlerReadOnlyPolicy, zero-write scope — hitl.ts:9–12) have no
`bedrock:InvokeModel` and no metering-DDB permission, so in-process embed
would fail IAM at runtime even if the import ban were ignored. No task
specifies the mechanism, so Task 19 is unimplementable as written.
FIX (bounded): (a) invoker Lambda entry (index.ts) dispatches on an operation
discriminator — `{op: 'embed', ...}` routes to embed.ts, absent/`'invoke'` is
the existing path (back-compat); EmbedRequest/EmbedResult in types.ts;
(b) `createEmbedFn()` added to invoke-transport.ts (same AI_INVOKER_ARN, same
one-door); (c) Task 19 calls `createEmbedFn()` — never imports embed.ts;
(d) restate EMB-2 in §2.1: "invoker-internal" = executes inside the invoker
Lambda; handlers reach it only via the one-door transport embed operation.

## 3. NEW medium findings

- **NEW M-1 — Task 6's ArCheckGuardrail "stub with empty policies" is
  invalid CFN.** `Policies` has `minItems: 1` and is `required` (registry
  read above) — the stub fails the Task 7 deploy wave. FIX: delete the stub;
  create both AR guardrails entirely in Task 25 (when PolicyDefinition JSONs
  and ARNs exist). Task 6 keeps RecordWriteGuardrail only. (Task 6's note
  "blocked until AR policies deployed (Task 23)" also mis-points — policies
  are Tasks 22–24 — moot once the stub is gone.)
- **NEW M-2 — CrossRegionConfig property name is wrong in the normative CDK
  block.** CFN/CDK L1 property is `guardrailProfileArn`
  (registry: `GuardrailCrossRegionConfig.GuardrailProfileArn` required;
  aws-cdk-lib 2.261.0 bedrock.generated.d.ts:8630). §1.3 and Task 25 write
  `guardrailProfileIdentifier` (that's the control-plane API field, not CFN)
  — contradicts §0.2 which has it right. Would fail tsc, but the normative
  code block must not carry it. Same block: `envConfig.account` doesn't exist
  in ai-stack.ts — use `this.account`.
- **NEW M-3 — No task deploys the Phase 3–6 code before Task 20's live
  readback.** Task 7 deploys the Phase-2 CDK wave; Tasks 8–19 (invoker
  grounding/AR/hop/prompt-library + handler wiring — all AiStack Lambdas,
  verified ai-stack.ts:769–796) land after it, and Task 20 says "post-deploy"
  with "Blocked by: Tasks 7, 19 deployed" — but no task owns that second
  deploy. FIX: Task 20 gains step 0 "deploy AiStack (invoker + handler
  code)" in the architect lane, or an explicit deploy task is inserted.

## 4. LOW findings

- LOW-1: L4-8 appears in no task's ACC mapping — add to Task 28.
- LOW-2: Task 31 should name the actual seam: `tool-loop.ts` (where
  InvokeResponse is in hand and enterHitlGate is called) and `hitl.ts`
  (`HitlGateInput` + `sfnInput`) alongside store-token.ts — evidence rides
  handler → tool-loop → sfnInput → store-token → DDB.
- LOW-3: §5.3's "pipeline stage regenerates PolicyDefinition on canon
  release" (L2-4/Part 32.2) has no owning task — state explicitly it is a
  named carry to the Standards-Update/canon-release spec, or it silently
  reads as this spec's scope.
- LOW-4: `AutomatedReasoningPolicyConfig.ConfidenceThreshold` (0–1, optional)
  is never set — pin it explicitly in §1.3/Task 25 rather than inheriting an
  unstated service default.

## 5. Verified GOOD this round (methods executed, exit 0 unless noted)

| Claim | Method | Result |
|---|---|---|
| ApplyGuardrail returns AR assessment for Task 27's contract | @aws-sdk/client-bedrock-runtime models_0.d.ts | `automatedReasoningPolicy?: GuardrailAutomatedReasoningPolicyAssessment` (line 1247) with findings/translations/rules — invalidClaim/reason/suggestedCorrection derivable |
| AR-only guardrail is schema-valid | describe-type required[] | Only Name + both messagings required — AR-only config legal (with 1–2 policies) |
| Schema baseline for Task 30 | schema.graphql:681–691 | GuardrailEvidence has groundingScore/arVerdict/arDetails/citations; Citation type exists; FlaggedApproval absent — additive edit exactly as specced |
| Guardrail env-var scheme | guardrail.ts:23–39 | `GUARDRAIL_*`/`DOCGEN_GUARDRAIL_*` pattern matches Task 6/8's `RECORDWRITE_*`/`ARCHECK_*` extension |
| Eventing seam | publisher.ts:25, audit-trail-registry.ts:91 | publish() exists; Hitl.Approved registered auditTrail:true (Task 32/TEL-5 path real) |
| Handler stack placement | ai-stack.ts:769–796, 1056 | guru/copilot handlers are AiStack Lambdas — single-stack deploy covers Phases 3–6 (feeds NEW M-3 fix) |

Kiro's D2 self-report was accurate on every count checked (17 sections, 38
tasks, 29/7/2 lane split, all claimed fixes present). Phase count is 10
(Phase 0–9), not 9 as summarized — cosmetic, no action.
