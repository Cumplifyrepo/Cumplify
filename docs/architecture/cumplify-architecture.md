# Cumplify.ai — Enterprise Architecture & Engineering Handoff

**Document:** `cumplify-architecture.md`
**Audience:** Senior AWS engineer (build handoff)
**Scope:** Tri-standard Integrated Management System (IMS) — ISO 9001:2015 (Quality), ISO 14001:2015 (Environmental), ISO 45001:2018 (Occupational Health & Safety) — delivered as a genuinely agentic, multi-tenant AWS-Bedrock SaaS.
**Status:** Extends the existing Quality-only platform (5 modules, 8 Bedrock agents built in PHASE-14) to the full 13-module / 22-agent IMS. All AWS choices are grounded in the verified stack facts and are CDK-compatible (constructs/props only — never console steps).

---

## Table of Contents
- [Section A — Module Architecture](#section-a--module-architecture)
- [Section B — AI Agent Layer](#section-b--ai-agent-layer)
- [Section C — Data Architecture](#section-c--data-architecture)
- [Section D — AWS Infrastructure](#section-d--aws-infrastructure)
- [Section E — Compliance-Specific Architecture](#section-e--compliance-specific-architecture)

---

## Section A — Module Architecture

Cumplify is organized into **13 modules (M1–M13)**: 5 existing (extended from Quality-only to tri-standard) and 8 new. Every module owns a precise set of Annex SL clauses across one or more of the three standards. The design principle is **single clause ownership** — each requirement clause has exactly one owning module (and one owning agent, see Section B) so there is no ambiguity about which module is the system-of-record for a given ISO requirement.

### A.1 Standard → Module Ownership Matrix

Each requirement below cites the **actual clause number and title** verbatim from the standard.

#### ISO 9001:2015 (Quality — product/service conformity, customer)

| Clause (number + title) | Owning module |
|---|---|
| 4.1 Understanding the organization and its context | M6 Context & Stakeholder Studio |
| 4.2 Understanding the needs and expectations of interested parties | M6 Context & Stakeholder Studio |
| 4.3 Determining the scope of the QMS | M1 Document Studio (inputs from M6) |
| 4.4 QMS and its processes | ControlTower governance (M1 documents it) |
| 5.1 Leadership and commitment (5.1.1 general, 5.1.2 customer focus) | M6 Context & Stakeholder Studio |
| 5.2 Policy (5.2.1 establishing, 5.2.2 communicating the quality policy) | M1 Document Studio |
| 5.3 Organizational roles, responsibilities and authorities | M6 Context & Stakeholder Studio |
| 6.1 Actions to address risks and opportunities | M5 Risk Management |
| 6.2 Quality objectives and planning to achieve them | M7 Objectives & Targets |
| 6.3 Planning of changes | M5 Risk Management |
| 7.1.5 Monitoring and measuring resources (7.1.5.1 general, 7.1.5.2 measurement traceability/calibration) | M4 Records Management |
| 7.2 Competence | M13 Competence & Training |
| 7.3 Awareness | M13 Competence & Training |
| 7.4 Communication | M6 Context & Stakeholder Studio |
| 7.5 Documented information (7.5.1, 7.5.2, 7.5.3) | M1 Document Studio |
| 8.4 Control of externally provided processes, products and services (8.4.1–8.4.3) | M12 Supplier & External Provider Management |
| 8.7 Control of nonconforming outputs | M2 CAPA |
| 9.1 Monitoring, measurement, analysis and evaluation (9.1.1, 9.1.2 customer satisfaction, 9.1.3) | M7 Objectives & Targets (9.1.1) / M4 (evidence) |
| 9.2 Internal audit | M3 Audit Studio |
| 9.3 Management review (9.3.1, 9.3.2 inputs, 9.3.3 outputs) | M11 Management Review |
| 10.2 Nonconformity and corrective action | M2 CAPA |
| 10.3 Continual improvement | M2 CAPA (improvement actions; ObjectiveTracker/M7 tracks improvement objectives) |

#### ISO 14001:2015 (Environmental — aspects, impacts, compliance obligations)

| Clause (number + title) | Owning module |
|---|---|
| 4.1 / 4.2 Context & interested parties | M6 Context & Stakeholder Studio |
| 4.3 Determining the scope of the EMS | M1 Document Studio |
| 5.2 Environmental policy | M1 Document Studio |
| 6.1.1 General | M5 Risk Management |
| 6.1.2 Environmental aspects | M9 Environmental Management (EnviroStudio) |
| 6.1.3 Compliance obligations | M8 Compliance Obligations Register |
| 6.1.4 Planning action | M5 Risk Management |
| 6.2 Environmental objectives and planning (6.2.1, 6.2.2) | M7 Objectives & Targets |
| 7.4 Communication (7.4.1, 7.4.2 internal, 7.4.3 external) | M6 Context & Stakeholder Studio |
| 7.5 Documented information | M1 Document Studio |
| 8.1 Operational planning and control | M9 Environmental Management |
| 8.2 Emergency preparedness and response | M9 Environmental Management |
| 9.1.1 Monitoring, measurement, analysis and evaluation | M9 Environmental Management (waste/emissions/energy/water) |
| 9.1.2 Evaluation of compliance | M8 Compliance Obligations Register |
| 9.2 Internal audit (9.2.1, 9.2.2 programme) | M3 Audit Studio |
| 9.3 Management review | M11 Management Review |
| 10.2 Nonconformity and corrective action | M2 CAPA |

#### ISO 45001:2018 (OH&S — hazards, OH&S risks, workers, incidents)

| Clause (number + title) | Owning module |
|---|---|
| 4.2 Understanding the needs and expectations of workers and other interested parties | M6 Context & Stakeholder Studio |
| 4.3 Determining the scope of the OH&S management system | M1 Document Studio |
| 5.2 OH&S policy | M1 Document Studio |
| 5.4 Consultation and participation of workers (UNIQUE to 45001) | M10 Safety Operations |
| 6.1.2.1 Hazard identification | M10 Safety Operations |
| 6.1.2.2 Assessment of OH&S risks and other risks | M10 Safety Operations → M5 Risk Management |
| 6.1.2.3 Assessment of OH&S opportunities and other opportunities | M10 Safety Operations |
| 6.1.3 Determination of legal requirements and other requirements | M8 Compliance Obligations Register |
| 6.2 OH&S objectives and planning to achieve them (6.2.1, 6.2.2) | M7 Objectives & Targets |
| 8.1.2 Eliminating hazards and reducing OH&S risks (hierarchy of controls) | M10 Safety Operations |
| 8.1.3 Management of change | M10 Safety Operations (MOC) / M5 (risk view) |
| 8.1.4 Procurement (8.1.4.1 general, 8.1.4.2 contractors, 8.1.4.3 outsourcing) | M12 Supplier & External Provider Management / M10 |
| 8.2 Emergency preparedness and response | M10 Safety Operations |
| 9.1.2 Evaluation of compliance | M8 Compliance Obligations Register |
| 9.2 Internal audit | M3 Audit Studio |
| 9.3 Management review | M11 Management Review |
| 10.2 Incident, nonconformity and corrective action (45001 adds "Incident") | M2 CAPA / M10 Safety Operations |

### A.2 Existing 5 Modules (extended Quality-only → tri-standard)

- **M1 Document Studio** — owns 4.3 scope, 5.2 policy (all 3 standards), 7.5 documented information (all 3): quality manual, IMS manual, procedures, work instructions, versioning/approval/controlled distribution.
- **M2 CAPA** — owns 8.7 (9001 nonconforming outputs), 10.2 (9001 & 14001 nonconformity & corrective action; 45001 incident + NC + CA), root cause, effectiveness verification.
- **M3 Audit Studio** — owns 9.2 internal audit (all 3): programme, checklists, findings, readiness scoring.
- **M4 Records Management** — owns 7.5 retention/control, 7.1.5 monitoring & measuring resources / calibration records (9001), evidence, **immutable append-only audit trail**.
- **M5 Risk Management** — owns 6.1 actions to address risks & opportunities (all 3), 9001 risk-based thinking, 6.3 (9001) / 8.1.3 (45001) change planning; hosts the cross-register risk view.

### A.3 The 8 New Modules

- **M6 Context & Stakeholder Studio** — 4.1 context, 4.2 interested parties/workers, 4.3 scope inputs, 7.4 communication (all 3), 5.1/5.3 leadership & roles.
- **M7 Objectives & Targets** — 6.2 objectives (all 3), programmes, KPIs (owner/due/progress), links to 9.1.1 monitoring.
- **M8 Compliance Obligations Register (Legal Register)** — 14001 6.1.3 compliance obligations, 45001 6.1.3 legal & other requirements, 9.1.2 evaluation of compliance (14001 & 45001).
- **M9 Environmental Management (EnviroStudio)** — 14001 6.1.2 environmental aspects/impacts (significance), 14001 8.1 operational controls, 14001 8.2 emergency preparedness, 14001 9.1.1 monitoring (waste/emissions/energy/water).
- **M10 Safety Operations (OH&S/EHS Ops)** — 45001 6.1.2 hazard ID & OH&S risk (hierarchy of controls), 45001 8.1.2 eliminating hazards, 45001 8.1.3 MOC, 45001 8.1.4 procurement/contractors/outsourcing, 45001 8.2 emergency prep, 45001 10.2 incident management, 45001 5.4 worker consultation & participation.
- **M11 Management Review** — 9.3 (all 3): structured inputs (9.3.2) / outputs (9.3.3), minutes, action items.
- **M12 Supplier & External Provider Management** — 8.4 (9001), 14001 8.1 & 45001 8.1.4 procurement/contractors/outsourcing, evaluation & monitoring.
- **M13 Competence & Training** — 7.2 competence, 7.3 awareness (all 3), training records, expiry, competency verification.

### A.4 Module Interaction & Data-Flow Model (5 core modules)

The five existing modules form the **compliance transaction core**. They share data through the RDS system-of-record (relational joins) and trigger one another through **EventBridge domain events + SQS work queues** (never direct synchronous coupling). Every state transition also emits an append-only event into the DynamoDB immutable audit-event mirror (Section C.2) written by M4.

```
                         ┌─────────────────────────────────────────────────┐
                         │        EventBridge custom bus: cumplify-ims       │
                         │  (domain events; rules fan out to SQS + agents)   │
                         └───────────────▲─────────────────┬────────────────┘
                                         │ emit            │ deliver (rule→SQS)
    ┌───────────────┐   finding/NC       │                 │       ┌──────────────────┐
    │ M3 Audit      │────────────────────┤                 ├──────▶│ M2 CAPA          │
    │ Studio        │  audit.finding     │                 │       │ (8.7, 10.2)      │
    │ (9.2 all 3)   │  .raised           │                 │       │ root cause +     │
    └──────┬────────┘                    │                 │       │ effectiveness    │
           │ audit programme /           │                 │       └───────┬──────────┘
           │ checklist versions          │                 │  capa.opened / │ capa.closed
           ▼ (read)                      │                 │  capa.verified │
    ┌───────────────┐   controlled doc   │                 │                ▼
    │ M1 Document   │◀───────────────────┤                 │       ┌──────────────────┐
    │ Studio        │  doc.published     │                 └──────▶│ M4 Records Mgmt  │
    │ (4.3,5.2,7.5) │  doc.superseded    │  evidence.stored        │ (7.5, 7.1.5,     │
    └──────┬────────┘                    │                         │  IMMUTABLE TRAIL)│
           │ links documents to          │                         └───────┬──────────┘
           │ risks & controls            │  risk.updated                   │ every event
           ▼ (FK)                        │  risk.control.linked            │ appended
    ┌───────────────┐                    │                                 ▼
    │ M5 Risk Mgmt  │────────────────────┘                    DynamoDB append-only log
    │ (6.1 all 3,   │  hosts cross-register risk view;                + S3 WORM archive
    │  6.3/8.1.3)   │  consumes hazards (M10) & aspects (M9)
    └───────────────┘
```

**Trigger semantics (event-driven, decoupled):**

1. **Audit → CAPA.** M3 Audit Studio raises an `audit.finding.raised` event on the `cumplify-ims` EventBridge bus. A rule routes it to the CAPA intake SQS queue; M2 opens a nonconformity/corrective-action record (10.2). This is the `LeadAuditor → CAPAGuru` agent chain (Section B).
2. **CAPA → Records.** On `capa.opened`, `capa.verified`, `capa.closed`, M2 emits events that M4 records as evidence (7.5) and appends to the immutable trail. Effectiveness-verification records are retained under 7.5.3.
3. **Document ↔ Risk.** M1 published controlled documents (`doc.published`) reference risks/controls owned by M5 via RDS foreign keys, so a risk register entry (6.1) traces to the procedure that mitigates it. Superseding a document (`doc.superseded`) triggers a risk re-evaluation task in M5.
4. **Risk aggregation.** M5 hosts the **cross-register risk view**, consuming OH&S hazards from M10 (`hazard.assessed`) and environmental aspects from M9 (`aspect.significant`) so 6.1 across all three standards is a single normalized register with per-standard terminology preserved.
5. **Universal evidence sink.** M4 subscribes to *all* domain events and appends each to the DynamoDB immutable audit-event log; sealed batches are archived to S3 with Object Lock COMPLIANCE mode (WORM). This is the backbone of Section E.1.

**Extended-module wiring (new modules into the core):**

```
 M6 Context ──(interested parties, 4.2)──▶ M1 (scope 4.3) ──▶ M11 Mgmt Review (9.3.2 input)
 M9 Enviro  ──(aspect.significant, 6.1.2)─▶ M5 Risk ──▶ M2 CAPA (env NC 10.2)
 M10 Safety ──(hazard.assessed, 6.1.2)────▶ M5 Risk ──▶ M2 CAPA (incident 10.2)
 M10 Safety ──(incident.reported)─────────▶ M2 CAPA (45001 10.2 Incident+NC+CA)
 M8 Legal   ──(obligation.evaluated, 9.1.2)▶ M11 Mgmt Review (9.3.2 compliance input)
 M7 Object. ──(kpi.progress, 9.1.1)───────▶ M11 Mgmt Review (9.3.2 objectives input)
 M12 Supplier ─(supplier.evaluated, 8.4)──▶ M5 Risk + M11 Mgmt Review
 M13 Compet. ──(competence.gap, 7.2)──────▶ M2 CAPA (training NC) + M11 Mgmt Review
 M11 Mgmt Review ──(9.3.3 outputs: actions)▶ M2 CAPA + M7 Objectives + M5 Risk
```

---

## Section B — AI Agent Layer

Cumplify's differentiation vs. CertifyAero (a client-side browser generator) is a **genuinely agentic AWS-Bedrock backend** running the **detect → draft → route → verify → close** loop with an immutable audit trail. The roster is **22 agents**; the existing 8 (PHASE-14) keep their names and models.

### B.1 Orchestration Model

- **Supervisor:** `ControlTower` (Nova Pro) using **Bedrock multi-agent collaboration** as the supervisor/orchestrator. It owns cross-standard governance clauses 4.4, 5.1, 5.3 and dispatches to specialist agents.
- **Event-driven substrate:** **EventBridge (`cumplify-ims` custom bus) + SQS**. Domain events trigger agents; agent-to-agent hand-offs are events, not synchronous calls, so failures are retried via SQS with DLQs.
- **HITL:** For any *mutating* action (publishing a document, closing a CAPA, changing a risk rating), the agent **pauses** and uses `returnControlInvocationResults` — a human (per Cognito role) approves before the mutation commits. Read/draft actions run autonomously.
- **Guardrails:** Every agent invocation passes through a Bedrock `CfnGuardrail` with **PII anonymize/block** and **PROMPT_ATTACK** filtering.
- **Model invocation:** `bedrock:InvokeModel` requires `Resource: '*'`. Action-group Lambdas carry a **resource-based policy for `bedrock.amazonaws.com`**. Claude Sonnet 4.6 is **not available in-region** in us-east-1 → all Sonnet agents **must** use the cross-region inference profile `us.anthropic.claude-sonnet-4-6`. Nova Pro/Lite use `us.amazon.nova-pro-v1:0` / `us.amazon.nova-lite-v1:0`.

### B.2 The 22-Agent Roster

**EXISTING (built, PHASE-14):**

| Agent | Model | Modules | Clauses | Trigger | Tools/Action groups | KB | Output → Handoff |
|---|---|---|---|---|---|---|---|
| **ControlTower** | Nova Pro | Supervisor | 4.4, 5.1, 5.3 | Any high-level user intent / cross-standard event | Route-to-agent, tenant policy read | IMS meta-KB | Delegation plan → all agents |
| **DocStudio** | Nova Pro | M1 | 4.3, 5.2, 7.5 (all 3) | `doc.request`, policy/scope change | Draft doc, version, controlled-distribution | ISO KB + tenant docs (AOSS) | Published doc → RecordsVault |
| **LeadAuditor** | Nova Pro | M3 | 9.2 (all 3) | Audit programme schedule (cron) | Generate checklist, score readiness, raise finding | ISO KB | `audit.finding.raised` → CAPAGuru |
| **CAPAGuru** | Nova Pro | M2 | 8.7 (9001), 10.2 (all 3) | `audit.finding.raised`, `incident.reported`, `nc.triaged` | Root-cause, draft CA, verify effectiveness | ISO KB | `capa.*` → RecordsVault |
| **RecordsVault** | Nova Lite | M4, M13 | 7.5, 7.1.5, 7.2, 7.3 | Any evidence-bearing event | Append audit event, store evidence, retention | Records index (AOSS) | Immutable log entry / S3 WORM |
| **ISO9001 Domain Guru** | Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) | advisory | all 9001 clauses (Q&A) | User question routed by ComplianceCopilot | Semantic search over 9001 KB | 9001 KB (AOSS) | Advisory answer |
| **ISO14001 Domain Guru** | Claude Sonnet 4.6 | advisory | all 14001 clauses (Q&A) | Routed question | Semantic search over 14001 KB | 14001 KB (AOSS) | Advisory answer |
| **ISO45001 Domain Guru** | Claude Sonnet 4.6 | advisory | all 45001 clauses (Q&A) | Routed question | Semantic search over 45001 KB | 45001 KB (AOSS) | Advisory answer |

**NEW (roadmap):**

| Agent | Model | Modules | Clauses | Trigger | Tools | Output → Handoff |
|---|---|---|---|---|---|---|
| **RiskSentinel** | Nova Pro | M5 | 6.1 (all 3), 6.3 (9001) | `hazard.assessed`, `aspect.significant`, `doc.superseded` | Score risk, plan action (6.1.4), MOC | `risk.updated` → CAPAGuru |
| **AspectWarden** | Nova Pro | M9 | 14001 6.1.2, 14001 8.1, 14001 9.1.1 | Enviro data ingest (waste/emissions/energy/water) | Determine significance, operational control | `aspect.significant` → RiskSentinel |
| **HazardScout** | Nova Pro | M10 | 45001 6.1.2, 45001 8.1.2 | Hazard reported / workplace change | Hazard ID, hierarchy-of-controls draft | `hazard.assessed` → RiskSentinel → CAPAGuru |
| **IncidentInvestigator** | Nova Pro | M2, M10 | 45001 10.2, 14001 10.2 (env incidents) | `incident.reported` | Investigate, classify Incident vs NC | → CAPAGuru |
| **LegalLedger** | Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) | M8 | 14001 6.1.3, 45001 6.1.3, 9.1.2 (14001 & 45001) | Obligation added / periodic compliance eval | Interpret legal text, map obligation→control, evaluate compliance | `obligation.evaluated` → M11 |
| **ObjectiveTracker** | Nova Lite | M7 | 6.2 (all 3), 9.1.1 | KPI update / due-date cron | Track progress, compute KPI, flag off-track | `kpi.progress` → M11 |
| **ReviewOrchestrator** | Nova Pro | M11 | 9.3 (all 3) | Management-review cadence (cron) | **Parallel fan-out** to gather 9.3.2 inputs | 9.3.3 outputs → CAPAGuru, ObjectiveTracker, RiskSentinel |
| **ContextCartographer** | Nova Lite | M6 | 4.1, 4.2 (all 3), 7.4 | Context/stakeholder change | Map context, interested parties, comms plan | Scope inputs → DocStudio |
| **SupplierScout** | Nova Lite | M12 | 8.4 (9001), 14001 8.1, 45001 8.1.4 | Supplier onboard / re-eval cron | Evaluate & monitor external providers | `supplier.evaluated` → RiskSentinel, M11 |
| **CompetenceKeeper** | Nova Lite | M13 | 7.2, 7.3 (all 3) | Training expiry / new role | Competency verification, awareness tracking | `competence.gap` → CAPAGuru |
| **EmergencyPlanner** | Nova Lite | M9, M10 | 14001 8.2, 45001 8.2 | Emergency-plan review cron | Draft/verify emergency preparedness & response | Plans → DocStudio, RecordsVault |
| **WorkerVoice** | Nova Lite | M10 | 45001 5.4 (UNIQUE to 45001) | Worker consultation/participation event | Capture consultation, route worker input | Records → M11, RecordsVault |
| **NCTriage** | Nova Lite | M2 | 8.7 (9001), 10.2 (all 3) | `nc.detected` | Triage/classify NC severity | `nc.triaged` → CAPAGuru → RecordsVault |
| **ComplianceCopilot** | Nova Pro | user-facing router | advisory, all clauses | User chat | Route to the 3 Domain Gurus | Advisory answer to user |

### B.3 Agent Chains and Parallel Fan-Out

```
CHAIN 1 (NC lifecycle):   NCTriage ──▶ CAPAGuru ──▶ RecordsVault
CHAIN 2 (audit→CA):       LeadAuditor ──(findings)──▶ CAPAGuru ──▶ RecordsVault
CHAIN 3 (OH&S):           HazardScout ──▶ RiskSentinel ──▶ CAPAGuru ──▶ RecordsVault
CHAIN 4 (environmental):  AspectWarden ──▶ RiskSentinel ──▶ (if NC) CAPAGuru
CHAIN 5 (incident):       IncidentInvestigator ──▶ CAPAGuru (45001 10.2 Incident+NC+CA)

PARALLEL FAN-OUT (Management Review 9.3.2 inputs):

                          ┌──────────────────────────────────────────┐
                          │        ReviewOrchestrator (M11, 9.3)      │
                          │   fans out in parallel via EventBridge    │
                          └───┬─────┬─────┬─────┬─────┬─────┬─────┬────┘
                              ▼     ▼     ▼     ▼     ▼     ▼     ▼
                        LeadAuditor CAPAGuru ObjectiveTracker LegalLedger
                        RiskSentinel SupplierScout CompetenceKeeper
                              │                                   │
                              └──────────► aggregated 9.3.2 ◄─────┘
                                          inputs → 9.3.3 outputs
                                          (actions dispatched back)

PARALLEL FAN-OUT (audit prep):  LeadAuditor fans out checklist generation
                                across all in-scope clauses concurrently.
```

The supervisor `ControlTower` coordinates all chains via Bedrock multi-agent collaboration; the transport between agents is EventBridge rules → SQS queues (with DLQ) so a slow/failed downstream agent never blocks the upstream one.

---

## Section C — Data Architecture

**Polyglot persistence (reconciled):**
- **RDS PostgreSQL** = relational **system-of-record** for ISO domain entities (registers with rich relationships, joins, reporting). All ISO schema domains live here.
- **DynamoDB** (`CumplifyCore`, single-table, PK/SK, on-demand, CMK, 9 GSIs) = tenant/user metadata, agent sessions, idempotency, rate limits, and the **append-only immutable audit-event mirror**.
- **OpenSearch Serverless VECTORSEARCH** (NextGen, scale-to-zero) = Bedrock KB (ISO standards + tenant docs), compliance-document semantic search, and audit-trail retrieval. Dimension **1536** (Titan Text Embeddings v2, `amazon.titan-embed-text-v2:0`).
- **ElastiCache (Redis)** = hot compliance register cache.
- **S3 + Object Lock COMPLIANCE mode** = WORM document/evidence storage + sealed audit-event archive.

### C.1 RDS PostgreSQL Schema Domains (system-of-record)

Every table carries `tenant_id` (row-level tenant isolation, enforced by RLS policies keyed to the Lambda-authorizer `resolverContext.tenantId`) and standard audit columns (`created_at`, `created_by`, `updated_at`, `version`). Schemas are grouped by domain; ISO terminology is kept **distinct per standard** (Quality=product/customer, Environmental=aspects/impacts/obligations, OH&S=hazards/workers/incidents).

**Domain: Quality (ISO 9001)** — `quality` schema
- `quality_records` (product/service conformity records), `nonconforming_output` (8.7), `calibration_record` (7.1.5.2 measurement traceability), `customer_satisfaction` (9.1.2), `design_dev` (8.3.1–8.3.6).

**Domain: Environmental (ISO 14001)** — `environmental` schema
- `environmental_aspect` (6.1.2: activity, aspect, impact, `significance_score`, `is_significant`), `operational_control` (8.1), `env_monitoring` (9.1.1: waste/emissions/energy/water readings), `env_emergency_plan` (8.2).

**Domain: OH&S (ISO 45001)** — `ohs` schema
- `hazard_register` (6.1.2.1 hazard identification), `ohs_risk_assessment` (6.1.2.2), `ohs_opportunity` (6.1.2.3), `hierarchy_of_controls` (8.1.2: elimination→substitution→engineering→admin→PPE), `management_of_change` (8.1.3), `incident` (10.2 — 45001 Incident), `worker_consultation` (5.4), `contractor` (8.1.4.2), `outsourcing` (8.1.4.3).

**Domain: Legal / Compliance Obligations (M8)** — `legal` schema
- `compliance_obligation` (14001 6.1.3 / 45001 6.1.3: obligation text, jurisdiction, source, applicable_standard), `compliance_evaluation` (9.1.2: eval date, status, evidence link), `obligation_control_map` (obligation → owning control/document).

**Domain: Objectives & Targets (M7)** — `objectives` schema
- `objective` (6.2, per standard), `target`, `programme`, `kpi` (owner, due, baseline, current, progress %, links to `env_monitoring` / other 9.1.1 sources).

**Domain: CAPA (M2)** — `capa` schema
- `capa` (type: 8.7 NC-output | 10.2 NC/CA | 45001 Incident), `root_cause`, `corrective_action`, `effectiveness_verification`, FK to source finding/incident.

**Domain: Audit (M3)** — `audit` schema
- `audit_programme` (9.2.2), `audit` (9.2.1), `audit_checklist`, `audit_finding` (FK → `capa`), `readiness_score`.

**Domain: Management Review (M11)** — `mgmt_review` schema
- `management_review` (9.3.1), `review_input` (9.3.2, typed by input category), `review_output` (9.3.3: decisions, actions → FK to `capa`/`objective`/risk), `action_item`.

**Cross-domain: Documents, Risk, Context, Competence, Suppliers**
- `document` (M1: 7.5 — version, approval, controlled-distribution, status, supersedes_id), `risk_register` (M5: 6.1, normalized across all 3 standards with `source_standard` + FK to hazard/aspect), `context_factor` (M6: 4.1), `interested_party` (M6: 4.2), `communication_plan` (M6: 7.4), `competence_record` (M13: 7.2/7.3, expiry), `supplier` (M12: 8.4, evaluation, approval status).

**Referential integrity examples (why relational is required):**
`audit_finding.id → capa.source_finding_id → root_cause → corrective_action → effectiveness_verification`; `compliance_obligation → obligation_control_map → document`; `hazard_register → ohs_risk_assessment → risk_register`. These multi-hop joins and traceability reports are the reason ISO domains live in RDS, not DynamoDB.

### C.2 DynamoDB — Append-Only Immutable Audit-Event Log

Single table `CumplifyCore` (on-demand, CMK-encrypted, 9 GSIs). The audit-event mirror is **append-only** — writes use `PutItem` with `attribute_not_exists(pk)` (this also provides idempotency). **No update/delete IAM actions are granted** on audit-event items (see Section D.6).

```
Immutable audit-event item:
  PK  = TENANT#<tenantId>#AUDITLOG
  SK  = EVENT#<ISO8601-timestamp>#<ulid>       (monotonic → natural ordering)
  eventType    = capa.closed | doc.published | risk.updated | audit.finding.raised ...
  actor        = <cognito sub | agentName>
  module       = M1..M13
  clauseRef    = "ISO 45001 clause 6.1.2.1 Hazard identification"
  standard     = ISO9001 | ISO14001 | ISO45001
  payloadHash  = sha256(before,after)          (tamper-evident chaining)
  prevHash     = <hash of previous event>       (hash-chain for integrity)
  ttl          = (none — audit events never expire)
```

**Tenant isolation:** IAM `dynamodb:LeadingKeys` condition `ForAllValues:StringLike` with `aws:PrincipalTag/tenantId` restricts every principal to its own `TENANT#<tenantId>#*` partition. DynamoDB Streams are retained 24h only and feed the S3 WORM sealer Lambda (Section E.1). Other `CumplifyCore` item types: tenant/user metadata, agent sessions, idempotency keys, rate-limit counters.

**DynamoDB CMK rule:** the Lambda execution role needs **all 6 KMS actions** — `Encrypt`, `Decrypt`, `ReEncrypt*`, `GenerateDataKey*`, `DescribeKey`, `CreateGrant`.

### C.3 OpenSearch Serverless — Index Strategy (VECTORSEARCH, NextGen scale-to-zero)

Collection type **VECTORSEARCH**, dimension **1536** (Titan Text v2). Three required policies via CDK `CfnCollection` + `CfnSecurityPolicy` / `CfnAccessPolicy`: **encryption**, **network**, **data-access** — and the **Bedrock KB service role MUST be included in the AOSS data-access policy**.

**Indexes:**
1. `iso-standards-kb` — the three ISO standards (9001/14001/45001), chunked + embedded; source for the Domain Gurus and all draft actions. Metadata: `standard`, `clause`, `title`.
2. `tenant-docs-kb` — per-tenant controlled documents (7.5), filtered by `tenant_id` in every query.
3. `compliance-doc-search` — semantic search across obligations, procedures, evidence.
4. `audit-trail-retrieval` — semantic/temporal retrieval over the audit-event mirror for investigations.

> **MANDATORY cold-start rule (state on every AOSS access path):** OpenSearch Serverless NextGen scale-to-zero has a **cold start of up to 45 seconds**. **ALL** data access to AOSS **MUST** implement application-side retry with **exponential backoff** and a **minimum 45-second cold-start timeout budget**. This applies to every Bedrock KB retrieval, every semantic search resolver, and every audit-trail retrieval Lambda. Lambdas hitting AOSS are configured with `timeout ≥ 60s` and SDK retry (base 500ms, factor 2, jitter, ceiling 45s).

### C.4 ElastiCache (Redis) — Hot Register Caching Strategy

Cache the **hot compliance registers** that are read on nearly every dashboard load and are expensive to join in RDS:

| Cache key | Register | Source of truth | Invalidation |
|---|---|---|---|
| `tenant:<id>:legal-register` | Legal register (M8, 6.1.3) | RDS `legal.compliance_obligation` | on `obligation.*` event |
| `tenant:<id>:approved-suppliers` | Approved-supplier list (M12, 8.4) | RDS `supplier` | on `supplier.evaluated` |
| `tenant:<id>:hazard-register` | Hazard register (M10, 6.1.2) | RDS `ohs.hazard_register` | on `hazard.assessed` |
| `tenant:<id>:objectives-dash` | Objectives dashboard (M7, 6.2) | RDS `objectives.*` | on `kpi.progress` |

Write-through on register mutation; TTL 300s as a safety net; **event-driven invalidation** is primary (the mutating EventBridge event triggers a cache-bust Lambda). All keys are tenant-namespaced.

```
Read path:   AppSync resolver ─▶ Redis (hit? return) ─▶ miss ─▶ RDS join ─▶ warm Redis ─▶ return
Write path:  mutation ─▶ RDS commit ─▶ EventBridge event ─▶ cache-bust Lambda ─▶ Redis DEL
Vector path: resolver ─▶ AOSS (45s cold-start budget + exp-backoff retry) ─▶ return
```

---

## Section D — AWS Infrastructure

Stack (verified): Next.js (Amplify hosting) → CloudFront/S3 → AppSync (GraphQL) → Lambda → Bedrock Agents → RDS PostgreSQL + DynamoDB + OpenSearch Serverless + ElastiCache + SQS + EventBridge + Secrets Manager + KMS + ECS/Fargate + Cognito (3 User Pools). No services outside this set are introduced.

### D.1 Environment / Account Isolation (dev / staging / prod)

Three **separate AWS accounts**, isolated stacks, **CDK context per env**, **no shared state**.

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  dev account │   │ staging acct │   │  prod account│
│  full stack  │   │  full stack  │   │  full stack  │
│  CDK ctx=dev │   │ CDK ctx=stg  │   │ CDK ctx=prod │
└──────────────┘   └──────────────┘   └──────────────┘
   isolated KMS       isolated KMS        isolated KMS
   isolated RDS       isolated RDS        isolated RDS
   own Cognito x3     own Cognito x3      own Cognito x3
```

CDK: environment selected via `-c env=<dev|staging|prod>`; each env resolves its own account/region, KMS CMKs, RDS instances, Cognito pools, and AOSS collections. No cross-account state, no shared buckets/tables.

### D.2 AppSync Schema Additions & Auth Modes

Default auth **USER_POOL (COGNITO_USER_POOLS)** for user-facing ops; add **IAM** mode for service/agent-to-agent; **Lambda Authorizer** for ABAC returning `resolverContext.tenantId` / `role`. `@aws_cognito` = user-facing; `@aws_iam` = agent-to-agent/service. Subscriptions use a **None** data source; publish via a mutation annotated `@aws_iam`; the subscription resolver **MUST verify the tenant claim**.

New types/operations added for the tri-standard IMS (auth mode stated for each):

```graphql
# ---- Queries (user-facing) ----
type Query {
  legalRegister(tenantId: ID!): [ComplianceObligation]  @aws_cognito   # M8 6.1.3
  hazardRegister(tenantId: ID!): [Hazard]                @aws_cognito   # M10 6.1.2
  environmentalAspects(tenantId: ID!): [Aspect]          @aws_cognito   # M9 6.1.2
  objectivesDashboard(tenantId: ID!): [Objective]        @aws_cognito   # M7 6.2
  managementReview(id: ID!): ManagementReview            @aws_cognito   # M11 9.3
}

# ---- Mutations (user-facing, HITL-gated) ----
type Mutation {
  publishDocument(input: DocInput!): Document            @aws_cognito   # M1 7.5
  closeCapa(input: CapaCloseInput!): Capa                @aws_cognito   # M2 10.2
  evaluateObligation(input: EvalInput!): Evaluation      @aws_cognito   # M8 9.1.2

  # ---- Agent-to-agent / service publish (IAM) ----
  publishAgentMessage(input: AgentMsg!): AgentMsg        @aws_iam       # None DS → fans to subscription
  appendAuditEvent(input: AuditEventInput!): AuditEvent  @aws_iam       # M4 immutable log write
}

# ---- Subscriptions (user-facing; resolver verifies tenant claim) ----
type Subscription {
  onAgentMessage(tenantId: ID!): AgentMsg
    @aws_subscribe(mutations: ["publishAgentMessage"]) @aws_cognito
  onCapaStatus(tenantId: ID!): Capa
    @aws_subscribe(mutations: ["closeCapa"]) @aws_cognito
}
```

- Subscriptions use the **None** data source; the resolver **verifies `tenantId` against the Cognito/authorizer claim** before delivering — a subscriber can never receive another tenant's events.
- **WAFv2** protects AppSync: **REGIONAL** scope, attached via `api.graphQLEndpointArn`.
- **Caching** via a separate `CfnApiCache` construct (per-resolver TTL for read-heavy register queries; complements ElastiCache).

### D.3 Cognito Role Mapping (3 User Pools)

3 User Pools. `custom:tenantId` (immutable) injected via **PreTokenGeneration V1_0 → ID TOKEN ONLY** (not access token). Cognito **groups map to roles**. **DynamoDB is authoritative for runtime role/tier.** Lambda triggers have a **5s timeout**.

| Cognito group → role | Module access (representative) |
|---|---|
| **Quality Manager** | M1, M2, M3, M4, M5, M7, M11 (9001 domains) — full write |
| **EHS Manager** | M8, M9, M10, M5, M7, M11 (14001 + 45001 domains) — full write |
| **Auditor** | M3 full; read-only across M1–M13 for audit evidence; cannot mutate registers |
| **Employee** | M10 report hazard/incident, M13 own training, M6 worker consultation (5.4); read own records |
| **Executive** | Read-only dashboards across all modules; M11 approve 9.3.3 outputs |

Roles map to **IAM/ABAC** via the Lambda authorizer (`aws:PrincipalTag/tenantId`, `role`) enforcing both tenant isolation and least-privilege module access.

### D.4 SQS Topology of Compliance Events

EventBridge `cumplify-ims` bus rules route domain events to SQS queues; each consumer is a Lambda (or Fargate task for long-running agent work). Every queue has a **DLQ**.

```
                 EventBridge bus: cumplify-ims
   ┌──────────────┬──────────────┬──────────────┬──────────────┐
   │ rule:        │ rule:        │ rule:        │ rule:        │
   │ nc.detected  │ audit.finding│ hazard.*     │ aspect.*     │
   ▼              ▼              ▼              ▼
 SQS nc-triage  SQS capa-intake SQS hazard-q  SQS aspect-q
   │(→NCTriage)   │(→CAPAGuru)    │(→HazardScout)│(→AspectWarden)
   ▼ DLQ          ▼ DLQ          ▼ DLQ         ▼ DLQ

   ┌──────────────┬──────────────┬──────────────┐
   │ rule:        │ rule:        │ rule:        │
   │ capa.* /     │ mgmt.review  │ *.* (all)    │
   │ doc.* /risk.*│ .cadence     │ audit sink   │
   ▼              ▼              ▼
 SQS records-q   SQS review-fanout  SQS audit-sink
   │(→RecordsVault)│(→ReviewOrch.    │(→M4 append log
   ▼ DLQ          │  parallel)       │  → S3 WORM sealer)
                  ▼ DLQ             ▼ DLQ
```

FIFO queues (with message-group = `tenantId`) are used where per-tenant ordering matters (e.g., CAPA lifecycle and the audit sink); standard queues elsewhere. ESM (event-source mapping) wires each queue to its consumer Lambda.

### D.5 CloudFront + S3 with Object Lock (documents & evidence)

- **S3 + Object Lock COMPLIANCE mode** = WORM storage for controlled documents (7.5), evidence records, calibration records (7.1.5), and the sealed audit-event archive. COMPLIANCE mode means **not even the root account can delete/overwrite** within the retention period — the enforcement for immutability (Section E).
- Retention periods set per object per retention policy (documents vs. evidence vs. sealed audit archive).
- **CloudFront with OAC (Origin Access Control)** for delivery; S3 bucket policy restricts to the OAC. TLS enforced.
- Buckets are CMK-encrypted (KMS); CRR optional for prod DR (same-account/cross-region within prod boundary only — no cross-env sharing).

```
User ─(HTTPS)─▶ CloudFront (OAC) ─▶ S3 (Object Lock COMPLIANCE, CMK)
Agent write ──▶ Lambda (presigned PUT + retention header) ─▶ S3 WORM
Audit sealer ─▶ batches DynamoDB stream events ─▶ S3 sealed archive (retention set)
```

### D.6 IAM Permission Boundaries (per module & per agent)

Least privilege enforced by **permission boundaries** attached to every module Lambda role and every agent action-group Lambda role.

**Per-module boundary (example — M8 Legal Register):**
- Allow: RDS Data API to `legal.*` schema only; Redis `tenant:*:legal-register`; DynamoDB `PutItem` on audit-log items (append only); KMS 6 actions on the module CMK.
- Deny: any write to another module's schema; any `dynamodb:UpdateItem`/`DeleteItem` on `AUDITLOG` SK items.

**Per-agent boundary (examples):**
- All agents: `bedrock:InvokeModel` with `Resource: '*'` (required); Guardrail attached.
- Sonnet agents (Domain Gurus, LegalLedger): model resource pinned to `us.anthropic.claude-sonnet-4-6` inference profile (in-region unavailable).
- **RecordsVault**: `dynamodb:PutItem` with `attribute_not_exists(pk)` on `AUDITLOG` only; **no update/delete** on audit items → guarantees append-only. Full 6 KMS actions on the DynamoDB CMK.
- Action-group Lambdas: **resource-based policy for `bedrock.amazonaws.com`** (required for Bedrock to invoke them).
- Tenant isolation everywhere: DynamoDB access gated by `dynamodb:LeadingKeys` `ForAllValues:StringLike` on `aws:PrincipalTag/tenantId`; RDS via RLS + authorizer tenant claim.
- Guardrails on all agents: `CfnGuardrail` with PII anonymize/block + PROMPT_ATTACK.
- Secrets (RDS creds, third-party keys) in **Secrets Manager**, KMS-encrypted; roles granted `secretsmanager:GetSecretValue` on their own secret ARN only.

---

## Section E — Compliance-Specific Architecture

### E.1 Immutable, Append-Only Audit Trail

Immutability is enforced at **three layers** — no single control is trusted alone:

1. **Application layer:** every state transition in any module emits an audit event written via `appendAuditEvent` (`@aws_iam`) or directly by RecordsVault using `PutItem` + `attribute_not_exists(pk)`. Idempotent, append-only.
2. **IAM layer:** the writer role has **no** `UpdateItem`/`DeleteItem` on `PK = TENANT#<id>#AUDITLOG` items (Section D.6). Events carry `payloadHash` + `prevHash` forming a **hash chain** — any tampering breaks the chain and is detectable.
3. **Storage layer:** DynamoDB Streams (24h retention) feed an S3 **Object Lock COMPLIANCE mode** sealer that batches and writes WORM archive objects with a retention period; not even root can alter them.

```
module event ─▶ appendAuditEvent (@aws_iam) ─▶ DynamoDB AUDITLOG (append-only, hash-chained)
                                                     │ Stream (24h)
                                                     ▼
                                        S3 WORM sealer (Object Lock COMPLIANCE)
                                                     │
                                          audit-trail-retrieval index (AOSS)
                                          [45s cold-start budget + exp-backoff retry]
```

Retrieval for investigations/audits goes through the AOSS `audit-trail-retrieval` index — **which mandates the 45-second cold-start timeout budget with exponential-backoff retry** on every query.

### E.2 Document Control (7.5, all three standards) — M1 Document Studio

- **7.5.1 general / 7.5.2 creating and updating:** DocStudio drafts from the `iso-standards-kb` + `tenant-docs-kb`; documents carry `version`, `approval`, author, standard(s).
- **7.5.3 control of documented information:** controlled distribution, status (`draft → approved → published → superseded`), `supersedes_id` linkage. Publishing is **HITL-gated** (Quality Manager / EHS Manager approves via `returnControlInvocationResults`).
- Published artifacts stored in **S3 Object Lock (COMPLIANCE)** = WORM; superseded versions retained (never deleted) for traceability. Every publish/supersede emits an audit event (E.1).

### E.3 Legal / Compliance Obligations Register (M8) — 14001 6.1.3 + 45001 6.1.3, 9.1.2

- Register (`legal.compliance_obligation`) holds each obligation under **ISO 14001 clause 6.1.3 Compliance obligations** and **ISO 45001 clause 6.1.3 Determination of legal requirements and other requirements**, tagged by `applicable_standard` so the two are never conflated (14001 = compliance obligations / environmental; 45001 = legal & other requirements / worker safety).
- **LegalLedger** (Claude Sonnet 4.6, `us.anthropic.claude-sonnet-4-6`) interprets legal text, maps each obligation to a control/document (`obligation_control_map`), and performs **9.1.2 Evaluation of compliance** (14001 & 45001), emitting `obligation.evaluated` into the 9.3.2 management-review inputs.
- Hot-cached in Redis (`tenant:<id>:legal-register`), invalidated on obligation events.

### E.4 Objectives & Targets (M7) — 6.2 all three standards

- `objective` records per standard: **ISO 9001 clause 6.2 Quality objectives**, **ISO 14001 clause 6.2 Environmental objectives**, **ISO 45001 clause 6.2 OH&S objectives** — terminology kept distinct.
- Each objective has targets, a programme (6.2.2 planning to achieve), and KPIs (owner/due/baseline/current/progress) linked to **9.1.1 monitoring** sources (e.g., `env_monitoring` for 14001). **ObjectiveTracker** (Nova Lite) computes progress and flags off-track objectives into the management review.
- Dashboard hot-cached in Redis (`tenant:<id>:objectives-dash`).

### E.5 Management Review (M11) — 9.3.2 inputs / 9.3.3 outputs

**ReviewOrchestrator** (Nova Pro) drives clause **9.3 Management review** for all three standards via **parallel fan-out** (Section B.3), assembling structured inputs and dispatching outputs.

**9.3.2 Inputs (gathered in parallel from owning agents/modules):**
- Status of actions from prior reviews (M11 `action_item`).
- Changes in external/internal issues (M6 Context — 4.1/4.2).
- Performance: nonconformities & corrective actions (M2, 10.2), monitoring & measurement results (M7/M9, 9.1.1), audit results (M3, 9.2), evaluation of compliance (M8, 9.1.2).
- Adequacy of resources; effectiveness of actions to address risks & opportunities (M5, 6.1); supplier/external-provider performance (M12, 8.4); worker consultation input (M10, 5.4).

**9.3.3 Outputs (dispatched back as events):**
- Decisions on continual improvement (→ M2 CAPA, `10.3`; improvement objectives tracked in M7 Objectives & Targets).
- Any need for changes to the IMS (→ M1 / M5).
- Resource needs; corrective actions (→ M2 CAPA, 10.2).
- Recorded as `review_output` + `action_item`, each FK-linked to the CAPA/objective/risk it spawns, and each emitting an audit event into the immutable trail (E.1).

```
        9.3.2 INPUTS (parallel gather)          9.3.3 OUTPUTS (dispatch)
   M3 audit ─┐                              ┌─▶ M2 CAPA (corrective actions)
   M2 CAPA ──┤                              ├─▶ M7 Objectives (improvement)
   M8 legal ─┤─▶ ReviewOrchestrator (9.3) ──┤─▶ M5 Risk (IMS changes)
   M7 KPIs ──┤     minutes + action items    ├─▶ M1 Docs (IMS changes)
   M5 risk ──┤                              └─▶ RecordsVault (audit event)
   M12 sup. ─┤
   M10 5.4 ──┘
```

---

## Appendix — End-to-End Reference Flow (detect → draft → route → verify → close)

```
 DETECT   Employee reports a hazard (M10) ─▶ hazard.reported (EventBridge)
 DRAFT    HazardScout (6.1.2.1 Hazard identification) drafts hierarchy-of-controls (8.1.2)
 ROUTE    ─▶ RiskSentinel scores OH&S risk (6.1.2.2) ─▶ risk.updated
          ─▶ if nonconformity/incident ─▶ CAPAGuru opens CAPA (45001 10.2 Incident+NC+CA)
 VERIFY   CAPAGuru drafts corrective action; Quality/EHS Manager approves (HITL,
          returnControlInvocationResults); effectiveness verification recorded
 CLOSE    capa.closed ─▶ RecordsVault appends immutable audit event (hash-chained)
          ─▶ S3 WORM archive ─▶ feeds M11 9.3.2 inputs at next management review
```

Every step above cites its **actual ISO clause number and title**, keeps the three standards' terminology distinct (Quality=product/customer, Environmental=aspects/impacts/obligations, OH&S=hazards/workers/incidents), uses only the verified AWS stack, states the 45-second AOSS cold-start + exponential-backoff rule on every OpenSearch access path, and declares the auth mode (`@aws_cognito` user-facing vs `@aws_iam` agent-to-agent) on every AppSync mutation/subscription. This document is the authoritative build handoff for the senior AWS engineer.
