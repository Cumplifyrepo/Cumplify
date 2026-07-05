# Phase-0 Gate — Tasks

**Spec:** `phase-0-gate`
**Design approved:** R1
**Closure rules:** 7 (checkbox edits only), 8 (timestamp + exit code + blob SHA)

---

## Task 1: Prepare (agent)

**D-Rung:** — (preparation, no cloud writes)

### Deliverables
- [x] `.kiro/evidence/phase-0-gate/task-universe.md` — numbered list of ALL completed P0 tasks across 4 specs
- [x] Report skeleton committed at `docs/gates/phase-0-gate-report.md` (empty sections, metadata populated)
- [x] `docs/gates/cost-estimates.md` skeleton committed
- [x] Command scripts from design §2 prepared as executable shell snippets in `.kiro/evidence/phase-0-gate/gate-scripts.sh`
- [x] GATE-7 selection: derive 3 task indices from the Task 1 commit hash, document derivation, record which tasks are selected

### Acceptance
- Task-universe enumeration committed and verifiable
- GATE-7 derivation formula documented with intermediate values
- All skeletons syntactically valid markdown

---

## Task 2: Architect-Witnessed Execution

**D-Rung:** — (evidence gathering, architect runs commands)

> **This task is architect-executed.** The agent prepares; the architect
> runs all cloud-touching commands and captures output.

### Deliverables
- [ ] GATE-1: `cdk diff` on all 7 stacks (6 dev + 1 pipeline) — logs captured
- [ ] GATE-2: `cdk synth --all` + NagReport extraction — 0 Non-Compliant confirmed
- [ ] GATE-3: Tenant-scoped principal enumeration + simulation matrix (or N/A leg-a with P1 carry)
- [ ] GATE-3b: AUDITLOG Deny re-run — 5 actions explicitDeny
- [ ] GATE-6: Cost Explorer data for dev + mgmt accounts
- [ ] GATE-7: 3 selected tasks re-executed + 1 falsification each — results captured
- [ ] All evidence logs committed to `.kiro/evidence/phase-0-gate/`

### Acceptance
- All cloud-touching logs committed with timestamps
- GATE-7 falsification results documented (pass or fail, honestly)
- Cost data is from live `get-cost-and-usage` output

---

## Task 3: Report Assembly + Closure

**D-Rung:** — (documentation, no cloud writes)

### Deliverables
- [ ] `docs/gates/phase-0-gate-report.md` fully populated: per-spec summary, GATE-1..8 results, N/A justifications, findings table, conclusion
- [ ] `docs/gates/cost-estimates.md` populated with real Cost Explorer data
- [ ] All evidence logs in `.kiro/evidence/phase-0-gate/` with proper naming
- [ ] Gate verdict: PASS (all green/N/A) or FAIL (CRITICAL findings block P1)
- [ ] Timestamp + cdk-outputs.json blob SHA in report header

### Acceptance
- ACC-1..ACC-5 from requirements all satisfied
- Report carries gate-execution timestamp + commit hash + blob SHA
- No fabricated evidence (truth rule enforcement)

---

## Dependency Graph

```
Task 1 (Prepare — agent)
  ↓
Task 2 (Architect-Witnessed Execution)
  ↓
Task 3 (Report + Closure)
```
