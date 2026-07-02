# Spec 38 — build-verification-harness

**Source:** Consolidated Parts 39, 40, 42
**Phase:** P0 (lands with spec 1 — the harness exists before the first real task closes)
**Out of scope:** Any product code; the live-testing plane (spec 39: AppConfig flags, CodeDeploy canaries, Synthetics, tenant-zero).

---

## 1. Scope

The build-verification harness is the infrastructure that makes "done" provable.
It provides:
- The evidence-gate script (ordered Layer-2 command chain)
- The `.kiro/evidence/` output conventions
- The `infra/readback/` test framework and its first assertion set
- Property-based test scaffolding for `services/*`
- Wiring the `verify-evidence`, `deploy-readback`, and `dod-gate` hooks to
  these executable scripts

---

## 2. User Stories & Acceptance Criteria (EARS format)

### US-1: Evidence-gate script (Part 39 Layer 2)

**As** the build agent,
**I want** a single executable script that runs the Layer-2 gate in strict order,
**so that** every task has machine-verified proof of completion.

**Acceptance criteria:**

- AC-1.1: WHERE the verify-evidence hook fires, THEN the script executes
  the following steps in order, halting at first failure:
  1. `npm ci`
  2. `tsc --noEmit`
  3. `eslint + prettier check`
  4. Unit + property-based tests
  5. `cdk synth --all` + CDK Nag (warnings = failures)
  6. Targeted integration tests for the touched module (LocalStack where
     applicable; real dev account for IAM/KMS/AOSS semantics that
     emulators cannot faithfully reproduce)

- AC-1.2: WHERE any step fails, THEN the script writes the verbatim failure
  output to `.kiro/evidence/<spec>/<task>.log`, reports the failure, and the
  task remains NOT complete.

- AC-1.3: WHERE all steps pass, THEN the script writes the full stdout/stderr
  to `.kiro/evidence/<spec>/<task>.log` with timestamps per step.

- AC-1.4: WHERE a task is claimed complete, THEN the evidence log MUST exist
  at the expected path and show all steps green. A task without an evidence
  log is not done — definitionally (19-kiro-truth.md rule 2).

- AC-1.5: WHERE the script is invoked on a module that has no integration
  tests yet, THEN steps 1–5 still execute and the log notes "no integration
  tests defined for module X" without failing.

### US-2: Readback test framework (Part 39 Layer 3)

**As** a deploying engineer,
**I want** executable readback tests that assert deployed reality matches
designed intent,
**so that** infrastructure hallucinations are caught at the cloud, not the
transcript.

**Acceptance criteria:**

- AC-2.1: WHEN a readback test suite is executed against the dev account via
  the aws-api MCP (cumplify-dev-readonly profile), THEN each assertion reports
  pass/fail with the observed value next to the designed value.

- AC-2.2: The first assertion set (minimum, from Part 39 Layer-3 table) SHALL
  include:
  - `CumplifyCore` table: SSE type = CMK with expected key ARN; 9 GSIs
    present; PITR enabled.
  - Every Lambda on an AOSS path: Timeout >= 60.
  - AUDITLOG writer role policy: contains NO `dynamodb:UpdateItem` /
    `DeleteItem`.
  - S3 evidence bucket: `ObjectLockConfiguration.Mode = COMPLIANCE`,
    retention set.
  - SQS queues: every one has a DLQ; FIFO where mandated.
  - Zero NAT gateways; expected VPC endpoints exist.

- AC-2.3: Readback tests SHALL live at `infra/readback/*.test.ts` and be
  runnable via `npm run readback` (or equivalent script entry).

- AC-2.4: WHERE a readback assertion fails, THEN the output states the
  resource ARN/name, the designed value, and the actual observed value.

- AC-2.5: WHERE a readback is run before any infrastructure is deployed, THEN
  the framework reports "no deployed resources to verify" gracefully without
  crashing.

### US-3: Property-based test scaffolding (Part 39 Layer 2, step 3)

**As** a service developer,
**I want** a ready-to-use property-based test scaffold for `services/*`,
**so that** property tests are the path of least resistance and are mandatory
per 13-testing.md.

**Acceptance criteria:**

- AC-3.1: A `fast-check` (or equivalent) dependency SHALL be installed and
  configured in the project.

- AC-3.2: A scaffold/template file SHALL exist at a conventional location
  demonstrating the pattern for a property-based test against a service
  function (e.g., an arbitrary input generator + property assertion).

- AC-3.3: The evidence-gate script (US-1) SHALL discover and execute
  property-based tests alongside unit tests in step 4.

- AC-3.4: WHERE `services/*` code is written without a paired property-based
  test, THEN the test-sync hook flags it as incomplete per 13-testing.md.

### US-4: Hook-to-script wiring

**As** the build agent,
**I want** the verify-evidence, deploy-readback, and dod-gate hooks to invoke
real executable scripts (not just prompt-only behavior),
**so that** evidence generation is deterministic and reproducible.

**Acceptance criteria:**

- AC-4.1: The `verify-evidence` hook's prompt SHALL instruct the agent to
  execute the evidence-gate script (US-1) and write output to the log path.

- AC-4.2: The `deploy-readback` hook's prompt SHALL instruct the agent to
  execute `npm run readback` (or the readback script entry point) and report
  the assertion table.

- AC-4.3: The `dod-gate` hook SHALL verify that the evidence log exists at
  `.kiro/evidence/<spec>/<task>.log` and satisfies the exit evidence per
  Part 40's D-rung table (normative):
  - D1 (Compiles & synths): L2 steps 1–5 logs green (npm ci, tsc, lint,
    tests, cdk synth + Nag).
  - D2 (Tested): D1 + unit + property + module integration logs green;
    coverage didn't drop.
  - D3 (Deployed & read back): D2 + deployed to dev via pipeline +
    readback assertion table green against the live account.
  - D4 (Behaves): D3 + golden-path suites green in staging; DLQs empty
    after run; no new CloudWatch errors.
  - D5 (Human-user ready): D4 + human UAT script passed.
  - D6 (Live-proven): D5 + canary survived + synthetics green 24h.

- AC-4.4: WHERE the dod-gate hook runs on a task that is not `close:*` or a
  phase-gate task, THEN it replies "not a gate task — skipped" and stops.

### US-5: Deliberate-failure acceptance test (Part 42.4 — the harness proves itself)

**As** the project owner,
**I want** proof that the harness catches failures,
**so that** I can trust it before any real task closes against it.

**Acceptance criteria:**

- AC-5.1: A deliberately broken sample task (e.g., a TypeScript file with a
  type error) SHALL fail the evidence gate with verbatim output showing the
  failure in the log.

- AC-5.2: A deliberately mis-deployed sample resource (e.g., an S3 bucket
  missing Object Lock) SHALL fail readback with observed-vs-designed values
  shown in the assertion output.

- AC-5.2a: The deliberate mis-deployment requires deploy credentials that
  exceed the cumplify-dev-readonly profile. This step is REQUIRES-HUMAN:
  a human deploys a throwaway CDK stack (with the intentional defect) via
  their own credentials, runs the readback, confirms the failure output,
  then tears down the stack. The evidence is the readback log showing the
  observed-vs-designed mismatch. Sequence: human deploys → readback runs →
  failure captured → human tears down → evidence committed.

- AC-5.3: UNTIL AC-5.1 and AC-5.2 are demonstrated green (the harness
  catches both failure types), no task from any other spec (including spec 1
  platform-foundation) may be marked complete.

---

## 3. Non-functional requirements

- NFR-1: The evidence-gate script SHALL complete in under 5 minutes for an
  empty project (no services code yet) — it must not block bootstrap.
- NFR-2: All scripts SHALL be TypeScript (matching the CDK/services language).
- NFR-3: No AWS service outside the verified stack (tech.md) is introduced.
- NFR-4: Every AOSS-touching path in the readback tests restates the
  45-second rule (02-aoss-rule.md).

---

## 4. Open Questions

- OQ-1: **Resolved.** The evidence-gate script lives at `scripts/verify.ts`,
  exposed as `npm run verify`. Hooks instruct the agent to call the npm entry.

- OQ-2: **Resolved.** Test tooling = Vitest + fast-check. Readback suites
  run serially (no watch mode); AOSS-touching assertions carry the 45-second
  budget. A "Dev/test tooling" line will be added to tech.md in design phase
  per 14-simplicity.md (covering vitest, fast-check, eslint, prettier, tsx).

- OQ-3: **Resolved.** Assertion set grows per-spec per Part 39's own rule:
  each spec's design.md §7 owns its readback assertions. No placeholders
  for not-yet-deployed resources.
