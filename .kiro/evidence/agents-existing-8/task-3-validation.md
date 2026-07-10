# agents-existing-8 Task 3 — Architect Validation (AiStack CDK skeleton)

**Commit:** a952d0b
**Method:** on-disk read of ai-stack.ts + eventing-stack diff + cross-check vs design §4.2/§7, REQ-CDK-6/7, tasks.md Task 3 checklist, R5-CARRY. Re-ran ai-stack.unit.test.ts (15/15).
**Verdict:** **Code APPROVED as-scoped; SPEC needs amendment before Task 9.** Task 3's code faithfully implements its tasks.md checklist and tests pass — but the checklist omits a whole subsystem (AOSS provisioning) and two items are stubbed in ways that will fail at deploy/runtime if not closed. These are plan gaps, not Task-3 code defects.

## Correct (verified)
- Guardrail: PROMPT_ATTACK (input HIGH) + PII (EMAIL/PHONE/NAME anonymize, SSN/CARD block); **zero Anthropic references** (REQ-CDK-7) — explicitly tested. ✓
- AI Invoker Lambda: NODEJS_22_X, ARM_64, 512MB, 90s. bedrock:InvokeModel+ApplyGuardrail on the invoker role ONLY (Resource * per Bedrock constraint). DDB scoped by LeadingKeys to METER/MODELWEIGHT/ENTITLEMENT. ✓
- 3 queues+DLQs (enforceSSL, maxReceiveCount 3, 360s visibility), 3 DLQ alarms (depth≥1 for 15min), R-8/R-9/R-10 rules + canonical input transformer + retry/DLQ. ✓
- HITL SM is Step Functions STANDARD, 8-day outer timeout. EventingStack exports added. cumplify-stage dependencies wired. ✓

## Findings

### T3-F1 (HIGH — spec coverage gap: AOSS is unprovisioned by any task)
No AOSS **collection**, **encryption/network/data-access policy**, or **index mapping** exists anywhere in `infra/` (only NetworkStack VPC endpoints) — and **no task creates them**. Yet:
- design §4.2 defines 3 collections (ISO-KB, TENANT-DOCS-KB, NC-HISTORY), Titan 1024-dim, metadata `tenantId` **filterable**;
- REQ-CDK-6 (design line 1017) → "**AOSS data-access policy in AiStack**";
- Task 5's wrapper queries them; Task 9 deploy is expected to make "AOSS collections accessible"; Task 12 (ACC-4) depends on "AOSS collections accessible" and seeds TENANT-DOCS-KB.
Without a provisioning task, Task 9 deploys no collections and **Task 12/ACC-4 cannot run**. This is also the home of **R5-CARRY** (metadata.tenantId as a `keyword`/filterable field — required for the `term` filter to isolate tenants).
**Fix:** amend tasks.md — add AOSS provisioning (3 collections + encryption/network/data-access policies + index with `metadata.tenantId` keyword) to AiStack (extend Task 3 or insert Task 3b), **before Task 9**. Fold the data-access *grant* into Task 4 (REQUIRES-HUMAN, IAM-adjacent per REQ-CDK-6); the collection+index creation goes in the stack.

### T3-F2 (MEDIUM — HITL is not approvable as wired, and is a latent deploy failure)
`WaitForApproval` (ai-stack.ts:133-147) uses `arn:aws:states:::lambda:invoke.waitForTaskToken` with `FunctionName: ''` and the comment "no Lambda needed for pure wait." That is architecturally wrong: the task token `$$.Task.Token` is generated inside the SM but **never persisted** anywhere the frontend can read it, so there is **no path to `SendTaskSuccess`** — the gate can never be approved. `enterHitlGate` (hitl.ts) stores `sfnExecutionArn` but not the task token. Also, an empty `FunctionName` in a CustomState passes `cdk synth` (raw ASL, unvalidated) but is a **latent Task-9 deploy failure** when CFN validates the definition.
**Fix (Task 4/8):** invoke a "store-token" Lambda here that writes `$$.Task.Token` into the DDB HITL item (keyed by `hitlItemId` from `$`), so the frontend can retrieve it and approve. Correct the misleading comment. Add a deploy-time assertion.

### T3-F3 (MEDIUM — checklist items not delivered; must land before Task 9/10)
Docstring/checklist claim a **MODELWEIGHT# seeding custom resource** and **inference profiles**, but ai-stack.ts implements neither (commit calls seeding a "placeholder"). Seeding is defensibly deferred until Task 2 commits `model-weights-seed.json` — **but it must land before Task 9**, because every `invoke()` calls `loadWeights()` which throws `No MODELWEIGHT# entry found` if the items aren't seeded (metering.ts:55-57). So Task 10's first live invoke fails without it. Likewise the EventingStack **ESM on capa-intake/records** (Task 3 checklist) is absent — reasonably deferred to Task 8 (needs the agent handler Lambdas), but track it explicitly.
**Fix:** track seeding-CR + ESM as explicit gated deliverables (seeding before Task 9; ESM in Task 8); don't leave silently absent.

### T3-n1 (LOW) — verify R-8/R-9/R-10 detailType sets against design §2.2 event registry
`Scope.Changed`/`Policy.Updated` intentionally appear in both R-8 and R-10 (two consumers) — fine; confirm the exact sets match §2.2.

## Disposition
Task 3 code is sound for its scope and green, but REOPENED per owner decision (2026-07-08): **fold AOSS provisioning into Task 3 scope**, then re-review Task 3 before Task 4.
- **T3-F1 → Task 3 (extended):** add to ai-stack.ts — 3 CfnCollection (VECTORSEARCH, scale-to-zero) reusing DataStack encryption/network policies + NetworkStack AOSS data-plane VPC endpoint; index mapping with `metadata.tenantId` as **keyword** (R5-CARRY); + the AOSS security policies. The data-access GRANT (roles → collection) folds into Task 4 (IAM, REQUIRES-HUMAN).
- **T3-F2 → Task 4/8:** store-token Lambda persists `$$.Task.Token` into the DDB HITL item; correct the "no Lambda needed" comment.
- **T3-F3:** MODELWEIGHT seeding CR must land + run before Task 9 (post-Task-2 seed file); capa-intake/records ESM tracked as a Task 8 deliverable.
Re-review extended Task 3, then Task 4 (IAM) carries the AOSS data-access grant + the Task 5/6 carries (agent handler roles read-only; store-token Lambda write scope).
