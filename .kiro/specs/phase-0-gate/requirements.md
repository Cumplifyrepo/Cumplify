# Phase-0 Gate — Requirements (EARS Format)

**Spec:** `phase-0-gate`
**Spine references:** Part 11.3 (phased delivery), Part 26.6 (phase-gate prompt)
**Source documents:**
- `kiro-kickoff-pack.md` — Stage 5.5 (phase-gate), §4.6 (checklist)
- `.kiro/steering/19-kiro-truth.md` — truth discipline (rules 7-8)
- `.kiro/steering/04-immutability.md` — three-layer enforcement build rule
- `.kiro/steering/02-aoss-rule.md` — 45-second budget
- `docs/architecture/cumplify-CONSOLIDATED-master-architecture-v7-full.md` — Part 27 (cost tripwires)

**P0 composition (4 specs, 6 deployed dev stacks):**
- `build-verification-harness` — closing commit `ac961bb`
- `platform-foundation` — closing commit `7b80078` (stacks: Network, Security, Data, Identity)
- `eventing-backbone` — closing commit `bdd389b` (stack: Eventing)
- `immutable-trail` — closing commit `24de927` (stack: AuditTrail)

**Max D-rung achieved:** D3 (deployed to dev + readback green) per spec.
**Revision:** R1.1 — AMEND-1..4 applied (approved)

---

## 1. Constraints

| ID | Constraint |
|----|-----------|
| C-1 | This is a GATE spec, not a build spec. It produces a report (`docs/gates/phase-0-gate-report.md`) + ancillary evidence, not application code. No new infrastructure is deployed. |
| C-2 | Truth rules 7-8 apply: every evidence citation is an executed command; every checkbox ticked has its evidence log; every readback table carries timestamp + exit code + cdk-outputs.json blob SHA. |
| C-3 | Honesty discipline (19-kiro-truth): where a checklist item has no P0 subject, mark it N/A WITH THE REASON. Never fabricate evidence for a control that has nothing to exercise. |
| C-4 | The phase-gate checklist (kickoff-pack §4.6) is written for phases that ship USER-FACING features. P0 shipped only infrastructure — D3-infra is the ceiling. Adjust expectations accordingly. |
| C-5 | Cloud-touching verification (drift, nag, cross-tenant sim, readback re-runs, falsification, cost data) is architect-witnessed. The agent prepares scripts and report structure; the architect executes and captures. |
| C-6 | The gate report is the SINGLE deliverable. It either passes (all GATE items green or justified N/A) or fails (CRITICAL findings block P1 entry). |

---

## 2. Gate Items

### GATE-1: Drift-Free (Template E)

| ID | Requirement (EARS) |
|----|-------------------|
| G1-1 | **For each of the 4 P0 specs,** the gate report shall prove: deployed-cloud == `cdk synth` == committed source. Enumerated per spec, per stack. |
| G1-2 | **Any drift** detected between deployed state and synthesized template **shall** be reported as a CRITICAL blocking finding with the specific resource and property that diverged. |
| G1-3 | **The known-benign exception** (Dev-DataStack Aurora rotation SAR `TemplateURL` re-presigns every synth — zero resource change) **shall** be pre-classified as non-blocking with its documentation reference (spec 1 closure). |
| G1-4 | **Evidence method:** `cdk diff` against each deployed stack; output captured verbatim. Zero-diff (or only the SAR pre-sign) = PASS. |
| G1-5 | **[AMEND-4] The drift check shall** also cover the management-account P0 footprint — CumplifyPipeline stack (including MgmtCostMonitor). Its `cdk diff` output is included in the evidence. |

### GATE-2: CDK Nag Clean

| ID | Requirement (EARS) |
|----|-------------------|
| G2-1 | **The gate report shall** prove 0 Non-Compliant findings across all 6 deployed dev stacks AND the management-account CumplifyPipeline stack by presenting the NagReport.csv set from a fresh `cdk synth`. |
| G2-2 | **Every NagSuppression** applied across P0 **shall** be listed in the report with its construct path, suppressed rule ID, and the written justification from the source code. |
| G2-3 | **Evidence method:** `cdk synth` with `AwsSolutionsChecks` Aspect (already applied at stage level in `cumplify-stage.ts`); capture the generated NagReport CSV files from `cdk.out/assembly-*/`. |

### GATE-3: Cross-Tenant Denial Suite

| ID | Requirement (EARS) |
|----|-------------------|
| G3-0 | **[AMEND-2] Before running the denial matrix,** the gate SHALL enumerate the deployed IAM roles/policies in dev that carry `dynamodb:LeadingKeys` / `aws:PrincipalTag/tenantId` scoping (from synthesized templates + live IAM). IF such a tenant-scoped runtime principal exists, run G3-4 against it (simulation must supply BOTH `LeadingKeys` AND `aws:PrincipalTag/tenantId` context entries). IF NONE exists, leg (a) is N/A with reason "tenant-scoped runtime data role arrives with api-core, P1" and becomes a P1 carry — leg (b), the AUDITLOG Deny (spec 5 test 9), stands regardless. |
| G3-1 | **The gate report shall** prove tenant isolation at the IAM data layer: a tenant-A-scoped principal CANNOT reach tenant-B items in CumplifyCore. |
| G3-2 | **The proof shall** use `aws iam simulate-principal-policy` against: (a) any deployed tenant-scoped principal (if one exists per G3-0), AND (b) the immutable-trail AUDITLOG Deny (already proven in spec 5 readback test 9 — cite that evidence). |
| G3-3 | **Green =** every cross-tenant action returns `implicitDeny` or `explicitDeny`; every same-tenant action returns `allowed`. |
| G3-4 | **The test matrix shall** cover at minimum: (a) `GetItem` with cross-tenant key → denied, (b) `GetItem` with same-tenant key → allowed, (c) `PutItem` on AUDITLOG partition cross-tenant → denied, (d) `UpdateItem` on AUDITLOG partition same-tenant → explicitDeny (the 5-action Deny applies even to same-tenant). |
| G3-5 | **Evidence method:** `simulate-principal-policy` CLI output captured verbatim. Role ARN and table ARN from cdk-outputs.json. |

### GATE-4: Sealed-Audit Pattern

| ID | Requirement (EARS) |
|----|-------------------|
| G4-1 | **The gate report shall** confirm the mutation→sealed-audit enforcement path exists and works end-to-end by citing spec 5 (immutable-trail) readback evidence: ACC-1 (tamper detected by tripwire + verifier), ACC-3 (bus→queue→appender→chained DDB→S3 Object Lock COMPLIANCE). |
| G4-2 | **An N/A note shall** state: P0 has NO domain mutation paths yet — those arrive in P1 and each must register its audit event per `04-immutability.md` build rule. The gate confirms the ENFORCEMENT PATH exists, not that domain events flow. |
| G4-3 | **Evidence method:** citation of spec 5 readback evidence logs (commit hash + evidence file path). |

### GATE-5: AOSS 45-Second Budget

| ID | Requirement (EARS) |
|----|-------------------|
| G5-1 | **The gate report shall** confirm steering `02-aoss-rule.md` is in force (loaded by the build system, cited in spec 5 requirements). |
| G5-2 | **An N/A note shall** state: the runtime AOSS-query cold-start test is NOT yet exercisable — the audit-trail retrieval Lambda was deferred to spec 4 (immutable-trail Appendix A), so no AOSS query path is deployed. |
| G5-3 | **The report shall NOT** claim a staging AOSS test — staging is not deployed (owner cost gate). |
| G5-4 | **This item shall** be recorded as a P1 carry: spec 4 (knowledge-base) must prove the 45s budget on its first AOSS query path. |

### GATE-6: Cost Review

| ID | Requirement (EARS) |
|----|-------------------|
| G6-1 | **The gate shall** produce `docs/gates/cost-estimates.md` (it does not exist yet) documenting the real P0 cost posture from executed Cost Explorer data. |
| G6-2 | **The cost report shall** include: (a) dev deployed run-rate (total + per-service breakdown), (b) dominant dev cost levers (AOSS/VPC-endpoints/KMS), (c) mgmt governance + guardrail spend (MgmtCostMonitor stack), (d) comparison against Part 27 tripwires. |
| G6-3 | **If any Part 27 tripwire is breached,** it shall be flagged as a finding. The prod ~$250/mo tripwire is already owner-approved — cite the approval, do not re-raise as a finding. |
| G6-4 | **Evidence method:** `aws ce get-cost-and-usage` output for the dev account billing period covering P0 deployment. |

### GATE-7: Hallucination Audit (Template H)

| ID | Requirement (EARS) |
|----|-------------------|
| G7-1 | **[AMEND-3] The gate shall** select 3 tasks via verifiable deterministic derivation: (a) enumerate ALL completed P0 tasks as a numbered list, committed as `.kiro/evidence/phase-0-gate/task-universe.md`; (b) derive the 3 indices from `sha256(gate-execution-commit-hash) mod N`, iterated (skipping same-spec duplicates until 2+ specs covered), so the selection is verifiable by anyone and controllable by no one. Document the derivation formula and intermediate values in the report. |
| G7-2 | **For each selected task,** the audit shall: (a) rerun its evidence gate from scratch, (b) re-execute its readback assertions against live dev, (c) attempt ONE falsification (break the thing the test protects; confirm the test catches it). |
| G7-3 | **A failed audit** (evidence does not reproduce, or falsification is not caught) **shall** be reported as a CRITICAL finding on our own process. |
| G7-4 | **Context the report must state:** P0 already suffered TWO fabrication incidents (spec 1 task 2.1 fabricated readback; spec 5 task 6 fabricated cdk-outputs identifiers). This audit is the check that they are the only two. |
| G7-5 | **The cloud-touching re-execution is architect-run.** The agent prepares the audit plan (which 3 tasks, which falsification for each); the architect executes and captures evidence. |
| G7-6 | **Honest reporting:** if a test fails to catch a falsification, that is reported as-is — never weakened or hidden. |

### GATE-8: D6 User-Facing Readiness (Template I)

| ID | Requirement (EARS) |
|----|-------------------|
| G8-1 | **This item is N/A at P0.** The gate report shall state: zero user-facing specs exist in P0 — all four specs are backend infrastructure (D3-infra ceiling). |
| G8-2 | **The report shall NOT** fabricate AppConfig-flag, Synthetics-journey, or canary evidence. |
| G8-3 | **The report shall** state: D6 first applies at the P2 gate per the v6 amendment (Part 11.3 phased delivery). |

---

## 3. Deliverables

| ID | Requirement (EARS) |
|----|-------------------|
| DEL-1 | **The gate shall** produce `docs/gates/phase-0-gate-report.md` containing: (a) per-spec summary (name, max D-rung, closing commit, evidence citation), (b) GATE-1..8 results, (c) every N/A justified, (d) every CRITICAL finding surfaced. |
| DEL-2 | **The gate shall** produce `docs/gates/cost-estimates.md` (GATE-6 output). |
| DEL-3 | **Evidence logs** from architect-witnessed cloud-touching verification shall be committed to `.kiro/evidence/phase-0-gate/`. |
| DEL-4 | **The gate report shall** carry: timestamp of gate execution, git commit hash at time of gate, cdk-outputs.json blob SHA. |

---

## 4. Acceptance Criteria

| # | Criterion |
|---|-----------|
| ACC-1 | Gate report exists at `docs/gates/phase-0-gate-report.md`, committed to repo. |
| ACC-2 | All GATE items are GREEN or justified N/A — no unresolved CRITICAL findings remain (or P1 entry is blocked until resolved). |
| ACC-3 | `cost-estimates.md` committed with real Cost Explorer data. |
| ACC-4 | Evidence directory `.kiro/evidence/phase-0-gate/` committed with architect-witnessed logs. |
| ACC-5 | Hallucination audit (GATE-7) selects 3 tasks, re-executes, and reports honestly — pass or fail. |

---

## 5. Out of Scope

| Item | Reason |
|------|--------|
| Staging/prod drift checks | Staging not deployed (owner cost gate). Prod not deployed until P2. |
| Runtime AOSS cold-start test | No AOSS query path deployed in P0 (spec 4, P1). |
| D6 user-facing readiness | Zero user-facing specs in P0. |
| Fixing findings | This spec REPORTS findings. Remediation is a separate work item that blocks P1 entry. |
| New infrastructure deployment | Gate specs do not deploy — they verify. |
