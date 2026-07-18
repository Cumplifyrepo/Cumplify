# Tasks — ISO KB Seeding (rev 2)

> **Spec:** iso-kb-seeding
> **Design:** `#[[file:.kiro/specs/iso-kb-seeding/design.md]]` (rev 2, approved)
> **Evidence rule:** Every task closure = checkbox tick + `.kiro/evidence/iso-kb-seeding/task-N.log`
> + code in the SAME commit (rule 7/8). No tick without evidence; no evidence without a tick.
> **Review:** `.kiro/evidence/iso-kb-seeding/tasks-review.md` (T-1 folded)

---

## Lane Legend

| Lane | Meaning |
|------|---------|
| [KIRO] | Build agent executes autonomously |
| [ARCHITECT] | Architect executes (deploy, live readback, infra changes requiring human gate) |
| [REQUIRES-HUMAN] | Owner/architect decision or manual verification required |

---

## Task List

### Phase 1 — Shared Foundations (hermetic unit lane)

- [x] **Task 1** [KIRO] — Shared constants + index template `lang` field
  - Create `services/agents/shared/constants.ts` with `ISO_CANON_TENANT_ID = '__ISO_CANON__'`
    and `EXPECTED_CHUNK_COUNT = 79`.
  - Add `metadata.lang` (type: keyword) to `services/agents/shared/aoss-index-template.json`.
  - Update `verifyTemplate()` in `aoss-apply-template.ts` to fail-closed on missing/wrong
    `metadata.lang` type.
  - Unit tests: verify template validation catches missing lang field.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (existing + new tests), `cdk synth` exit 0.
  - **D-rung:** D1 (code + unit tests pass).

- [x] **Task 2** [KIRO] — One-door `systemOp` threading
  - Add `systemOp?: boolean` to `EmbedRequest` in `services/ai-invoker/src/types.ts`.
  - Update `embed.ts`: pass `request.systemOp ?? false` to `checkCreditBalance()`.
  - Update `emitCreditsTelemetry` in `metering.ts`: add `systemOp?: boolean` to opts,
    include in Detail JSON payload.
  - Update `embed.ts` telemetry call to pass `systemOp`.
  - Unit tests: embed with `systemOp: true` skips credit pre-check; telemetry event
    includes `systemOp: true`.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (existing + new tests).
  - **D-rung:** D1.
  - **ACC mapping:** ACC-6 (metering evidence path).

- [x] **Task 3** [KIRO] — Deterministic chunker + unit-lane .md import wiring (T-1)
  - Create ambient declaration `services/iso-kb-seeder/src/md.d.ts`:
    `declare module '*.md' { const content: string; export default content; }`
  - Add minimal vite plugin to `vitest.config.ts` (or workspace vitest config) that
    resolves bare `.md` imports as `export default <file-content-string>` — the SAME
    specifier as esbuild uses at bundle time. NO `?raw` suffix (esbuild cannot resolve
    suffixed specifiers; the specifier must stay identical in both toolchains).
  - Create `services/iso-kb-seeder/src/chunker.ts` — pure function per design §2.1.
  - Source content accessed via esbuild text loader import (D-1: NO runtime fs).
  - Create `services/iso-kb-seeder/src/content-hash.ts` — SHA-256 over serialized chunks.
  - Unit tests (`services/iso-kb-seeder/__tests__/chunker.unit.test.ts`):
    - Golden count: `chunks.length === EXPECTED_CHUNK_COUNT` (D-5).
    - Every ISO chunk text starts with `[ISO <NNNN> <clause>]`.
    - HLS chunk starts with `[Annex SL HLS]` (R-4: NOT `[ISO HLS`).
    - Every chunk has metadata: tenantId='__ISO_CANON__', standard in {ISO9001,ISO14001,ISO45001,HLS},
      clauseRef non-empty, lang='en'.
    - Parent headers without (b)/(c) produce no chunk.
    - Determinism: two calls yield identical output.
    - Content hash changes when source changes.
  - Property test (`fast-check`): all chunks satisfy metadata invariants.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes (all chunker tests green).
  - **D-rung:** D1.
  - **ACC mapping:** Foundation for ACC-1, ACC-3, ACC-4.

- [ ] **Task 4** [KIRO] — Seeder handler + _meta doc logic
  - Create `services/iso-kb-seeder/src/handler.ts` per design §2.3.
  - Create `services/iso-kb-seeder/src/meta-doc.ts` — read/write `_meta` doc in AOSS.
    - _meta doc uses `metadata.tenantId = '__META__'` and has NO `embedding` field (D-2).
  - Create `services/iso-kb-seeder/src/bulk-index.ts` — embed + bulk-index orchestration.
  - Handler uses `import source from '…/iso-requirements-map.md'` (D-1 esbuild text loader).
  - Unit tests (`services/iso-kb-seeder/__tests__/handler.unit.test.ts`):
    - Mock embed + AOSS: verify skip-on-hash-match (skipped: true, zero embeds).
    - Mock embed + AOSS: verify full-seed-on-mismatch (all chunks embedded + indexed).
    - Mock verifyTemplate failure → handler aborts (fail-closed).
    - _meta doc: tenantId='__META__', no embedding field (D-2 assertion).
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-3 (idempotent no-op), ACC-5 (template fail-closed).

### Phase 2 — CDK Integration

- [ ] **Task 5** [KIRO] — CDK: seeder Lambda + custom resource + data-access policy
  - Add `IsoKbSeederFn` to `infra/lib/ai-stack.ts`:
    - VPC-placed, 512MB, 300s timeout, esbuild `loader: { '.md': 'text' }` (D-1).
    - Env: AOSS_ENDPOINT, AOSS_INDEX_NAME, AI_INVOKER_ARN, POWERTOOLS_SERVICE_NAME.
  - IAM: `aiInvoker.grantInvoke`, `aoss:APIAccessAll` on iso-kb collection ARN.
  - AOSS data-access policy (`IsoKbSeederAccessPolicy`): seeder role as principal,
    full index CRUD on `index/cumplify-iso-kb/*` (D-4: additive, no priority).
  - Custom resource trigger (`IsoKbSeederTrigger`):
    - `FileSystem.fingerprint('docs/architecture/iso-requirements-map.md')` as physicalResourceId.
    - `timeout: Duration.minutes(10)` (R-3: provider timeout >= seeder 300s).
  - Unit tests (CDK assertions): Lambda exists with correct props, custom resource
    exists, data-access policy has correct principal shape.
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes, `cdk synth --all` exit 0,
    CDK Nag clean (or justified suppressions).
  - **D-rung:** D2 (synth-verified).
  - **ACC mapping:** ACC-4 (hash change triggers re-seed), ACC-5 (fail-closed propagates).

- [ ] **Task 6** [KIRO] — Guru handler canon-tenant wiring
  - Import `ISO_CANON_TENANT_ID` from `../shared/constants.js` in all three guru handlers
    (guru-9001, guru-14001, guru-45001).
  - Change `retrieve()` call: `tenantId: ISO_CANON_TENANT_ID` for iso-kb path.
  - User's tenantId continues flowing to invokeFn (metering), grounding events, etc.
  - Unit tests: guru handler passes `ISO_CANON_TENANT_ID` to retrieve (not user tenantId).
  - **Evidence:** `tsc --noEmit` exit 0, `vitest run` passes.
  - **D-rung:** D1.
  - **ACC mapping:** ACC-1 (guru retrieves from canon), ACC-2 (isolation proof setup).

### Phase 3 — Deploy + Live Verification

- [ ] **Task 7** [ARCHITECT] — Deploy to dev + live seeding
  - Push to pipeline, Dev stage deploys.
  - Verify: seeder Lambda invoked by custom resource, logs show `status: 'seeded'`,
    `chunksIndexed` matches EXPECTED_CHUNK_COUNT.
  - Readback: AOSS index `cumplify-iso-kb` exists, document count matches.
  - **Evidence:** Pipeline run ID, CloudWatch log excerpt (`seeded`, chunk count, hash),
    AOSS document count query result, timestamp, git blob SHA of cdk-outputs.json.
  - **D-rung:** D3 (deployed + read back).
  - **ACC mapping:** ACC-4 (first seed = content change from empty).

- [ ] **Task 8** [ARCHITECT] — ACC-1: Guru full-chain grounded answer (live)
  - Invoke `askISO9001` via AppSync with question "What does clause 4.1 require?"
  - Verify: response contains grounded content, `groundingSource` non-empty in logs,
    clauseRef valid against clause-corpus-map, L1 grounding check fires (>= 0.85).
  - **Evidence:** AppSync response excerpt, CloudWatch guru handler log (groundingSource
    present, invokeFn groundingContext populated), guardrail log (grounding score).
  - **D-rung:** D4 (live-proven end-to-end).
  - **ACC mapping:** ACC-1.

- [ ] **Task 9** [ARCHITECT] — ACC-2: Wrong-tenant isolation re-proof (live)
  - Direct retrieval probe: invoke retrieve() with `tenantId = 'TENANT-OTHER'` against
    `cumplify-iso-kb` → expect 0 chunks returned.
  - Also probe with `tenantId = '__META__'` → expect 0 chunks (only _meta doc, no
    embedding = kNN can't match).
  - **Evidence:** Retrieval probe Lambda output (0 chunks for both), timestamp, exit code.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-2.

- [ ] **Task 10** [ARCHITECT] — ACC-3: Idempotent no-op (live)
  - Re-invoke seeder Lambda manually (same sourceHash) → verify logs show `skipped: true`,
    zero embeddings consumed.
  - **Evidence:** CloudWatch log excerpt (skipped: true, durationMs low), no new meter
    increment in `TENANT#__ISO_CANON__#METER`.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-3.

- [ ] **Task 11** [ARCHITECT] — ACC-5: Template verify fail-closed (live)
  - Invoke seeder with a modified verifyTemplate expectation (or against an environment
    where template is absent) → verify handler aborts with clear error.
  - **Evidence:** CloudWatch error log (FAIL-CLOSED message), Lambda exit code non-zero.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-5.

- [ ] **Task 12** [ARCHITECT] — ACC-6: Metering evidence (live)
  - After Task 7 seed: scan DynamoDB for `TENANT#__ISO_CANON__#METER` → verify row
    exists with accumulated credits.
  - Verify NO other `TENANT#*#METER` row was modified during seeding window.
  - Check EventBridge: `telemetry.credits.consumed` events carry `systemOp: true`.
  - **Evidence:** DDB scan result (ISO_CANON meter row), before/after meter snapshot
    for a real tenant (unchanged), telemetry event sample with systemOp field.
  - **D-rung:** D4.
  - **ACC mapping:** ACC-6.

### Phase 4 — Owner Ratification

- [x] **Task 13** [REQUIRES-HUMAN] — Owner ratification: systemOp billing-signal marker
  - Per OQ-1 resolution (flagged billing-adjacent, steering 14-simplicity): owner
    confirms that `systemOp: true` on `telemetry.credits.consumed` is the correct
    exclusion mechanism for platform-COGS seeding from tenant invoicing.
  - **Evidence:** Owner sign-off recorded in `.kiro/evidence/iso-kb-seeding/task-13.log`.
  - **D-rung:** D5 (human verified).
  - **ACC mapping:** ACC-6 (billing-signal integrity).

---

## ACC → Task Mapping Summary

| ACC | Description | Proven by |
|-----|-------------|-----------|
| ACC-1 | Guru full-chain grounded answer | Task 8 (live) |
| ACC-2 | Wrong-tenant isolation re-proof | Task 9 (live) |
| ACC-3 | Idempotent no-op | Task 4 (unit) + Task 10 (live) |
| ACC-4 | Content hash change triggers re-seed | Task 5 (CDK) + Task 7 (live) |
| ACC-5 | Template verify fail-closed | Task 4 (unit) + Task 11 (live) |
| ACC-6 | Metering evidence | Task 2 (unit) + Task 12 (live) + Task 13 (owner) |

---

## Dependency Order

```
Task 1 ─┬─► Task 3 ─► Task 4 ─┐
         │                      ├─► Task 5 ─► Task 7 ─► Task 8
Task 2 ──┘         Task 6 ─────┘              │         Task 9
                                              ├─► Task 10
                                              ├─► Task 11
                                              ├─► Task 12 ─► Task 13
```

Tasks 1, 2, 3, 6 can run in parallel (no cross-dependency within the unit lane).
Task 4 depends on Task 3 (chunker). Task 5 depends on Tasks 1–4 + 6 (all source code).
Phase 3 (Tasks 7–12) is sequential after deploy.
Task 13 is gated on owner availability.
