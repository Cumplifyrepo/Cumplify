# Kiro reinstatement brief — post-studio-wave backlog

**Date:** 2026-07-22 · **Authority:** owner ruling (usage-driven transition;
supersedes the same-day bounce for FUTURE work only)
**Architect role reverts to:** independent stage validation, paste-ready
responses, deploys/readbacks, UI witnesses. Kiro builds; the architect never
builds unless the owner rules otherwise again.

---

## 1. What is DONE and must not be rebuilt

All five studios shipped and are live on Dev (last commit `efbbf44`,
deploying at time of writing). Do not re-scaffold or refactor these
surfaces; extend them only where the backlog below says so.

| Surface | Route | Agent loop |
|---|---|---|
| CAPA Studio | `/capa` | NC intake (CAPAGuru) + 5-Whys/Ishikawa RCA (`runRootCauseAnalysis`) |
| Document Studio | `/documents` | doc drafts (DocStudio) + D1 draft editing (RS-9 save, tracked changes) |
| Manual Studio | `/manual` | per-section drafts (`runManualSectionDraft` → docgen-regen delegation) |
| Audit Studio | `/audits` | S4 slice 1: findings loop (LeadAuditor) + finding→NC cross-studio spawn |
| Chassis | StudioShell / HitlCard / ProposalView / AgentRunButton | shared by all |

Binding studio doctrine (owner, Checkpoint B rejection — all five per surface):
1. The big button IS the agent.
2. Inline HITL cards where the work happens (approve/reject/edit, SoD visible).
3. AI drafts → human completes (tracked changes, per-section regenerate).
4. Full lifecycle rail, approval-matrix-driven.
5. No manual field the AI can infer.

## 2. Backlog (Kiro builds, in this order)

### B1 — S4 slice 2 (Audit Studio completion)
- `completeAudit` surfaced as a studio action (mutation exists; no UI caller).
- Readiness scoring as a studio action on the audit detail.
- m3 resolver dispatch unit test for `runAuditFindings` (pattern-identical to
  the pinned `qms.runManualSectionDraft` test — copy that shape).
- RS-3..RS-5 read-surface folds per `read-surface-completion` spec.

### B2 — Register duplicates fix (BLOCKED on owner ruling A/B/C)
Architect recommendation on record: **C — idempotent finalize per
`harmonizationKey`**. Do not start until the owner rules.

### B3 — Tenant-docs indexer
Nothing indexes published documents into `cumplify-tenant-docs`; every
agent's tenant-docs retrieval leg currently 404s (by design, allSettled
keeps the other leg alive). Build the indexer (publish event → embed via
`createEmbedFn()` → AOSS write). The writer Lambda MUST be `vpcPlaced`
(see lesson L1).

### B4 — Stripe billing portal
Per-customer portal-session mutation + `NEXT_PUBLIC_STRIPE_BILLING_PORTAL_URL`
(BLOCKED on owner supplying the URL).

### B5 — `/qms` → `/manual` flip after Setup Wizard (Migration Law stubs
already prepared — activate, don't rebuild).

### B6 — GEN-LANE-1: composer empty-`factRefs` flake takes a whole run PARTIAL
Found live during B2 ruling-C acceptance (2026-07-23), evidence
`b2-readback-green.md` §3 negative control. On a full `generateImsManual`
re-run the composer emitted a sentence with an **empty `factRefs` array** for
section `10.2#ISO45001`; the structured-output schema rejects it
(`services/ai-invoker/src/doc-composer-schema.ts:24-28`, `factRefs`
`minItems:1` → "expected ≥1 items,
got 0"), the invoker schema-retry (SERVE-10) exhausted, the section never
composed, and the run terminated **PARTIAL**. Consequence: that one clause's
register doc was left at its **stale version** (`10.2#ISO45001` was the sole
key of 45 that did not bump v→v+1) with **no user-facing signal** — the other
44 sections finalized fine. This is a pre-existing generation-lane class, NOT
a B2 defect (B2's idempotent finalize behaved correctly: errored section →
no finalize call → no version change). Design options (Kiro's call): prime the
schema-retry prompt on the empty-`factRefs` failure specifically; add a
per-sentence repair pass before giving up; or degrade gracefully so a single
flaky section surfaces as a named, re-runnable gap instead of a silent PARTIAL.
Deterministic checker parity to preserve:
`services/qms-generation/src/checker.ts:64` (fact RESOLUTION
stays in checker code — the model never grades itself).

## 3. Standing lessons — every one was found live, not in tests

- **L1 · AOSS is VPCE-only.** All three collections reject public data-plane
  calls. Any Lambda doing retrieval or indexing must be `vpcPlaced` in
  `ai-stack.ts` (interface endpoints for states+sqs already exist). A non-VPC
  agent 401s at runtime and NO unit test catches it.
- **L2 · Selective guardrails.** All tenant-typed content rides in
  `{ guardedText }` blocks; trusted preambles stay plain text. Without
  guardContent the whole message is treated as untrusted and PROMPT_ATTACK
  trips on our own framing. Routing lives in `ai-invoker/src/guardrail.ts`
  (doc drafting → DOCGEN, record-write → RECORDWRITE, else Agent).
- **L3 · Dispatch mutations never `publishAuditEvent`.** The registry is
  fail-closed and throws AFTER the Event-invoke — card created, mutation
  errored, button never polls. The HITL plane owns the audit trail. Pinned
  by tests on all five run* resolvers; keep parity in new ones.
- **L4 · Resolver env vars are read at CALL time**, never at module scope
  (ESM import hoisting defeats test env setup).
- **L5 · Real embeddings only** via `createEmbedFn()`; iso-kb queried as
  `__ISO_CANON__`; tenant collections as caller tenantId;
  `Promise.allSettled` legs so one failing leg never discards another.
- **L6 · Agents never touch the DB.** Resolvers read context and pass it in
  the Event payload; writebacks happen only in execute-writeback on approval.
- **L7 · AWSJSON wire rules.** Inputs arrive parsed (accept both shapes);
  outputs return objects (`jsonOut`); AWSJSON mutation inputs are JSON
  strings on the wire (`JSON.stringify(...)`).
- **L8 · IAM grants for zero-caller mutations are invisible until clicked.**
  RS-9 shipped fully tested with s3:GetObject only; the first real Save hit
  AccessDenied. When you wire the FIRST caller of any existing mutation,
  re-verify its resolver's grants against what the code path actually does.
- **L9 · Root `tsc --noEmit` does NOT cover `frontend/`.** The frontend is
  only type-checked by `next build`, which runs in the DeployFrontendContent
  CodeBuild — i.e., at deploy time. The efbbf44 deploy failed exactly this
  way (EmptyState `action` prop misuse on /audits; architect's own defect).
  Run `cd frontend && npx tsc --noEmit` before every claim of green, and
  render every conditional branch (empty states!) in at least one test.
  Related trap: `EmptyState.action` is a ReactNode; `GuidanceBanner.action`
  is `{label, onClick}` — don't pattern-match one onto the other.

## 4. Constitution (unchanged, non-negotiable)

- Never `extend type` in AppSync (silently ignored); new resolvers need an
  explicit node dependency on the schema resource AND a resolver-pin bump in
  `api-stack.unit.test.ts` (currently **98**) with a dated changelog line.
- SCHEMA-5: no `tenantId` in any GraphQL mutation input.
- Hermetic unit lane (fake AWS creds, IMDS disabled); live calls are int-lane.
- No hardcoded UI strings; en/es/pt catalogs in the SAME commit.
- `vitest` never typechecks — run `npx tsc --noEmit` at root AND in
  `frontend/` (see L9) before claiming green. Baselines at handoff:
  backend **1262** (3 skipped), frontend **198**.
- Task closure = checkbox ticks + per-task evidence log in the same commit.

## 5. Tightened validation gate (new, per the three-strike history)

Every claim of "delivered" in a Kiro task report MUST cite the **mount/call
site** — the `file:line` where the feature is reachable from a real user
flow (component mounted, resolver wired, button rendered), not just where
the code is defined. The architect will trace every cited site and reject
the stage on the first untraceable claim. Honest deferrals ("built, not yet
mounted — deferred to X") are fine and always preferred; the strikes were
for claimed-vs-actual, never for deferring.

UI witnesses remain architect-side: a surface is not DONE until a real
browser click produced the claimed behavior on deployed Dev. API witness ≠
UI witness.
