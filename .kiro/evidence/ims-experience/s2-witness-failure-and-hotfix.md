# S2.1 — Document Studio witness failure → hotfix (2026-07-22)

## What happened

Deploy of 511f408 (S2) SUCCEEDED — execution `1bf29ac1-3ee3-4025-9773-24bb0512aff4`
pinned to the full SHA via `sourceRevisions`, all Dev actions green
(Dev-AiStack 16:19:33Z, Dev-ApiStack 16:17:21Z, `cumplify-doc-studio-dev`
LastModified 16:20:17Z, writeback `CONTENT_BUCKET` env live).

S2 UI witness (`witness_s2_doc_studio.mjs`, real click on **Draft with
DocStudio** at the deployed CloudFront) — **FAILED**, exit 1:
signed in ✓, click dispatched ✓, no `[data-testid^="hitl-card-"]` within 180s.

The dispatch chain itself worked: frontend → `runDocDraft` resolver →
Event-invoke → `cumplify-doc-studio-dev` ran at 16:24:59Z. The run died in
2.2s with two independent defects.

## Defect 1 — AOSS retrieval 401 (both KB collections)

```
{"level":"ERROR","message":"AOSS retrieval non-retryable error", ...
 "tenantId":"tenant-AAA","error":"AOSS search failed: 401 ","attempts":1}   × 2
```

Root cause chain (each hypothesis eliminated against live state):
- DocStudio role IS in the live data-access policy `cumplify-ai-access-dev`
  (verified: exact ARN `...DocStudioHandlerFnServiceRole0F9A5DB0-oXZb0ufrEOzf`
  listed for all 3 collections) → not a policy-membership gap.
- Endpoints identical to CAPAGuru's env → not a wiring gap.
- **All three collections' network policies are `AllowFromPublic: false`,
  admitting only `vpce-089b26b4a26fc80f5`.** Guru-9001 (VPC-placed) retrieved
  successfully 2026-07-21 18:01Z from the same collection; DocStudio and
  CAPAGuru are NOT VPC-placed → their data-plane calls arrive from the public
  internet → 401.
- This was a **documented deferral**, not an unknown: ai-stack.ts FIX-T20-3
  comment — "SQS consumers stay out of the VPC until their endpoint set
  (states, rds-data) exists." S2 wired user-facing retrieval into exactly
  that gap. CAPAGuru's analyze-path grounding has been silently degrading to
  `''` (catch-and-continue) for the same reason.

## Defect 2 — Bedrock guardrail intervened on INPUT

```
{"message":"Unexpected stopReason", "stopReason":"guardrail_intervened","turn":0}      (doc-studio)
{"message":"Guardrail intervened on input — short-circuiting"}                          (ai-invoker, same trace)
```

- Workhorse seat routes to the Agent guardrail: PROMPT_ATTACK inputStrength
  HIGH + PII + grounding-on-output. Input policies only: PROMPT_ATTACK + PII.
- The runDocDraft message carried **no guardContent block**, so Bedrock
  evaluated the ENTIRE composed message as untrusted input — including the
  trusted orchestration framing ("DRAFT MODE… draft it WHOLE via doc-draft"),
  which reads as an embedded-instruction prompt attack. S1's intake passed on
  the same shape only because the classifier didn't tip on its milder wording
  — same latent defect.
- The codebase already has the designed mechanism, used by qms-generation
  compose-section since spec-40: `guardedText` blocks → selective evaluation
  (converse.ts translates to `guardContent`).

## Defect 3 (found in passing) — placeholder embeddings

Both CAPAGuru (`// For now, placeholder — the embedding step is integrated at
Task 9 deploy.`) and DocStudio queried kNN with `Array(1024).fill(0.01)` —
constant-vector kNN is relevance noise. Guru handlers have used the real
one-door `createEmbedFn()` path since spec-35 Task 19.

## The hotfix (this commit)

1. **network-stack.ts** — `states` + `sqs` interface endpoints added (the
   exact set FIX-T20-3 named as the blocker). HITL gate = SFN StartExecution;
   consumer DLQ = SQS SendMessage; both unreachable from the zero-NAT VPC
   before this.
2. **ai-stack.ts** — `vpcPlaced: true` for CapaGuruFn + DocStudioHandlerFn.
   RecordsVault et al. stay out (no retrieval; endpoint needs unmapped).
3. **doc-studio/handler.ts, capa-guru/handler.ts** — user-typed text
   (`draftIntent.intent`, `intake.description`, `intake.evidenceNote`) rides
   in `guardedText`; trusted framing stays out of PROMPT_ATTACK evaluation.
   Real Titan embeddings via `createEmbedFn()` replace placeholder vectors
   (inside the try — embed failure degrades to no-grounding, never blocks).
4. **ai-invoker/guardrail.ts** — `feature === 'doc-draft'` → DocGen guardrail
   (spec-40 BC-5 rationale: Agent-guardrail PII anonymization would redact
   the tenant's own names out of their draft; PROMPT_ATTACK + SSN/card BLOCK
   retained).

## Verification (all executed 2026-07-22, exit 0)

| Check | Result |
|---|---|
| `npm run test` (hermetic) | backend 1240 passed / 3 skipped (was 1237: +1 guardrail routing, +2 VPC pins); frontend 186 passed |
| `npx tsc --noEmit` (root) | clean, exit 0 |
| ai-stack.unit.test.ts | VPC pin now: gurus + capa-guru + doc-studio in VPC on both subnets; records-vault pinned OUT |
| network-stack.unit.test.ts | endpoint set pin extended with `.states` + `.sqs` |

Live re-witness (real click → doc-draft HITL card) follows the next deploy —
recorded separately in `s2-doc-studio-witness.md`.

## Cost note (owner-visible)

Two new interface endpoints ≈ $7.30/mo each per AZ (2 AZs → ~$29/mo in dev,
same again in staging/prod when promoted). This is the price of the VPCE-only
AOSS posture; the alternative (AllowFromPublic on the collections) was not
taken — it would remove the network wall around every tenant KB.
