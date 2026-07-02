# Cumplify.ai — Agent Catalog

**Document:** `agent-catalog.md`
**Audience:** Senior AWS engineer (implementation handoff)
**Scope:** Per-agent specification for all 22 Bedrock agents in the Cumplify roster, plus orchestration and HITL model.
**Authority:** Conforms to the Cumplify Canonical Spine (module map M1–M13, agent roster, verified AWS stack, ISO 9001:2015 / ISO 14001:2015 / ISO 45001:2018 clause structure). No clause numbers are invented; every agent maps to ≥1 real clause.

---

## Conventions Used In This Catalog

- **Verified model IDs** (do not substitute):
  - Nova Pro: `amazon.nova-pro-v1:0` — invoked via cross-region inference profile `us.amazon.nova-pro-v1:0`.
  - Nova Lite: `amazon.nova-lite-v1:0` — cross-region `us.amazon.nova-lite-v1:0`.
  - Claude Sonnet 4.6: **NOT available in-region us-east-1** → MUST use cross-region inference profile `us.anthropic.claude-sonnet-4-6`.
  - Embeddings (all KB ingest/query): Titan Text Embeddings v2 `amazon.titan-embed-text-v2:0` = **1536 dimensions**.
- **`bedrock:InvokeModel`** IAM statements require `Resource: '*'`. Each action-group Lambda requires a **resource-based policy allowing principal `bedrock.amazonaws.com`** (with `SourceAccount` + agent-alias `SourceArn` conditions).
- **Knowledge Base retrieval (OpenSearch Serverless VECTORSEARCH, NextGen scale-to-zero):** ALL data access to AOSS MUST implement **application-side retry with exponential backoff and a minimum 45-second cold-start timeout budget** (cold start up to 45 s). The Bedrock KB service role MUST be present in the AOSS **data-access policy**; AOSS also requires its 3 policies (encryption, network, data-access). This is restated per agent that reads AOSS.
- **KB sources** referenced below:
  - `ISO-KB` = Bedrock Knowledge Base holding the ISO 9001/14001/45001 standard text, embedded with Titan v2 (1536-dim) in AOSS.
  - `TENANT-DOCS-KB` = tenant-scoped compliance documents (manuals, procedures, evidence) embedded with Titan v2 in AOSS; tenant isolation enforced via metadata filter on `tenantId`.
- **Data targets:**
  - **RDS PostgreSQL** = relational system-of-record for ISO domain entities (registers, joins, reporting).
  - **DynamoDB** `CumplifyCore` (single-table, PK/SK, on-demand, CMK, 9 GSIs) = tenant/user metadata, agent sessions, idempotency, rate limits, append-only **immutable audit-event mirror**. Tenant isolation via IAM `LeadingKeys` (`ForAllValues:StringLike` on `aws:PrincipalTag/tenantId`). DynamoDB CMK access requires all 6 KMS actions (Encrypt, Decrypt, ReEncrypt\*, GenerateDataKey\*, DescribeKey, CreateGrant). Idempotency via `PutItem attribute_not_exists(pk)`.
  - **S3 + Object Lock COMPLIANCE mode** = WORM document/evidence storage + sealed audit-event archive; CloudFront (OAC) for delivery.
  - **ElastiCache (Redis)** = hot register cache (legal register, approved-supplier list, hazard register, objectives dashboard).
- **AppSync auth directives:** `@aws_cognito` = user-facing (COGNITO_USER_POOLS); `@aws_iam` = agent-to-agent/service. Agent writes that surface to UI publish via a mutation annotated **`@aws_iam`** (e.g. `publishAgentMessage`); the paired subscription (None data source) is annotated **`@aws_cognito`** and its resolver MUST verify the tenant claim.
- **HITL:** For any **mutating** action (writes to RDS/DynamoDB/S3 that alter compliance state), the agent **pauses via `returnControl`** and the write is committed only after `returnControlInvocationResults` carries an approval from an authorized human role. Advisory/read-only agents do not require HITL.
- **Roles (Cognito groups → ABAC):** Quality Manager, EHS Manager, Auditor, Employee, Executive. DynamoDB is authoritative for runtime role/tier.
- **Guardrails:** All agents attach a Bedrock Guardrail (`CfnGuardrail`) with PII anonymize/block + `PROMPT_ATTACK` filter.

---

## Orchestration Model

**Supervisor:** **ControlTower** (Nova Pro) is the Bedrock **multi-agent collaboration supervisor**. It owns cross-standard governance clauses (4.4, 5.1, 5.3) and routes work to collaborator agents. User-facing advisory routing is delegated to **ComplianceCopilot** (which fans to the 3 Domain Gurus).

**Event backbone:** Event-driven via **EventBridge** (custom bus) → **SQS** (per-agent queues, FIFO where ordering matters, each with a DLQ). Domain mutations in RDS/DynamoDB emit domain events onto the bus; rules fan events to the owning agent's queue; an invoker Lambda calls the Bedrock agent (`InvokeAgent`) with the event as session input.

**Sequential chains:**
- `NCTriage → CAPAGuru → RecordsVault` (nonconformity intake → corrective action → sealed evidence).
- `LeadAuditor → (findings) → CAPAGuru` (audit findings become corrective actions).
- `HazardScout → RiskSentinel → CAPAGuru` (hazard → risk assessment → corrective action).
- `AspectWarden → RiskSentinel` (environmental aspect significance → risk register).

**Parallel fan-out:**
- **ReviewOrchestrator** gathers ISO 9.3.2 management-review inputs from many agents **in parallel** (fan-out → gather).
- **LeadAuditor** fans out **checklist generation** across clauses/standards in parallel.

**HITL gate:** Mutating agents (marked below) pause with `returnControl`; the orchestrator surfaces the proposed change to the mapped human role and resumes on approval. All resumed actions write an append-only event to the DynamoDB audit mirror and the S3 sealed archive.

---

# EXISTING AGENTS (built — PHASE-14)

---

## 1. ControlTower

- **Status:** Built.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Role:** SUPERVISOR / orchestrator (Bedrock multi-agent collaboration).
- **Trigger:** Event-driven (EventBridge cross-standard governance events) + delegated user requests requiring multi-module coordination. Also invoked to open/route management-review and cross-standard change workflows.
- **Tools / action groups (Lambda):**
  - `ct-route-task` → inspects domain event, selects collaborator agent(s), invokes via `InvokeAgent`.
  - `ct-governance-write` → writes cross-standard governance records (QMS/EMS/OH&S process ownership, roles/authorities matrix) to **RDS PostgreSQL**; surfaces to UI via AppSync mutation `publishAgentMessage` (**`@aws_iam`**).
  - `ct-audit-emit` → appends orchestration decisions to **DynamoDB** audit mirror (idempotent `attribute_not_exists(pk)`) and S3 sealed archive.
- **Knowledge base sources:** `ISO-KB` (cross-standard clause governance), `TENANT-DOCS-KB` (org context/roles). **AOSS retrieval requires 45 s cold-start timeout budget + exponential-backoff retry.**
- **Output format:** JSON routing decision + orchestration trace; governance records as structured JSON persisted to RDS.
- **Handoff target:** Any collaborator agent (dynamic); returns aggregated result to caller.
- **HITL:** Required for `ct-governance-write` (mutating) — Executive or Quality/EHS Manager approval via `returnControl`.
- **ISO clauses covered:** ISO 9001 **4.4 QMS and its processes**, **5.1 Leadership and commitment**, **5.3 Organizational roles, responsibilities and authorities**; equivalent ISO 14001 **4.4 / 5.1 / 5.3** and ISO 45001 **4.4 / 5.1 / 5.3** (cross-standard governance).

---

## 2. DocStudio

- **Status:** Built.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M1 Document Studio.
- **Trigger:** User (author/revise document) + event (policy/scope change requiring document update).
- **Tools / action groups (Lambda):**
  - `doc-draft` → drafts manual/procedure/work-instruction; reads `ISO-KB` + `TENANT-DOCS-KB`.
  - `doc-version-control` → writes document metadata, version, approval state, controlled-distribution list to **RDS PostgreSQL**; stores the controlled document file to **S3 (Object Lock COMPLIANCE)**.
  - `doc-publish` → AppSync mutation `publishAgentMessage` (**`@aws_iam`**) to notify subscribers; subscription is **`@aws_cognito`** (tenant-claim verified).
- **Knowledge base sources:** `ISO-KB`, `TENANT-DOCS-KB` (Titan v2, 1536-dim). **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Structured document draft (Markdown/DOCX payload) + version-control JSON record.
- **Handoff target:** RecordsVault (retention/control of the controlled copy); ControlTower on policy/scope changes.
- **HITL:** Required for approval/publish transitions (mutating) — Quality Manager (and EHS Manager for 14001/45001 policy) approval via `returnControl`.
- **ISO clauses covered (all 3 standards):** **4.3 Determining the scope** (of QMS/EMS/OH&S MS); **5.2 Policy** (5.2.1 establishing, 5.2.2 communicating — quality / environmental / OH&S policy); **7.5 Documented information** (7.5.1 general, 7.5.2 creating and updating, 7.5.3 control of documented information).

---

## 3. LeadAuditor

- **Status:** Built.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M3 Audit Studio.
- **Trigger:** Schedule (audit programme calendar via EventBridge cron) + user (launch audit / generate checklist).
- **Tools / action groups (Lambda):**
  - `audit-programme` → creates/reads audit programme in **RDS PostgreSQL**.
  - `audit-checklist-gen` → **parallel fan-out** checklist generation per clause/standard; reads `ISO-KB` + `TENANT-DOCS-KB`.
  - `audit-finding-write` → records findings, readiness score to **RDS**; emits finding events to EventBridge → CAPAGuru.
- **Knowledge base sources:** `ISO-KB` (audit criteria per clause), `TENANT-DOCS-KB` (auditee evidence). **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Audit programme JSON; checklists (structured); findings + readiness score JSON.
- **Handoff target:** **CAPAGuru** (findings → corrective action chain).
- **HITL:** Required for finding/readiness writes that change audit record of truth — Auditor/Quality Manager approval via `returnControl`.
- **ISO clauses covered (all 3):** **9.2 Internal audit** — ISO 9001 9.2; ISO 14001 9.2 (9.2.1 general, 9.2.2 internal audit programme); ISO 45001 9.2 (9.2.1 general, 9.2.2 internal audit programme).

---

## 4. CAPAGuru

- **Status:** Built.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M2 CAPA.
- **Trigger:** Event (nonconformity/finding/incident from NCTriage, LeadAuditor, IncidentInvestigator, RiskSentinel) + user.
- **Tools / action groups (Lambda):**
  - `capa-open` → creates CAPA record (nonconformity, root cause, containment) in **RDS PostgreSQL**.
  - `capa-rootcause` → structured root-cause analysis; reads `TENANT-DOCS-KB` + related records.
  - `capa-verify-effectiveness` → records effectiveness-verification outcome to **RDS**.
  - `capa-audit-emit` → append to **DynamoDB** audit mirror + hand evidence to RecordsVault.
- **Knowledge base sources:** `ISO-KB` (nonconformity/corrective-action requirements), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** CAPA record JSON (root cause, actions, owner, due, effectiveness).
- **Handoff target:** **RecordsVault** (seal evidence).
- **HITL:** Required (mutating CAPA lifecycle) — Quality Manager (9001) / EHS Manager (14001/45001) approval via `returnControl`.
- **ISO clauses covered:** ISO 9001 **8.7 Control of nonconforming outputs**; **10.2 Nonconformity and corrective action** — ISO 9001 10.2 & ISO 14001 10.2; ISO 45001 **10.2 Incident, nonconformity and corrective action** (45001 adds "Incident").

---

## 5. RecordsVault

- **Status:** Built.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns modules:** M4 Records Management, M13 Competence & Training (records custody).
- **Trigger:** Event (records/evidence sealing requests from CAPAGuru, DocStudio, CompetenceKeeper, and any agent producing evidence).
- **Tools / action groups (Lambda):**
  - `records-retain` → writes retention/control metadata to **RDS PostgreSQL**; stores evidence to **S3 Object Lock COMPLIANCE (WORM)**.
  - `records-calibration` → stores monitoring & measuring resource / calibration records (9001) in **RDS** + S3.
  - `records-audit-append` → **append-only immutable audit-event** write to **DynamoDB** mirror (idempotent) + sealed S3 audit archive.
- **Knowledge base sources:** `TENANT-DOCS-KB` for retrieval/linking. **AOSS reads require 45 s cold-start timeout + exponential backoff.** (Audit-trail retrieval also served from AOSS.)
- **Output format:** Sealed-record receipt JSON (S3 object-lock ref, retention date, audit event id).
- **Handoff target:** Terminal for evidence chains; returns receipt to caller.
- **HITL:** Not required for append-only sealing (WORM by design); retention-schedule changes are mutating → Quality Manager approval via `returnControl`.
- **ISO clauses covered:** **7.5 Documented information** (retention/control, all 3); ISO 9001 **7.1.5 Monitoring and measuring resources** (7.1.5.1 general, 7.1.5.2 measurement traceability [calibration]); **7.2 Competence** and **7.3 Awareness** (records custody, all 3).

---

## 6. ISO9001 Domain Guru

- **Status:** Built.
- **Bedrock model:** Claude Sonnet 4.6 — `us.anthropic.claude-sonnet-4-6` (cross-region; not in-region us-east-1).
- **Role:** Advisory (Q&A), read-only.
- **Trigger:** User (routed from ComplianceCopilot).
- **Tools / action groups:** None mutating. `guru-retrieve-9001` → retrieval-only over `ISO-KB` (9001 partition) + `TENANT-DOCS-KB`.
- **Knowledge base sources:** `ISO-KB` (ISO 9001:2015 full text, Titan v2 1536-dim), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Cited advisory answer (clause number + title referenced verbatim).
- **Handoff target:** Returns to ComplianceCopilot / user.
- **HITL:** Not applicable (read-only).
- **ISO clauses covered:** All ISO 9001:2015 clauses **4–10** (advisory Q&A), e.g. 4.1, 6.1, 8.5.1, 9.1.2 customer satisfaction, 10.2.

---

## 7. ISO14001 Domain Guru

- **Status:** Built.
- **Bedrock model:** Claude Sonnet 4.6 — `us.anthropic.claude-sonnet-4-6`.
- **Role:** Advisory (Q&A), read-only.
- **Trigger:** User (routed from ComplianceCopilot).
- **Tools / action groups:** `guru-retrieve-14001` → retrieval-only over `ISO-KB` (14001 partition) + `TENANT-DOCS-KB`.
- **Knowledge base sources:** `ISO-KB` (ISO 14001:2015 full text), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Cited advisory answer (clause number + title verbatim; environmental terminology — aspects/impacts/compliance obligations).
- **Handoff target:** Returns to ComplianceCopilot / user.
- **HITL:** Not applicable (read-only).
- **ISO clauses covered:** All ISO 14001:2015 clauses **4–10** (advisory), e.g. 6.1.2 environmental aspects, 6.1.3 compliance obligations, 8.2 emergency preparedness and response, 9.1.2 evaluation of compliance.

---

## 8. ISO45001 Domain Guru

- **Status:** Built.
- **Bedrock model:** Claude Sonnet 4.6 — `us.anthropic.claude-sonnet-4-6`.
- **Role:** Advisory (Q&A), read-only.
- **Trigger:** User (routed from ComplianceCopilot).
- **Tools / action groups:** `guru-retrieve-45001` → retrieval-only over `ISO-KB` (45001 partition) + `TENANT-DOCS-KB`.
- **Knowledge base sources:** `ISO-KB` (ISO 45001:2018 full text), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Cited advisory answer (clause number + title verbatim; OH&S terminology — hazards/workers/incidents).
- **Handoff target:** Returns to ComplianceCopilot / user.
- **HITL:** Not applicable (read-only).
- **ISO clauses covered:** All ISO 45001:2018 clauses **4–10** (advisory), e.g. 5.4 consultation and participation of workers, 6.1.2.1 hazard identification, 8.1.2 eliminating hazards and reducing OH&S risks, 10.2 incident, nonconformity and corrective action.

---

# NEW AGENTS (roadmap)

---

## 9. RiskSentinel

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M5 Risk Management.
- **Trigger:** Event (aspect significance from AspectWarden, hazard from HazardScout, change requests) + user (risk register review). Hosts cross-register risk view.
- **Tools / action groups (Lambda):**
  - `risk-assess` → creates/updates risk & opportunity entries in **RDS PostgreSQL** (risk-based thinking, likelihood/consequence).
  - `risk-change-plan` → records change-planning entries (9001 6.3 / 45001 8.1.3 MOC) to **RDS**.
  - `risk-cache-refresh` → refreshes hot cross-register risk view in **ElastiCache (Redis)**.
- **Knowledge base sources:** `ISO-KB` (6.1 requirements, all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Risk register entry JSON (risk/opportunity, rating, treatment, owner).
- **Handoff target:** **CAPAGuru** (treatment as corrective action) per chains `HazardScout→RiskSentinel→CAPAGuru` and `AspectWarden→RiskSentinel`.
- **HITL:** Required (mutating register) — Quality Manager / EHS Manager approval via `returnControl`.
- **ISO clauses covered:** **6.1 Actions to address risks and opportunities** (ISO 9001 6.1, ISO 14001 6.1.1/6.1.4, ISO 45001 6.1.1/6.1.4 — all 3); ISO 9001 **6.3 Planning of changes** (cross-referenced with ISO 45001 8.1.3 management of change).

---

## 10. AspectWarden

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M9 Environmental Management (EnviroStudio).
- **Trigger:** Event (process/operational change, new activity) + schedule (periodic aspect review) + user.
- **Tools / action groups (Lambda):**
  - `aspect-register` → identifies environmental aspects/impacts and scores significance in **RDS PostgreSQL**.
  - `aspect-op-control` → records operational controls (14001 8.1) to **RDS**.
  - `aspect-monitor` → logs monitoring data (waste/emissions/energy/water) to **RDS**; surfaces via AppSync `publishAgentMessage` (**`@aws_iam`**).
- **Knowledge base sources:** `ISO-KB` (14001 aspects/operational control), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Aspect/impact register entry JSON (significance rating, controls, monitoring metrics).
- **Handoff target:** **RiskSentinel** (significant aspects → risk register); EmergencyPlanner for aspects tied to emergency scenarios.
- **HITL:** Required (mutating aspect register / significance determination) — EHS Manager approval via `returnControl`.
- **ISO clauses covered (ISO 14001 only):** **6.1.2 Environmental aspects**; **8.1 Operational planning and control**; **9.1.1 Monitoring, measurement, analysis and evaluation (general)** — environmental (waste/emissions/energy/water).

---

## 11. HazardScout

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M10 Safety Operations (OH&S/EHS Ops).
- **Trigger:** Event (new task/activity, MOC, worker-reported hazard) + user (hazard walk).
- **Tools / action groups (Lambda):**
  - `hazard-identify` → records hazard identification entries in **RDS PostgreSQL**.
  - `hazard-risk-assess` → assesses OH&S risk and prescribes **hierarchy of controls** (elimination → substitution → engineering → administrative → PPE) to **RDS**.
  - `hazard-cache-refresh` → hot hazard register in **ElastiCache (Redis)**.
- **Knowledge base sources:** `ISO-KB` (45001 6.1.2 / 8.1.2), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Hazard register entry JSON (hazard, OH&S risk rating, control per hierarchy).
- **Handoff target:** **RiskSentinel** (chain `HazardScout→RiskSentinel→CAPAGuru`); WorkerVoice for consultation on controls.
- **HITL:** Required (mutating hazard register / control decisions) — EHS Manager approval via `returnControl`.
- **ISO clauses covered (ISO 45001 only):** **6.1.2 Hazard identification and assessment of risks and opportunities** (6.1.2.1 hazard identification, 6.1.2.2 assessment of OH&S risks and other risks, 6.1.2.3 assessment of OH&S opportunities); **8.1.2 Eliminating hazards and reducing OH&S risks** (hierarchy of controls).

---

## 12. IncidentInvestigator

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns modules:** M2 CAPA, M10 Safety Operations.
- **Trigger:** Event (reported OH&S incident / environmental incident) + user.
- **Tools / action groups (Lambda):**
  - `incident-intake` → creates incident record in **RDS PostgreSQL** (type, severity, affected workers/environment).
  - `incident-investigate` → structured investigation + causal analysis; reads `TENANT-DOCS-KB`.
  - `incident-audit-emit` → append to **DynamoDB** audit mirror.
- **Knowledge base sources:** `ISO-KB` (45001 10.2 / 14001 10.2), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Incident investigation JSON (timeline, causes, immediate actions).
- **Handoff target:** **CAPAGuru** (corrective action) → RecordsVault (seal).
- **HITL:** Required (mutating incident record) — EHS Manager approval via `returnControl`.
- **ISO clauses covered:** ISO 45001 **10.2 Incident, nonconformity and corrective action** (incident focus); ISO 14001 **10.2 Nonconformity and corrective action** (environmental incidents).

---

## 13. LegalLedger

- **Status:** Roadmap.
- **Bedrock model:** Claude Sonnet 4.6 — `us.anthropic.claude-sonnet-4-6` (cross-region).
- **Owns module:** M8 Compliance Obligations Register (Legal Register).
- **Trigger:** Event (regulatory change ingest, new activity) + schedule (periodic compliance evaluation via EventBridge cron) + user.
- **Tools / action groups (Lambda):**
  - `legal-register-write` → creates/updates compliance obligations / legal & other requirements in **RDS PostgreSQL**.
  - `compliance-evaluate` → records evaluation-of-compliance outcomes to **RDS**.
  - `legal-cache-refresh` → hot legal register in **ElastiCache (Redis)**.
- **Knowledge base sources:** `ISO-KB` (14001 6.1.3 / 45001 6.1.3 / 9.1.2), `TENANT-DOCS-KB` (tenant obligations). **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Obligation register entry JSON (requirement, applicability, compliance status, evaluation date).
- **Handoff target:** RiskSentinel (non-compliance → risk); CAPAGuru (non-compliance → corrective action); ReviewOrchestrator (compliance status → 9.3.2 inputs).
- **HITL:** Required (mutating legal register / compliance determination) — Quality Manager / EHS Manager approval via `returnControl`.
- **ISO clauses covered:** ISO 14001 **6.1.3 Compliance obligations**; ISO 45001 **6.1.3 Determination of legal requirements and other requirements**; **9.1.2 Evaluation of compliance** (ISO 14001 9.1.2 & ISO 45001 9.1.2).

---

## 14. ObjectiveTracker

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M7 Objectives & Targets.
- **Trigger:** Event (objective/KPI update) + schedule (progress rollup via EventBridge cron) + user.
- **Tools / action groups (Lambda):**
  - `objective-write` → creates/updates objectives, programmes, KPIs (owner/due/progress) in **RDS PostgreSQL**.
  - `objective-progress` → computes progress; links to 9.1.1 monitoring data.
  - `objective-cache-refresh` → objectives dashboard in **ElastiCache (Redis)**; surfaces via AppSync `publishAgentMessage` (**`@aws_iam`**).
- **Knowledge base sources:** `ISO-KB` (6.2 all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Objective/KPI JSON (target, owner, due, progress %).
- **Handoff target:** ReviewOrchestrator (objective performance → 9.3.2 inputs).
- **HITL:** Required (mutating objective targets) — Quality Manager / EHS Manager / Executive approval via `returnControl`.
- **ISO clauses covered (all 3):** **6.2 Objectives and planning to achieve them** — ISO 9001 6.2 (6.2.1, 6.2.2), ISO 14001 6.2 (6.2.1, 6.2.2), ISO 45001 6.2 (6.2.1, 6.2.2); linked to **9.1.1 Monitoring (general)** for measurement.

---

## 15. ReviewOrchestrator

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Owns module:** M11 Management Review.
- **Trigger:** Schedule (management-review cadence via EventBridge cron) + user (convene review).
- **Tools / action groups (Lambda):**
  - `mr-gather-inputs` → **parallel fan-out**: collects 9.3.2 inputs (audit results, compliance status, objectives progress, NC/CAPA status, risks, incidents) from LeadAuditor, LegalLedger, ObjectiveTracker, CAPAGuru, RiskSentinel, IncidentInvestigator concurrently; aggregates into **RDS PostgreSQL**.
  - `mr-record-outputs` → records 9.3.3 outputs, minutes, action items to **RDS**.
  - `mr-audit-emit` → append to **DynamoDB** audit mirror.
- **Knowledge base sources:** `ISO-KB` (9.3 all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Management review pack JSON (inputs matrix, decisions/outputs, action items with owner/due).
- **Handoff target:** ObjectiveTracker & RiskSentinel (review-driven changes); RecordsVault (seal minutes).
- **HITL:** Required (mutating review record / decisions) — Executive / Quality Manager / EHS Manager approval via `returnControl`.
- **ISO clauses covered (all 3):** **9.3 Management review** — ISO 9001 9.3 (9.3.1 general, 9.3.2 inputs, 9.3.3 outputs), ISO 14001 9.3, ISO 45001 9.3.

---

## 16. ContextCartographer

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M6 Context & Stakeholder Studio.
- **Trigger:** Event (org/context change) + schedule (periodic context review) + user.
- **Tools / action groups (Lambda):**
  - `context-write` → records internal/external issues (4.1) and interested parties/workers + needs/expectations (4.2) to **RDS PostgreSQL**; provides scope inputs (4.3) to DocStudio.
  - `comms-plan-write` → records communication plan (7.4, all 3) to **RDS**.
  - `context-publish` → AppSync `publishAgentMessage` (**`@aws_iam`**); subscription **`@aws_cognito`** (tenant-claim verified).
- **Knowledge base sources:** `ISO-KB` (4.1/4.2/7.4 all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Context register JSON (issues, interested parties, needs, communication matrix).
- **Handoff target:** DocStudio (4.3 scope inputs); ControlTower (5.1/5.3 leadership & roles feed).
- **HITL:** Required (mutating context/interested-parties register) — Quality Manager / EHS Manager approval via `returnControl`.
- **ISO clauses covered (all 3):** **4.1 Understanding the organization and its context**; **4.2 Understanding the needs and expectations of interested parties/workers**; **7.4 Communication** (incl. 14001/45001 7.4.1/7.4.2/7.4.3). (Feeds 4.3 scope, 5.1/5.3 leadership & roles.)

---

## 17. SupplierScout

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M12 Supplier & External Provider Management.
- **Trigger:** Event (new supplier, re-evaluation due) + schedule (periodic supplier evaluation cron) + user.
- **Tools / action groups (Lambda):**
  - `supplier-evaluate` → creates/updates external-provider evaluations, approved-supplier list in **RDS PostgreSQL**.
  - `supplier-monitor` → records ongoing performance monitoring to **RDS**.
  - `supplier-cache-refresh` → approved-supplier list in **ElastiCache (Redis)**.
- **Knowledge base sources:** `ISO-KB` (8.4 / procurement clauses), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Supplier evaluation JSON (approval status, criteria, controls, monitoring result).
- **Handoff target:** HazardScout / AspectWarden (contractor OH&S/environmental controls); CAPAGuru (supplier nonconformity).
- **HITL:** Required (mutating approved-supplier list) — Quality Manager (9001) / EHS Manager (45001 contractors) approval via `returnControl`.
- **ISO clauses covered:** ISO 9001 **8.4 Control of externally provided processes, products and services** (8.4.1 general, 8.4.2 type and extent of control, 8.4.3 information for external providers); ISO 14001 **8.1 Operational planning and control** (outsourced processes); ISO 45001 **8.1.4 Procurement** (8.1.4.1 general, 8.1.4.2 contractors, 8.1.4.3 outsourcing).

---

## 18. CompetenceKeeper

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M13 Competence & Training.
- **Trigger:** Event (role/competence gap, new hire) + schedule (expiry/renewal sweep via EventBridge cron) + user.
- **Tools / action groups (Lambda):**
  - `competence-write` → records competence requirements, training records, expiry, verification in **RDS PostgreSQL**.
  - `awareness-track` → records awareness activities (7.3) to **RDS**.
  - `competence-expiry-notify` → AppSync `publishAgentMessage` (**`@aws_iam`**) on expiries; subscription **`@aws_cognito`**.
- **Knowledge base sources:** `ISO-KB` (7.2/7.3 all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Competence/training record JSON (requirement, evidence, expiry, verification status).
- **Handoff target:** **RecordsVault** (seal training records / M13 custody).
- **HITL:** Required (mutating competence record / verification) — Quality Manager / EHS Manager approval via `returnControl`.
- **ISO clauses covered (all 3):** **7.2 Competence**; **7.3 Awareness** — ISO 9001, ISO 14001, ISO 45001.

---

## 19. EmergencyPlanner

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns modules:** M9 Environmental Management, M10 Safety Operations.
- **Trigger:** Event (new emergency scenario, aspect/hazard tied to emergency) + schedule (drill cadence via EventBridge cron) + user.
- **Tools / action groups (Lambda):**
  - `emergency-plan-write` → creates/updates emergency preparedness & response plans in **RDS PostgreSQL** (environmental and OH&S scenarios kept distinct).
  - `drill-log` → records drills/tests and outcomes to **RDS**.
  - `emergency-audit-emit` → append to **DynamoDB** audit mirror.
- **Knowledge base sources:** `ISO-KB` (14001 8.2 / 45001 8.2), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Emergency plan JSON (scenario, response steps, roles, drill schedule/results).
- **Handoff target:** AspectWarden (environmental scenarios), HazardScout (OH&S scenarios); RecordsVault (seal drill records).
- **HITL:** Required (mutating emergency plan) — EHS Manager approval via `returnControl`.
- **ISO clauses covered:** ISO 14001 **8.2 Emergency preparedness and response**; ISO 45001 **8.2 Emergency preparedness and response**.

---

## 20. WorkerVoice

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M10 Safety Operations.
- **Trigger:** Event (control decision requiring consultation, worker submission) + user (worker/EHS Manager).
- **Tools / action groups (Lambda):**
  - `consultation-record` → records worker consultation & participation events, inputs, responses in **RDS PostgreSQL**.
  - `participation-route` → routes worker input to HazardScout / IncidentInvestigator.
  - `worker-notify` → AppSync `publishAgentMessage` (**`@aws_iam`**); subscription **`@aws_cognito`** (Employee/worker-facing, tenant-claim verified).
- **Knowledge base sources:** `ISO-KB` (45001 5.4), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Consultation record JSON (topic, participants, input, disposition).
- **Handoff target:** HazardScout (control consultation), IncidentInvestigator (worker-reported incidents).
- **HITL:** Required (mutating consultation record / disposition) — EHS Manager approval via `returnControl`.
- **ISO clauses covered (ISO 45001 only, UNIQUE to 45001):** **5.4 Consultation and participation of workers**.

---

## 21. NCTriage

- **Status:** Roadmap.
- **Bedrock model:** Nova Lite — `us.amazon.nova-lite-v1:0`.
- **Owns module:** M2 CAPA (intake stage).
- **Trigger:** Event (nonconforming output detected, NC reported) + user.
- **Tools / action groups (Lambda):**
  - `nc-triage` → classifies/prioritizes nonconformity; creates triage record in **RDS PostgreSQL**.
  - `nc-route` → emits EventBridge event to CAPAGuru queue (SQS).
  - `nc-audit-emit` → append to **DynamoDB** audit mirror.
- **Knowledge base sources:** `ISO-KB` (8.7 / 10.2 all 3), `TENANT-DOCS-KB`. **AOSS reads require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Triage JSON (severity, category, disposition of nonconforming output, routing decision).
- **Handoff target:** **CAPAGuru** (chain `NCTriage→CAPAGuru→RecordsVault`).
- **HITL:** Required for disposition of nonconforming output (mutating) — Quality Manager approval via `returnControl`; low-severity auto-route may proceed without HITL per tenant policy.
- **ISO clauses covered:** ISO 9001 **8.7 Control of nonconforming outputs**; **10.2 Nonconformity and corrective action** (ISO 9001 10.2, ISO 14001 10.2, ISO 45001 10.2 — all 3, triage stage). Feeds CAPAGuru.

---

## 22. ComplianceCopilot

- **Status:** Roadmap.
- **Bedrock model:** Nova Pro — `us.amazon.nova-pro-v1:0`.
- **Role:** User-facing router (advisory).
- **Trigger:** User (natural-language compliance question from the app).
- **Tools / action groups (Lambda):**
  - `copilot-route` → detects standard/clause intent and routes to **ISO9001 / ISO14001 / ISO45001 Domain Guru** (`InvokeAgent`); read-only.
  - `copilot-session` → reads/writes chat session state in **DynamoDB** (`CumplifyCore`, session items; rate-limit + idempotency); this is session metadata only, not compliance state.
- **Knowledge base sources:** Delegates KB retrieval to the 3 Domain Gurus over `ISO-KB` + `TENANT-DOCS-KB`. **AOSS reads (by the Gurus) require 45 s cold-start timeout + exponential backoff.**
- **Output format:** Routed, cited advisory answer (surfaces the Guru's clause-cited response) to the user.
- **Handoff target:** ISO9001 Domain Guru / ISO14001 Domain Guru / ISO45001 Domain Guru; returns to user.
- **HITL:** Not applicable (advisory/read-only; session writes are non-compliance metadata).
- **ISO clauses covered:** All clauses of all 3 standards **4–10** (advisory routing surface), delegated to the Domain Gurus (e.g. 9001 8.5.1, 14001 6.1.2, 45001 6.1.2.1).

---

## Coverage Assertion

- **22 / 22 agents** each map to ≥1 real, correctly-titled ISO clause (no invented clause numbers).
- **Standards kept distinct:** 9001 = product/service conformity & customer; 14001 = environmental aspects/impacts/compliance obligations; 45001 = hazards/workers/incidents (5.4 and "Incident" in 10.2 are 45001-unique).
- **Every AOSS-reading agent** restates the 45-second cold-start timeout budget + exponential-backoff retry.
- **Every UI-surfacing mutation/subscription** states auth mode (`@aws_iam` publish / `@aws_cognito` subscribe with tenant-claim verification).
- **Every mutating agent** carries a `returnControl` HITL gate mapped to an authorized Cognito role; read-only advisory agents (Domain Gurus, ComplianceCopilot) do not.
- **No AWS services** are introduced outside the verified stack (Bedrock, AppSync, Lambda, RDS PostgreSQL, DynamoDB, OpenSearch Serverless, ElastiCache, S3+Object Lock, EventBridge, SQS, Cognito, KMS, CloudFront).
