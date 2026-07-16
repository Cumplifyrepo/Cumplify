# Spec-35 Phase 0/1 build wave — architect validation (2026-07-16)

**Verdict: ALL FOUR TASK CLOSURES + FOLD-INS CONFIRMED.** Every claim in
Kiro's wave report was independently re-executed or read from the diffs —
nothing taken from the report itself. One omission found and fixed in this
commit (M-4c probe line missing from Task 7 text — architect lane, added
directly). Build may proceed; Task 7 deploy remains gated on Task 5 owner
sign-off (EMB-6: no deploy before the IAM gate clears).

Validated at HEAD cda8c7b; validation commit adds this file + the Task 7
M-4c line.

## Re-executed verification (architect, 2026-07-16, ~18:40–19:15 UTC)

| Claim | Command | Result |
|---|---|---|
| Test suite green | `npx vitest run` (root: services/ + infra/) | **86 files passed, 1 skipped; 917 tests passed, 3 skipped; 0 failures; exit 0.** (Kiro's "79 files" = services/-only count; task-1.log's 76 + 3 new test files = consistent) |
| tsc clean | `npx tsc --noEmit` | exit 0 |
| CDK synth green | `npx cdk synth --quiet` | exit 0 |
| F-1 binding REAL in artifact | Parsed cdk.out templates for `AiInvokerFn` | `Handler: index.handler` in Dev, Staging AND Prod stage templates (not just source) |
| Titan Embed v2 price | LIVE `aws pricing get-products` (readonly profile), full pagination, filtered TitanEmbeddingsV2 | **$0.00002/1K on-demand input = $0.02/M → wIn=20 CORRECT** at the 1000-credits-per-dollar scale (Nova Pro $0.80/M→800, GLM-5 $1.00/M→1000 corroborate the scale). Batch SKU $0.00001/1K — not our path |
| Hermetic lane | grep vi.mock in all 3 new test files | bedrock-runtime, dynamodb, eventbridge, client-lambda ALL mocked; dispatch.test mocks embed/register-resolver/converse/metering — zero live clients |
| Rule 7 per commit | `git show --stat` ×5 | Every task commit carries task-N.log + tasks.md tick in the SAME commit; logs carry timestamps + exit codes |
| Checkbox state | grep tasks.md | Tasks 1–4 `[x]`, Tasks 5+ `[ ]` |

## Per-commit content validation

- **a39a717 (F-1/F-2):** §2.2 rewritten with the binding note + handler code;
  `invoke()` stays exported; §9.3 inlines all four payload interfaces —
  field-checked against requirements TEL-1..4: match (GuardrailChecked adds
  the two AR policy names to the guardrailPolicy union — correct for the D3
  five-guardrail topology). Task 3 text updated. **Gap: the ordered Task 7
  M-4c embed-op probe line was NOT added — fixed in this commit** (architect
  edit; Task 7 is architect lane, probe was always going to execute).
- **349ce00 (Task 1):** 4 Ai.* rows in contracts/events.md (new spec-35
  section) + 4 registry entries, all `false`, entityId-'' rationale in
  comment. Parity test re-run green as part of the full suite.
- **b6f2c39 (Task 2):** seed JSON entry `{wIn:20, wOut:0, wCache:null}` +
  provenance appended to `source` string; computeCredits unit test math
  verified by hand (500×20/1M = 0.01 ✓). Price live-confirmed (table above).
- **843259d (Task 3):** embed.ts faithful to design §2.1/§2.2 — one-door
  metering path (credit-precheck → InvokeModel → inputTextTokenCount →
  loadWeights → computeCredits → incrementMeter → emitCreditsTelemetry),
  dimensions:1024, EMB-5 honored (no AOSS retry), singleton client with
  test reset. index.ts: `handler()` dispatch exactly per §2.2; embed
  FUNCTION not re-exported (only its types) — EMB-2 honored.
  ai-stack.ts one-line binding flip. `emitCreditsTelemetry.seat` is
  `string` — `'embed'` pseudo-seat legal.
- **cda8c7b (Task 4):** createEmbedFn mirrors createInvokeFn (same ARN,
  same error handling, empty-payload guard); module doc extended to ban
  embed() import; EmbedFn type exported.

## Notes for the record

- **Kiro tasks.md linter:** the IDE now reports schema errors on tasks.md
  (missing `# Implementation Plan:` heading, `## Task Dependency Graph`).
  The structure predates the linter schema and Kiro executed Tasks 1–4
  against it without issue — flagged as cosmetic, owner may order
  conformance later; not worth mid-build churn.
- **Task 5 sign-off package (owner):** the invoker role's existing statement
  (ai-stack.ts:157–164) is `Allow bedrock:InvokeModel + bedrock:ApplyGuardrail
  on Resource:'*'` — Titan Embed v2 rides `bedrock:InvokeModel`, so it is
  covered with NO new statement. Model access proven by live micro-invoke
  2026-07-16 (1024 dims + inputTextTokenCount). Sign-off = confirming this;
  zero code change. EMB-6 gates the Task 7 deploy on it.
- **Sequencing while Task 5 pends:** Tasks 6, 8–19 are code-only (synth/test
  evidence) — Kiro's lane proceeds. Task 7 (architect deploy + M-4a/b/c
  probes) waits for Task 5.
