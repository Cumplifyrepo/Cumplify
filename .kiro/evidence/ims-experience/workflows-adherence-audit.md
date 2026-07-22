# WORKFLOWS ADHERENCE AUDIT — ISO shall-workflows × approval gates (2026-07-21)

> Owner-ordered. Method: enumerate every PROCEDURAL shall-workflow (mandated
> sequence and/or authorization point) across 9001/14001/45001 harmonized
> structure; check each against architecture.md (§3 laws, §4 matrix, §7, §8
> incl. CAPA machine, §11 phases) + specs. Verdicts: IN-PLACE (staged flow +
> gates designed), PARTIAL (flow present, a mandated gate/stage unnamed),
> GAP-NEW (found by THIS audit), ROADMAP (known, §13-flagged).

## Scorecard

| # | Shall-workflow (clause) | Verdict | Where / what's missing |
|---|---|---|---|
| 1 | Documented-info control: draft→review→APPROVE→distribute→periodic review→revise(re-approve)→obsolete (7.5.2/3) | IN-PLACE | §7 lifecycle + §8 matrix + DocStudio + Collaboration Law |
| 2 | Records control: identify→store→protect→retain→disposition (7.5.3, DC-7) | IN-PLACE | §7; disposition via agent task → approval queue; legal hold P5 |
| 3 | NC + corrective action, 8 stages + concession authority (10.2 + 8.7) | IN-PLACE | §8 CAPA machine (this session) |
| 4 | Internal audit: programme→plan/criteria/scope→independent auditor→conduct→report→CA→records (9.2) | **PARTIAL** | Audit Studio + LeadAuditor chain ✔; **WF-1: no audit-PLAN approval gate before conduct** (plan/scope/criteria approved by QM, auditee notified) |
| 5 | Management review: mandated 9.3.2 inputs → outputs (9.3.3) | **PARTIAL** | Pack assembly ✔; **WF-4: outputs→TRACKED ACTIONS loop missing** (decisions must become owned, followed-up actions feeding CAPA/objectives) |
| 6 | Release of products/services: release blocked until arrangements complete UNLESS authorized; traceability to authorizer (8.6) | **GAP-NEW** | **WF-2: release-authorization workflow absent** — new approval-matrix artifact type + record w/ authorizer identity (forms + matrix pattern) |
| 7 | Change control: planned changes (6.3) + production change authorization recorded (8.5.6) | **PARTIAL** | createChangePlan BUILT (m5); **WF-3: authorization gate not wired through matrix; authorizer identity on record** |
| 8 | Risk & opportunity: determine→plan→integrate→evaluate effectiveness (6.1) | IN-PLACE | M5 + RiskSentinel retrofit (RS-7/8) + effectiveness via review pack |
| 9 | Objectives + planning + tracking (6.2) | IN-PLACE (design) | ObjectiveTracker A-CAT; /analytics + 9.3 pack P4 |
| 10 | Competence: determine→train→EVALUATE EFFECTIVENESS→evidence (7.2) | ROADMAP | Known (§13.4, CompetenceKeeper/DC-4) |
| 11 | Supplier control: evaluate→approve (AVL)→monitor→re-evaluate (8.4) | ROADMAP | Known (§13, SupplierScout spec) |
| 12 | Design & development w/ review/verification/validation gates (8.3) | **GAP-NEW** | **WF-7: no module** — applicability-dependent (exclusion-handled by QMS gen); needs roadmap spec for tenants that include 8.3 |
| 13 | Customer feedback/complaints→NC; satisfaction monitoring (8.2.1/9.1.2-9001) | PARTIAL | **WF-8**: complaints→NC intake path exists but unnamed in specs; satisfaction → /analytics v2 |
| 14 | Aspects & impacts: identify→significance→register→update on change (Δ14001 6.1.2) | PARTIAL | AspectWarden→RiskSentinel chain ✔; aspects need a named register presentation (M5 category or view) |
| 15 | Compliance obligations register + periodic evaluation (Δ 6.1.3/9.1.2) | ROADMAP | Known (§13.4, LegalLedger) |
| 16 | Emergency preparedness: procedures→periodic DRILLS→post-test review/revise (Δ 8.2) | **PARTIAL** | Forms lane ✔; **WF-5: drill scheduling + post-drill review workflow unstaged** (audit-calendar pattern reuse) |
| 17 | Worker consultation & participation w/ evidence (Δ45001 5.4) | **PARTIAL** | Seats/roles ✔, incident participation ✔; **WF-6: consultation-event RECORDS workflow undefined** (forms template + register) |
| 18 | Hazard ID → risk assessment → hierarchy of controls (Δ45001 6.1.2/8.1.2) | IN-PLACE | HazardScout→RiskSentinel→CAPA stage-4 |
| 19 | Incident reporting→investigation→CA (Δ45001 10.2) | IN-PLACE | CAPA machine w/ 45001 lens (stage 1 worker participation) |
| 20 | Contractor control (Δ45001 8.1.4) | PARTIAL | contractor role exists; folds into WF supplier roadmap |

## Approval-gate inventory (mandated authorization points → matrix artifact types)
Doc approve/re-approve ✔ · form-record SoD ✔ (spec-41 BUILT) · CAPA stage
gates ✔ · concession ✔ · disposition ✔ · risk assessment ✔ (RS-8) · review
pack ✔ (P4) · **audit plan (WF-1) ADD** · **release authorization (WF-2)
ADD** · **change authorization (WF-3) ADD** · review-output actions (WF-4)
ADD · drill review (WF-5) ADD · supplier approval (roadmap) · training
effectiveness (roadmap).

## Disposition
- WF-1..WF-6, WF-8 + aspects presentation: fold into specs — WF-1 into
  Audit Studio P3 (plan-approval stage in the machine); WF-3 wire existing
  createChangePlan through matrix (RS-6 artifact type, cheap); WF-2/5/6/8 =
  forms-engine templates + matrix artifact types (fits spec-41 pattern, P3/P4
  tasks); WF-4 into /management-review P4 (outputs→actions with owners/dues,
  agent-nagged, feeding CAPA/objectives).
- WF-7 (8.3 design & development): new ROADMAP spec, applicability-gated —
  joins competence/compliance-obligations/supplier in §13.4 sequencing.
- No finding invalidates the §8 CAPA machine or the four §3 laws; the
  matrix (RS-6) absorbs every new gate as artifact-type rows — no schema
  rework.

**Bottom line: 9 IN-PLACE · 7 PARTIAL (named fixes, all absorbable into
already-planned P3/P4 surfaces + RS-6 rows) · 2 GAP-NEW (release-auth
workflow; 8.3 module as roadmap) · 3 known ROADMAP. No structural rework.**
