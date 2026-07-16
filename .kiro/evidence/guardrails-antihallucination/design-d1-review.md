# Spec-35 design D1 + tasks — architect review (2026-07-16)

**Verdict: NOT APPROVED — revision D2 ordered.** Three HIGH findings (one
requirement-coverage, one architecture/cost, one missing plumbing), four
MEDIUM, six LOW. The verification layer (§0) is fully genuine — every claim
independently re-executed and confirmed. The fix list is bounded; no
re-derivation of the architecture is needed.

## Independent re-verification of §0 claims (all CONFIRMED)

| Claim | Method | Result |
|---|---|---|
| CFN `ContextualGroundingPolicyConfig` / `AutomatedReasoningPolicyConfig` / `CrossRegionConfig` on `AWS::Bedrock::Guardrail` | `cloudformation describe-type` (readonly, us-east-1) | ALL THREE in registry schema; ARConfig = {ConfidenceThreshold, Policies[]} |
| `AWS::Bedrock::AutomatedReasoningPolicy` standalone resource | describe-type | EXISTS |
| Installed CDK supports the typed props | node_modules aws-cdk-lib 2.261.0 grep | contextualGroundingPolicyConfig / automatedReasoningPolicyConfig / crossRegionConfig ×4 each + CfnAutomatedReasoningPolicy present — Tasks 5/6/23 compile as typed L1 (no addPropertyOverride needed) |
| ApplyGuardrail returns numeric grounding score | @aws-sdk/client-bedrock-runtime model | `GuardrailContextualGroundingFilter { type, threshold, score, action, detected }` — DQ-2 confirmed |
| `bedrock:InvokeAutomatedReasoningPolicy` IAM action | servicereference.us-east-1.amazonaws.com/v1/bedrock (machine-readable) | REAL (25 AR actions total); ApplyGuardrail also confirmed |
| Grounding evaluates OUTPUT only; qualifier semantics | docs.aws.amazon.com guardrails-contextual-grounding-check | CONFIRMED verbatim (§0.3 accurate) |
| Titan Embed v2 access (Task 4 factual half) | LIVE micro-invoke, dev-admin, 2026-07-16 | ACCESSIBLE — 1024 dims returned, `inputTextTokenCount: 2` — exact §2 response shape. Task 4's remaining human scope = IAM sufficiency sign-off only |

New fact Kiro missed (docs, same page): **grounding QUERY is capped at 1,000
chars** (source 100k, response 5k) — see M-3.

## HIGH findings (blocking)

**H-1 — Agent-handler retrieval wiring is MISSING from tasks; L1 ships
permanently dormant.** §12.3 declares grounding "dormant until callers provide
groundingContext," but no task makes any caller provide it: nothing touches
guru-9001/14001/45001 or copilot handlers (embed via invoker → AOSS retrieve()
under the 45s budget → pass groundingContext). Consequences: requirements §1's
stated purpose ("production agent handlers perform genuine query embedding for
retrieval") is unmet; L1-11 lands nowhere; ACC-1/ACC-2 live legs are
unprovable forever (ACC-1 says "evidenced by a READBACK test"). This is the
GEN-6 class — a headline acceptance with no task that can ever prove it.
FIX: add handler-wiring tasks [KIRO] + a live grounded/ungrounded ACC-1/2
readback task [ARCHITECT].

**H-2 — AR attached to the main AgentGuardrail violates L2-7 and triples
evaluation cost.** Task 23 attaches all three AR policies to AgentGuardrail;
that guardrail rides EVERY inline Converse call (all advisory traffic) AND is
re-invoked post-response for grounding — so every advisory call would pay AR
evaluation (AR checks carry per-check pricing + latency) twice, on paths L2-7
explicitly scopes out ("attached to the RELEVANT invocation paths only").
FIX: quarantine AR on a dedicated `ArCheckGuardrail` (AR policies +
CrossRegionConfig ONLY), invoked exclusively by ar-check.ts post-response on
clause-citing/role/plan paths. AgentGuardrail + RecordWriteGuardrail stay
grounding-only with NO CrossRegionConfig (also dissolves DQ-1). Bonus: the
cross-region data-residency note then applies only to AR evaluations
(guardrail profile us.guardrail.v1:0 routes within US regions — flag for owner
visibility either way).

**H-3 — L5 producer chain is missing: evidence never reaches the HITL item.**
Tasks 28/29 cover the GraphQL type and approval-time enforcement, but nothing
carries `InvokeResponse.guardrailEvidence` → agent handler → enterHitlGate/
store-token → DDB HitlItem. Spec-9 Task 17 proved the READ surface with a
SIMULATED direct-DDB item; producing real evidence is exactly spec-35's job —
without it, `flagged` is never true in production and Task 29's enforcement is
dead code (facade class). Citation construction is also unspecified (who
builds `{clauseRef, sourceChunk, score}` from retrieval chunks).
FIX: add a [KIRO] task extending the HITL item shape + agent handlers passing
evidence through, and specify citation construction (invoker-side from
groundingContext chunks).

## MEDIUM findings

- **M-1** TEL-1's per-invocation telemetry event has no named detailType —
  the publisher throws on unregistered types. Name it (`Ai.GuardrailChecked`,
  auditTrail:false, entityId '') and fold into Task 1.
- **M-2** §6.4 L4-8 invents a per-clauseRef ApplyGuardrail mechanism that
  doesn't exist (AR evaluates whole responses). Restate: L4-8 is satisfied by
  the L2 response-level AR check on clause-citing paths; if a cheap pre-filter
  is wanted, use a DETERMINISTIC registry check against the corpus map
  (spec-40 checker pattern) — free, offline, and stronger than regex+AR.
- **M-3** groundingContext.query must be validated/truncated to the 1,000-char
  API cap (Ask Cumplify questions can exceed it); document alongside the 100k
  source cap.
- **M-4** Task 7's readback must add (a) an EMPIRICAL no-source probe — live
  agent invoke without grounding source asserting NOT blocked (docs imply
  skip-when-absent via "requires 3 components"; pin it live, don't trust
  prose), and (b) live MODELWEIGHT#titan-embed row seeding/verification
  (Task 2 only edits the seed JSON; the DDB row must exist for embed metering).

## LOW findings

- L-1: Ai.* events are auditTrail:false → never ledger-appended; entityId is
  type-required but cosmetic here — spec '' consistently (or hitlItemId when
  known) instead of promising "draft/record row ID".
- L-2: invoker should publish via eventing `publish()` directly
  (execute-writeback precedent), not import api resolvers' publishAuditEvent.
- L-3: honest-miss locale source unspecified — use tenant documentLocale
  (spec-41 T8 precedent) or an explicit InvokeRequest.locale.
- L-4: §6.2 buildSystemPrompt(basePrompt, locale) vs Task 17's
  buildSystemPrompt(basePrompt) — reconcile signatures.
- L-5: design base commit 4322672; develop is now eddf777 (cleanup wave —
  no expected conflicts; appendAuditEvent removal already landed).
- L-6 (process): deliverables were UNCOMMITTED on review (rule 7) — D1 +
  this review committed together by architect; D2 revision must be a commit.

## Verified GOOD (kept, no round needed)

Three-guardrail topology + routing priority; docgen scope boundary explicit;
§0 verification genuinely executed (see table); TEL-6 registry-before-publish;
envelope entityId constraint incorporated; F-E flagged-vs-evidence distinction
+ F-F server-side enforcement; DQ-3 honestly OPEN with a fallback plan;
§12.3 dormancy honesty; honest-miss template makes no factual claims;
[REQUIRES-HUMAN] gates correctly placed (Tasks 4, 24); IAM wildcard rationale
for AR versioning is sound.
