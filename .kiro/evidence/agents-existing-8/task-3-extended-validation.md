# agents-existing-8 Task 3 (extended) — Architect Re-Review

**Commit:** 3f8c5f8 (folds AOSS provisioning + T3-F2/F3/n1 per owner decision)
**Method:** on-disk read of ai-stack.ts AOSS section + weight-seeder.ts + seeder wiring; corpus cross-check (§4.2, R5-CARRY, REQ-CDK-6). Re-ran ai-stack.unit.test.ts context.
**Verdict:** **NOT APPROVED** — collections/policies folded correctly, but the R5 carry is documented-not-enforced and the weight-seeder has a near-certain Task-9 deploy failure. All [KIRO] fixes. Task 4 (IAM) may proceed in parallel.

## Correct (verified)
- 3 CfnCollection (VECTORSEARCH), `standbyReplicas: 'DISABLED'` (scale-to-zero), per-collection encryption + network policies with `addDependency` ordering (ai-stack.ts:52-90). ✓
- Network policy SourceVPCEs uses the AOSS-managed VPC endpoint id (not the EC2 interface endpoint) — correct per network-stack notes. ✓
- Collection endpoint + ARN CfnOutputs (consumed by Task 5 wrapper / Task 12 proof). ✓
- T3-F2: WaitForApproval "no Lambda needed" comment removed; placeholder flagged TODO-Task-8. ✓
- R-8/9/10 detailTypes confirmed vs §2.2. Guardrail zero-Anthropic intact. ✓

## Findings

### T3E-F1 (MEDIUM) — R5 carry (tenantId keyword) is documented, not enforced
`CfnCollection` creates the collection, **not** the index. The mapping with `metadata.tenantId: keyword` + `knn_vector` 1024 exists ONLY as a **comment** (ai-stack.ts:97-121); application is deferred to "Task 9" with no committed artifact and no code. Consequences:
- The `_index_template` MUST be applied to the live collection endpoint **before the first document is seeded** (Task 12). If not, the auto-created index maps `tenantId` as analyzed `text`, and `term: { 'metadata.tenantId': tenantId }` (retrieval.ts) most likely matches **nothing** → Guru grounding silently breaks (fail-closed; a cross-tenant leak is unlikely given tokenization, but grounding is dead).
- A comment is not machine-usable — the deferred custom resource has nothing to consume and would re-author the mapping (drift).
- Applying it needs a VPC-attached, SigV4-signing Lambda with AOSS **data-access** (deferred to Task 4) + network reach.
**Fix:** (1) commit the mapping as a real artifact (e.g. `services/agents/shared/aoss-index-template.json`) — the source of truth, not a comment; (2) build + track the apply-template custom resource as a Task-9 deliverable (VPC Lambda + SigV4 + Task-4 data-access), ordered before any seed; (3) make Task 12 seeding **fail-closed** if the template is absent (GET `_index_template` first) so no document is ever indexed against an auto-mapped field. Task 12's bidirectional negative proof remains the final backstop.

### T3E-F2 (HIGH-confidence latent Task-9 deploy failure) — seed JSON not bundled into the Lambda
`weight-seeder.ts:40` does `readFileSync('../data/model-weights-seed.json')` at runtime, but `WeightSeederFn` is a `NodejsFunction` (esbuild) with no `commandHooks`/copy (ai-stack.ts:346-357). esbuild bundles JS, **not** arbitrary data files — so at runtime the file isn't in `/var/task/data/` → **ENOENT → seeder throws → deploy fails.** This is the same class as the api-core migrator path bug we already hit.
**Fix:** `import seed from '../data/model-weights-seed.json'` (esbuild inlines JSON imports) or add a bundling copy hook. (Note: `model-weights-seed.json` doesn't exist yet — Task 2 — so an `import` would also fail synth until Task 2 lands; sequence accordingly.)

### T3E-F3 (MEDIUM) — unhandled ConditionalCheckFailedException on same-day redeploy
`weight-seeder.ts:63` uses `ConditionExpression: 'attribute_not_exists(PK)'`; SK = `VERSION#<yyyymmdd>` (line 44,48). On a **same-day redeploy** the (PK,SK) already exists → `ConditionalCheckFailedException` → unhandled (no try/catch) → seeder throws → **deploy fails.** The condition intended to make re-seed a no-op instead turns "already seeded" into a hard failure.
**Fix:** catch `ConditionalCheckFailedException` per item and treat as already-seeded (skip), or drop the condition (PutItem is naturally idempotent for identical data).

### T3E-F4 (MEDIUM) — seed changes won't re-trigger the seeder (staleness)
`AwsCustomResource` (ai-stack.ts:372) uses a **static** `physicalResourceId: 'weight-seeder-v1'` and a **constant** payload `{action:'seed'}`. CFN sees no property diff when the seed file changes → `onUpdate` never fires → a re-priced `model-weights-seed.json` is **not** re-seeded on redeploy.
**Fix:** incorporate a hash of the seed file into the payload or `physicalResourceId` so a changed seed forces a re-run (and pair with the F3 idempotency fix so the re-run doesn't collide).

### T3E-n1 (LOW) — verify enc-policy CMK + reconsider bedrock in net policy
Confirm the encryption policy references `props.bedrockKeyArn` (`AWSOwnedKey:false`, `KmsARN:<cmk>`). Under Option B (Lambda does retrieval; no Bedrock KB → AOSS path), `bedrock.amazonaws.com` in the network policy is likely vestigial — remove unless a Bedrock→AOSS path is intended.

## Disposition (R1, vs 3f8c5f8)
Collections/policies (owner's ask) folded correctly. Fix the weight-seeder (F2/F3/F4 — all Task-9 blockers) and commit the index-mapping artifact + track its application (F1). Task 4 (IAM, REQUIRES-HUMAN) proceeds in parallel and must carry: the AOSS **data-access policy** (invoker + agent-handler read; indexer/apply-template + seeder write), the T-1 correction (agent handlers read-only), and the store-token Lambda write scope.

---

## Re-Review R2 (vs e55ec2b — HEAD)
Kiro fixed against e55ec2b before R1 landed. Independent re-verification on disk + **empirical bundle test**:
- **F3 — ✓ FIXED.** `ConditionalCheckFailedException` caught per-item, skip+count (weight-seeder.ts:79-87). Same-day redeploy no longer fails.
- **F4 — ✓ FIXED.** Placeholder `model-weights-seed.json` now exists (163B, empty `models:{}`), so `cdk.FileSystem.fingerprint` won't throw at synth; hash is in `physicalResourceId` → changed seed re-triggers.
- **n1 — ✓ FIXED.** Zero `bedrock.amazonaws.com` refs.
- **F1 — PARTIAL.** Part 1 (artifact `aoss-index-template.json`, tenantId=keyword, dim=1024) ✓. Parts 2 (apply-template custom resource) + 3 (Task-12 fail-closed template check) exist only as a **code comment** (ai-stack.ts:316-324); NOT tracked as deliverables in tasks.md Task 9/12. Deferral is architecturally fine (apply Lambda needs Task-4 data-access), but must be a **tracked** task line, not a comment.
- **F2 — ✗ STILL BROKEN (confirmed by bundle test).** The `createRequire` "fix" does NOT inline the JSON. esbuild bundle of weight-seeder.ts leaves `var seed = require2("../data/model-weights-seed.json")` as a **runtime require** (bundle contains 0 occurrences of the seed's PLACEHOLDER string). At runtime the Lambda resolves `../data/...` to `/var/data/model-weights-seed.json` → **MODULE_NOT_FOUND → seeder throws → Task 9 deploy fails.** Control test: a static `import seed from '../data/model-weights-seed.json'` inlines it (PLACEHOLDER appears in bundle). The code comment "esbuild resolves and inlines it" is false. **Fix: replace `createRequire`+`require()` with `import seed from '../data/model-weights-seed.json'`** (esbuild default json loader inlines at bundle time; re-bundle after Task 2 overwrites the file picks up new content).

**R2 verdict:** NOT APPROVED — F2 remains a live Task-9 deploy failure; F1 parts 2/3 need tasks.md tracking. Re-commit F2 as a static import + add unit assertion that the bundled seeder contains the seed data (or that Object.keys(seed.models) loads at runtime). F3/F4/n1 confirmed done. Task 4 (IAM) still proceeds in parallel.

---

## Re-Review R3 (vs 53a834f) — APPROVED
Independent verification on disk + bundle test + tsc + unit run:
- **F2 — ✓ FIXED (verified).** Source now `import seedRaw from '../data/model-weights-seed.json' with { type: 'json' }` (weight-seeder.ts:35). Independent esbuild bundle: **PLACEHOLDER inlined = 2, runtime require/createRequire = 0** — JSON inlined at bundle time, no MODULE_NOT_FOUND. `tsc --noEmit -p services/ai-invoker` clean (import attributes accepted).
- **F1 — ✓ TRACKED.** Task 9 (tasks.md:186-187,193): apply-template CR (VPC+SigV4, PUT `_index_template` before any seed) + GET-verify acceptance gate. Task 12 (tasks.md:240): fail-closed template check before seeding. Acceptance-gated deliverables, not comments.
- **F3/F4/n1 — ✓** confirmed in R2.
- Tests: 26/26 (weight-seeder + ai-stack unit), incl. assertions for seed-hash physicalResourceId (F4) and index-template tenantId=keyword (F1/R5).

**Nit (cosmetic, non-blocking):** weight-seeder.ts file docstring (lines 2-3, 8) still says "Uses createRequire … esbuild bundles JSON inline" — stale; the code now uses a static import. Fix the header to avoid misleading a future reader that createRequire works.

**Disposition:** Extended Task 3 CLOSED. AOSS collections + policies + keyword mapping artifact folded; seeder bundles correctly; apply-template + fail-closed guard tracked for Task 9/12. Next gate: **Task 4 (IAM, REQUIRES-HUMAN)** carrying: AOSS data-access policy (invoker+agent read; apply-template + seeder write), T-1 agent-handler zero-write, store-token Lambda write scope.
