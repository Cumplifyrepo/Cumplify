# Spec 38 — build-verification-harness: Tasks

**Design approved:** 2026-07-02
**All tasks complete:** 2026-07-02
**Self-hosting constraint:** This spec builds the evidence gate. Task 1 creates
the gate script itself; its completion evidence is the gate executed on the
repo as it stands, retroactively covering task 1. Every later task closes
through the gate normally.

---

## D-rung rationale for this spec

Part 40's binding minimum says backend/infra tasks close at D3. However,
tasks 1.1, 1.2, 2.1, and 3.1 produce *build tooling scripts* — they are not
deployed resources and have no cloud state to read back. D1 (compiles & synths)
is the correct floor for scripts that exist only in the repo. The behavioral
proof comes from tasks 3.2 (D2 — tested by demonstrating the gate catches
failures) and 3.3 (D3 — a real deploy/readback cycle). This structure
satisfies the spirit of Part 40: the harness proves *itself* at D2/D3 via its
own deliberate-failure tests, while the tooling tasks that compose it close at
the highest rung they can mechanically satisfy (D1).

---

## Dependency Wave 1 — Foundation (sequential, self-hosting bootstrap)

### Task 1.1: Project tooling setup + evidence-gate script
**Traces to:** AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-1.5, NFR-1, NFR-2, §4 (log format), §9 (tech.md)
**D-rung:** D1 (compiles & synths — the script itself passes its own gate)
**Depends on:** nothing

**Deliverables:**
- [x] `package.json` at repo root with: TypeScript, Vitest, fast-check, eslint,
  prettier, tsx as devDependencies. `tsconfig.json` configured.
- [x] `scripts/verify.ts` implementing the ordered 6-step evidence gate per
  design §4 (log format, SKIPPED semantics, halt-on-first-failure, MAX-RUNG
  line). Accepts `--spec`, `--task`, `--module` arguments.
- [x] `npm run verify` script entry in package.json.
- [x] `.kiro/evidence/` directory exists (README already present).
- [x] Skip logic: step 5 skips gracefully when no CDK entrypoint in `infra/bin/`;
  step 6 skips when no module specified or no integration tests exist. Both
  emit SKIPPED (never PASS). npm ci is unconditional.
- [x] tech.md amendment: add dev/test tooling line (Vitest, fast-check, eslint,
  prettier, tsx, LocalStack with Docker prerequisite note).

**Completion evidence:** Run `npm run verify -- --spec build-verification-harness --task 1.1`
on the repo as it stands. The log shows steps 1–3 PASS (TypeScript compiles,
lint passes), step 4 PASS (no services/* code → no property-test check fires),
step 5 SKIPPED (no CDK app), step 6 SKIPPED (no module). MAX-RUNG: D1.
This retroactively proves task 1.1.

---

### Task 1.2: Property-based test scaffold
**Traces to:** AC-3.1, AC-3.2, AC-3.3, AC-3.4, §6 (mechanical check)
**D-rung:** D1
**Depends on:** 1.1

**Deliverables:**
- [x] `services/_scaffold/example.property.test.ts` — a reference property-based
  test using fast-check demonstrating: arbitrary generator, property assertion,
  vitest integration.
- [x] `services/_scaffold/` excluded from the §6 mechanical check in
  `scripts/verify.ts`.
- [x] The evidence-gate step 4 discovers `*.property.test.ts` files alongside
  unit tests and runs them via Vitest.
- [x] Mechanical existence check implemented: every `services/<name>/` (excluding
  `_scaffold`) with source .ts files must contain at least one
  `*.property.test.ts`, else step 4 FAILs with named error.

**Completion evidence:** `npm run verify -- --spec build-verification-harness --task 1.2`.
Step 4 passes (scaffold test runs and passes; no other services/ dirs to check).

---

## Dependency Wave 2 — Readback framework

### Task 2.1: Readback test framework + sample assertion
**Traces to:** AC-2.1, AC-2.3, AC-2.4, AC-2.5, AC-5.2, §7 (readback framework), NFR-4
**D-rung:** D1 (framework code compiles; no deployment to verify against yet)
**Depends on:** 1.1

**Deliverables:**
- [x] `infra/readback/` directory with Vitest config (serial execution, no
  watch mode, AOSS assertions carry 45s timeout).
- [x] `infra/readback/helpers.ts` — `assertResource(name, designed, observed)`
  utility that formats pass/fail output per AC-2.4 (resource ARN/name,
  designed value, actual observed value).
- [x] `infra/readback/sample-defect.test.ts` — the S3 ObjectLock assertion
  used for AC-5.2 (checks `ObjectLockConfiguration.Mode = COMPLIANCE`).
- [x] `infra/readback/sample-defect-stack.ts` — minimal CDK stack
  `Spec38SampleDefect` with one S3 bucket WITHOUT ObjectLockConfiguration,
  `RemovalPolicy.DESTROY`, no data.
- [x] `npm run readback` script entry in package.json.
- [x] Graceful handling when no resources deployed (AC-2.5): "no deployed
  resources to verify" message, exit 0.
- [x] @dev tag on all readback tests; 45-second timeout on AOSS assertions
  per 02-aoss-rule.md.

**Completion evidence:** `npm run verify -- --spec build-verification-harness --task 2.1`.
Framework compiles; readback invoked in isolation reports "no deployed resources"
gracefully (AC-2.5 proven).

---

## Dependency Wave 3 — Hook wiring + deliberate-failure proofs

### Task 3.1: Hook prompt updates
**Traces to:** AC-4.1, AC-4.2, AC-4.3, AC-4.4, §8 (hook prompts), F-9
**D-rung:** D1
**Depends on:** 1.1, 2.1

**Deliverables:**
- [x] `verify-evidence.json` prompt updated to reference
  `npm run verify -- --spec <name> --task <id> --module <module>` with
  --module omission rationale requirement.
- [x] `deploy-readback.json` prompt updated to reference `npm run readback`.
- [x] `dod-gate.json` prompt updated to check evidence log existence, all
  steps PASS (SKIPPED = not-green for D2+), readback appended for D3+.
- [x] Early-exit guards remain as first sentence in each prompt.

**Completion evidence:** `npm run verify -- --spec build-verification-harness --task 3.1`.
Hook JSON files are valid JSON, TypeScript compiles (no code changes beyond hooks),
lint passes.

---

### Task 3.2: AC-5.1 — Deliberate evidence-gate failure proof
**Traces to:** AC-5.1, AC-5.3
**D-rung:** D2 (tested — the test IS the proof)
**Depends on:** 1.1, 1.2

**Deliverables:**
- [x] A temporary TypeScript file with a deliberate type error placed in a
  test fixture directory.
- [x] Run `npm run verify` against it → step 2 (tsc --noEmit) FAILS.
- [x] Deliberate-failure evidence captured as
  `.kiro/evidence/build-verification-harness/3.2-deliberate-fail.log`
  (the artifact being proven — this log intentionally shows FAIL).
- [x] The broken file is removed after proof capture.
- [x] Task 3.2's own completion evidence is a normal PASS run on the
  cleaned-up repo (separate from the deliberate-failure artifact).

**Completion evidence:** `.kiro/evidence/build-verification-harness/3.2.log`
shows a normal PASS run on the clean repo. The deliberate-failure artifact
at `3.2-deliberate-fail.log` is committed alongside as the proof that the
gate catches type errors.

---

### Task 3.3: AC-5.2 — Deliberate readback failure proof (REQUIRES-HUMAN)
**Traces to:** AC-5.2, AC-5.2a, AC-5.3
**D-rung:** D3 (deployed & read back — the readback failure IS the D3 proof)
**Depends on:** 2.1
**REQUIRES-HUMAN**

**Deliverables:**
- [x] Human creates `cumplify-spec38-sample-defect` S3 bucket in dev account
  via AWS CLI (no ObjectLock, no CDK — aws-cdk-lib stays out of spec 38):
  `aws s3api create-bucket --bucket cumplify-spec38-sample-defect --profile cumplify-dev-deploy`
- [x] Human (or agent) runs `npm run readback` → `sample-defect.test.ts`
  assertion FAILS with output: `observed: undefined, designed: "COMPLIANCE"`.
- [x] Deliberate-failure evidence captured as
  `.kiro/evidence/build-verification-harness/3.3-deliberate-fail.log`
  (the artifact being proven — this log intentionally shows readback FAIL).
- [x] Human tears down the bucket:
  `aws s3api delete-bucket --bucket cumplify-spec38-sample-defect --profile cumplify-dev-deploy`
- [x] Task 3.3's own completion evidence is a normal readback PASS (or
  SKIPPED in pre-deploy mode) on the cleaned-up account.

**Completion evidence:** `.kiro/evidence/build-verification-harness/3.3.log`
shows a normal run (SKIPPED in pre-deploy mode after teardown). The
deliberate-failure artifact at `3.3-deliberate-fail.log` is committed alongside
as the proof that readback catches mis-deployed resources.

**Note:** The commented CDK stack file (`sample-defect-stack.ts`) is retained as
documentation of the intended defect pattern for when aws-cdk-lib arrives with
spec 1. It is not used for this task's proof.

---

## Sequencing Summary

```
Wave 1 (self-hosting bootstrap):
  1.1 → 1.2  (1.1 must complete first — it IS the gate)

Wave 2 (readback, parallel with 1.2):
  2.1

Wave 3 (wiring + proofs, after waves 1+2):
  3.1, 3.2 (parallel)
  3.3 (REQUIRES-HUMAN, after 2.1)

Gate: AC-5.3 — after 3.2 AND 3.3 pass, other specs may close tasks.
```

---

## Post-completion standing rule

After all tasks complete: **no task from any other spec (including spec 1
platform-foundation) may be marked complete until AC-5.1 (task 3.2) and
AC-5.2 (task 3.3) evidence logs exist proving the harness catches failures.**
This is the Part 42.4 invariant.

---

## Completion Notes

### Residual refinements (non-blocking, carry forward)

1. **Mode probe counts CDKToolkit as a deployed stack.** The pre-existing
   CDK bootstrap stack (`CDKToolkit`) in the dev account means the mode probe
   reports "post-deploy mode" even before any application stacks exist. Future
   refinement: exclude stacks matching `CDKToolkit*` from the count so
   "pre-deploy mode" means "no application stacks." Spec 1's readback
   assertions should assume post-deploy mode (CDKToolkit exists) and use the
   ABSENT=FAIL pattern for expected-but-missing application resources.

2. **Spec 1 open question: CDK bootstrap cross-account trust.** The existing
   CDKToolkit stack in dev likely predates the cross-account pipeline
   requirement (`--trust MGMT_ACCOUNT`). Spec 1's design must verify and
   re-bootstrap if needed. Added to spec 1's open questions.

### AC-5.3 satisfaction

Both deliberate-failure proofs are demonstrated:
- AC-5.1: `3.2-deliberate-fail.log` — TypeScript type error caught at step 2.
- AC-5.2: `3.3-deliberate-fail.log` — S3 bucket without ObjectLock caught by
  readback (observed: undefined, designed: "COMPLIANCE").

**Spec 1 platform-foundation is now unblocked for task closure.**
