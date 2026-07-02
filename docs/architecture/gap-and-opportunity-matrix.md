# Cumplify.ai — Gap & Opportunity Matrix

**Version:** 1.0
**Date:** 2026-06-30
**Audience:** Senior AWS engineer + product/GTM leadership (handoff document)
**Purpose:** Clause-by-clause competitive gap analysis of CertifyAero (single-standard 9001/AS9100 QMS) versus the Cumplify.ai tri-standard Integrated Management System (IMS). Every gap is mapped to the exact Annex SL clause, the Cumplify module (M1–M13) that owns it, and the Bedrock agent that fills it.

---

## 0. Method & Legend

**Coverage rating (CertifyAero, observed from certifyaero.com, read-only):**

| Rating | Meaning |
|---|---|
| **COVERED** | CertifyAero has a purpose-built module addressing the clause substantively (for 9001/AS9100 only). |
| **PARTIAL** | CertifyAero touches the clause via its document generator or chat assistant, but only produces static artifacts (no lifecycle, no closure loop, no verification, no immutable trail). |
| **MISSING** | No coverage whatsoever. For ISO 14001 and ISO 45001 this is **structural**: CertifyAero is single-standard (9001 + AS9100D only) and has ZERO environmental and ZERO OH&S capability — the entire 14001 and 45001 clause sets are green-field. |

**Key structural facts driving the analysis:**

- CertifyAero's "AI" is a **client-side** document generator + chat assistant (Anthropic Claude called from the browser). It **drafts** but does not **detect → route → verify → close**, and it holds **no immutable audit trail**.
- Cumplify's differentiation is threefold and applies to *every* row below: **(1)** true Integrated Management System across Quality (9001) + Environmental (14001) + OH&S (45001); **(2)** a genuinely agentic AWS-Bedrock backend (detect → draft → route → verify → close) with **immutable append-only audit trail** (M4 Records Management, DynamoDB append-only mirror + S3 Object Lock COMPLIANCE-mode sealed archive); **(3)** enterprise multi-tenancy (Cognito 3 pools, DynamoDB IAM LeadingKeys tenant isolation, RDS system-of-record).
- Wherever a Cumplify agent reads OpenSearch Serverless (AOSS VECTORSEARCH — Bedrock KB, semantic doc search, audit retrieval), the design **MUST** implement application-side retry with **exponential backoff and a minimum 45-second cold-start timeout budget** (NextGen scale-to-zero cold start up to 45s). This applies to DocStudio, LeadAuditor, the three Domain Gurus, LegalLedger, and ComplianceCopilot in particular.

---

## 1. ISO 9001:2015 — QUALITY (product/service conformity, customer)

CertifyAero's home turf. Most clauses are COVERED or PARTIAL. Cumplify does not "win" here by presence — it wins by **agentic lifecycle + immutable audit trail + cross-standard reuse** of the same context/leadership/support artifacts.

| Clause | CertifyAero coverage | Evidence / rationale | Cumplify.ai differentiation (module + agent) |
|---|---|---|---|
| **4.1** Understanding the organization and its context | PARTIAL | Doc generator can draft a context statement; no living register, no interested-party linkage. | **M6 Context & Stakeholder Studio** / **ContextCartographer** (Nova Lite). Living context register reused across all 3 standards. |
| **4.2** Understanding the needs and expectations of interested parties | PARTIAL | Static text only; no stakeholder register with requirements tracking. | **M6** / **ContextCartographer**. Interested-party register feeds 4.3 scope and 7.4 communication. |
| **4.3** Determining the scope of the QMS | COVERED | Scope statement is a core generated document. | **M1 Document Studio** / **DocStudio** (Nova Pro). Controlled, versioned, approved scope; single scope shared across IMS. |
| **4.4** QMS and its processes | PARTIAL | Process narrative can be drafted; no process-interaction model or governance. | **M1** / **DocStudio**; cross-standard governance by **ControlTower** (Nova Pro supervisor). |
| **5.1** Leadership and commitment (5.1.1 general, 5.1.2 customer focus) | PARTIAL | Policy/commitment language drafted; no roles-to-clause governance. | **M6** / **ControlTower** (owns 4.4, 5.1, 5.3 cross-standard governance). |
| **5.2** Policy (5.2.1 establishing, 5.2.2 communicating the quality policy) | COVERED | Quality-policy generation is a flagship feature. | **M1** / **DocStudio** (owns 5.2 all standards). Controlled distribution + acknowledgement. |
| **5.3** Organizational roles, responsibilities and authorities | PARTIAL | Org/responsibility text drafted; not tied to Cognito roles or ABAC. | **M6** / **ControlTower**. Roles map to Cognito groups (Quality Manager, EHS Manager, Auditor, Employee, Executive). |
| **6.1** Actions to address risks and opportunities | PARTIAL | Risk register can be drafted; no scoring, no linkage to CAPA/audit. | **M5 Risk Management** / **RiskSentinel** (Nova Pro). Cross-register risk view; risk-based thinking. |
| **6.2** Quality objectives and planning to achieve them | PARTIAL | Objectives listed as text; no KPI tracking, owner/due/progress. | **M7 Objectives & Targets** / **ObjectiveTracker** (Nova Lite). KPIs with owner/due/progress → 9.1.1. |
| **6.3** Planning of changes | MISSING | No change-planning workflow observed. | **M5** / **RiskSentinel** (owns 6.3 for 9001). |
| **7.1.1–7.1.4** Resources (general/people/infrastructure/environment) | PARTIAL | Resource narrative drafted; no records. | **M4 Records Management** / **RecordsVault** (Nova Lite). |
| **7.1.5** Monitoring and measuring resources (7.1.5.1 general, 7.1.5.2 measurement traceability / calibration) | PARTIAL | May reference calibration; no calibration record register with due/traceability. | **M4** / **RecordsVault** (owns 7.1.5 calibration records). Immutable calibration evidence. |
| **7.1.6** Organizational knowledge | MISSING | Not addressed as a managed artifact. | **M13 Competence & Training** / **CompetenceKeeper** (Nova Lite) + KB retention. |
| **7.2** Competence | PARTIAL | Training text drafted; no competency verification or expiry. | **M13** / **CompetenceKeeper**. Competency verification, expiry tracking. |
| **7.3** Awareness | PARTIAL | Awareness statements drafted. | **M13** / **CompetenceKeeper**. |
| **7.4** Communication | PARTIAL | Static communication plan text. | **M6** / **ContextCartographer** (owns 7.4). |
| **7.5** Documented information (7.5.1–7.5.3) | COVERED | Document control is CertifyAero's core strength — but produces artifacts, not a controlled lifecycle with immutable history. | **M1** / **DocStudio** + **M4** / **RecordsVault**. Version/approval/controlled distribution + **immutable append-only audit trail**. |
| **8.1** Operational planning and control | PARTIAL | Operational plan drafted as text. | **M1** / **DocStudio**; cross-standard by **ControlTower**. |
| **8.2** Requirements for products and services (8.2.1–8.2.4) | COVERED | Customer-facing requirements/review is aerospace-core. | **M1** / **DocStudio**. |
| **8.3** Design and development (8.3.1–8.3.6) | COVERED | Design control is central to AS9100 aerospace. | **M1** / **DocStudio** (controlled design records). |
| **8.4** Control of externally provided processes, products and services (8.4.1–8.4.3) | PARTIAL | Supplier list/text drafted; no evaluation/monitoring lifecycle. | **M12 Supplier & External Provider Management** / **SupplierScout** (Nova Lite). Evaluation & monitoring. |
| **8.5** Production and service provision (8.5.1–8.5.6) | PARTIAL | Production-control procedures drafted. | **M1** / **DocStudio**. |
| **8.6** Release of products and services | PARTIAL | Release procedure text. | **M1** / **DocStudio** + **M4** / **RecordsVault** (release evidence). |
| **8.7** Control of nonconforming outputs | COVERED | NCR handling is a standard QMS module. | **M2 CAPA** / **CAPAGuru** (Nova Pro) + **NCTriage** (Nova Lite) feeder. Root cause + effectiveness verification + immutable trail. |
| **9.1.1** Monitoring, measurement, analysis and evaluation (general) | PARTIAL | Metrics text; no live dashboards. | **M7** / **ObjectiveTracker**. |
| **9.1.2** Customer satisfaction | PARTIAL | Survey narrative; no analytics loop. | **M7** / **ObjectiveTracker**. |
| **9.1.3** Analysis and evaluation | PARTIAL | Static. | **M7** / **ObjectiveTracker**. |
| **9.2** Internal audit | COVERED | Audit checklists/readiness are a headline feature. | **M3 Audit Studio** / **LeadAuditor** (Nova Pro). Programme, checklists, findings, readiness scoring; findings auto-route to CAPA. |
| **9.3** Management review (9.3.1–9.3.3) | PARTIAL | Management-review template drafted; no structured input aggregation or action tracking. | **M11 Management Review** / **ReviewOrchestrator** (Nova Pro). Parallel fan-out gathers 9.3.2 inputs; 9.3.3 outputs + action items. |
| **10.1** General (improvement) | PARTIAL | Text. | **M2** / **CAPAGuru**. |
| **10.2** Nonconformity and corrective action | COVERED | CAPA is a standard QMS module. | **M2** / **CAPAGuru** (owns 10.2). Detect→draft→route→verify→close + effectiveness verification + immutable trail. |
| **10.3** Continual improvement | PARTIAL | Text. | **M2** / **CAPAGuru** + **M7** / **ObjectiveTracker**. |

**9001 takeaway:** CertifyAero is competent here, but every "COVERED" cell is a *static artifact*. Cumplify converts the same clauses into an **agentic closed loop** (detect → draft → route → verify → close) recorded on an **immutable audit trail** — and reuses the 9001 context/leadership/support artifacts (clauses 4, 5, 7) as the shared spine for 14001 and 45001, which CertifyAero cannot do at all.

---

## 2. ISO 14001:2015 — ENVIRONMENTAL (environmental aspects, impacts, compliance obligations)

**Entirely green-field.** CertifyAero is single-standard (9001 + AS9100D only) with **ZERO** environmental capability. Every clause below is **MISSING**. The evidence column states the structural reason once; the differentiation column is where Cumplify captures 100% of the environmental TAM.

| Clause | CertifyAero coverage | Evidence / rationale | Cumplify.ai differentiation (module + agent) |
|---|---|---|---|
| **4.1** Understanding the organization and its context | MISSING | No 14001 in product; single-standard QMS only. | **M6 Context & Stakeholder Studio** / **ContextCartographer**. Shared context register, environmental lens. |
| **4.2** Understanding the needs and expectations of interested parties | MISSING | No environmental scope. | **M6** / **ContextCartographer**. |
| **4.3** Determining the scope of the EMS | MISSING | No EMS scope concept. | **M1 Document Studio** / **DocStudio**. |
| **4.4** Environmental management system | MISSING | No EMS. | **M1** / **DocStudio**; governance **ControlTower**. |
| **5.1** Leadership and commitment | MISSING | No environmental leadership artifacts. | **M6** / **ControlTower**. |
| **5.2** Environmental policy | MISSING | Only quality policy exists. | **M1** / **DocStudio**. |
| **5.3** Organizational roles, responsibilities and authorities | MISSING | No EHS role model. | **M6** / **ControlTower**. Maps to **EHS Manager** Cognito role. |
| **6.1.1** Actions to address risks and opportunities (general) | MISSING | No environmental risk. | **M5 Risk Management** / **RiskSentinel**. |
| **6.1.2** Environmental aspects | MISSING | No aspects/impacts register — core EMS concept absent. | **M9 Environmental Management (EnviroStudio)** / **AspectWarden** (Nova Pro). Aspect/impact **significance** determination. |
| **6.1.3** Compliance obligations | MISSING | No legal register. | **M8 Compliance Obligations Register (Legal Register)** / **LegalLedger** (Claude Sonnet 4.6). |
| **6.1.4** Planning action | MISSING | — | **M5** / **RiskSentinel**; **AspectWarden→RiskSentinel** chain. |
| **6.2.1 / 6.2.2** Environmental objectives / planning to achieve them | MISSING | No environmental objectives. | **M7 Objectives & Targets** / **ObjectiveTracker**. |
| **7.1** Resources | MISSING | — | **M4** / **RecordsVault**. |
| **7.2** Competence | MISSING | — | **M13** / **CompetenceKeeper**. |
| **7.3** Awareness | MISSING | — | **M13** / **CompetenceKeeper**. |
| **7.4.1–7.4.3** Communication (general / internal / external) | MISSING | No external environmental communication. | **M6** / **ContextCartographer**. |
| **7.5.1–7.5.3** Documented information | MISSING | — | **M1** / **DocStudio** + **M4** / **RecordsVault** (immutable trail). |
| **8.1** Operational planning and control | MISSING | No environmental operational controls. | **M9** / **AspectWarden** (14001 8.1 operational controls). |
| **8.2** Emergency preparedness and response | MISSING | No environmental emergency planning. | **M9** / **EmergencyPlanner** (Nova Lite, owns 14001 8.2). |
| **9.1.1** Monitoring, measurement, analysis and evaluation (general) | MISSING | No waste/emissions/energy/water monitoring. | **M9** / **AspectWarden** (14001 9.1.1 monitoring: waste/emissions/energy/water). |
| **9.1.2** Evaluation of compliance | MISSING | No compliance evaluation. | **M8** / **LegalLedger** (owns 9.1.2 for 14001). |
| **9.2.1 / 9.2.2** Internal audit (general / programme) | MISSING | Audit engine is 9001-only. | **M3** / **LeadAuditor** (all 3 standards). |
| **9.3** Management review | MISSING | — | **M11** / **ReviewOrchestrator**. |
| **10.1** General | MISSING | — | **M2** / **CAPAGuru**. |
| **10.2** Nonconformity and corrective action | MISSING | No environmental NC/CA. | **M2** / **CAPAGuru**; environmental incidents via **IncidentInvestigator** (14001 10.2). |
| **10.3** Continual improvement | MISSING | — | **M2** / **CAPAGuru** + **M7** / **ObjectiveTracker**. |

**14001 takeaway:** 100% green-field. The high-value, standard-specific wins are **6.1.2 environmental aspects/impacts (AspectWarden)**, **6.1.3 + 9.1.2 the legal/compliance register (LegalLedger)**, and **8.1/9.1.1 operational controls + waste/emissions monitoring (AspectWarden)** — none of which exist anywhere in a 9001-only competitor.

---

## 3. ISO 45001:2018 — OCCUPATIONAL HEALTH & SAFETY (hazards, OH&S risks, workers, incidents)

**Entirely green-field.** CertifyAero has **ZERO** OH&S capability. Every clause is **MISSING**. Note the 45001-unique clauses (5.4 worker consultation; 10.2 adds "Incident") — these are the sharpest differentiators because they have no analogue in either 9001 or 14001.

| Clause | CertifyAero coverage | Evidence / rationale | Cumplify.ai differentiation (module + agent) |
|---|---|---|---|
| **4.1** Understanding the organization and its context | MISSING | Single-standard QMS; no OH&S. | **M6** / **ContextCartographer**. |
| **4.2** Understanding the needs and expectations of workers and other interested parties | MISSING | No worker-centric scope. | **M6** / **ContextCartographer**. |
| **4.3** Determining the scope of the OH&S management system | MISSING | No OH&SMS scope. | **M1** / **DocStudio**. |
| **4.4** OH&S management system | MISSING | — | **M1** / **DocStudio**; governance **ControlTower**. |
| **5.1** Leadership and commitment | MISSING | — | **M6** / **ControlTower**. |
| **5.2** OH&S policy | MISSING | Only quality policy exists. | **M1** / **DocStudio**. |
| **5.3** Organizational roles, responsibilities and authorities | MISSING | — | **M6** / **ControlTower** → **EHS Manager** Cognito role. |
| **5.4** Consultation and participation of workers **(UNIQUE to 45001)** | MISSING | No worker-voice mechanism anywhere in competitor. | **M10 Safety Operations (OH&S/EHS Ops)** / **WorkerVoice** (Nova Lite, owns 5.4). No competitor analogue. |
| **6.1.1** Actions to address risks and opportunities (general) | MISSING | — | **M5** / **RiskSentinel**. |
| **6.1.2.1** Hazard identification | MISSING | No hazard register. | **M10** / **HazardScout** (Nova Pro). |
| **6.1.2.2** Assessment of OH&S risks and other risks | MISSING | No OH&S risk assessment. | **M10** / **HazardScout**; **HazardScout→RiskSentinel→CAPAGuru** chain. |
| **6.1.2.3** Assessment of OH&S opportunities and other opportunities | MISSING | — | **M10** / **HazardScout** + **M5** / **RiskSentinel**. |
| **6.1.3** Determination of legal requirements and other requirements | MISSING | No legal register. | **M8** / **LegalLedger** (45001 6.1.3). |
| **6.1.4** Planning action | MISSING | — | **M5** / **RiskSentinel**. |
| **6.2.1 / 6.2.2** OH&S objectives / planning to achieve them | MISSING | — | **M7** / **ObjectiveTracker**. |
| **7.1** Resources | MISSING | — | **M4** / **RecordsVault**. |
| **7.2** Competence | MISSING | — | **M13** / **CompetenceKeeper**. |
| **7.3** Awareness | MISSING | — | **M13** / **CompetenceKeeper**. |
| **7.4.1–7.4.3** Communication (general / internal / external) | MISSING | — | **M6** / **ContextCartographer**. |
| **7.5** Documented information | MISSING | — | **M1** / **DocStudio** + **M4** / **RecordsVault** (immutable trail). |
| **8.1.1** Operational planning and control (general) | MISSING | No OH&S operational controls. | **M10** / **HazardScout**. |
| **8.1.2** Eliminating hazards and reducing OH&S risks (**hierarchy of controls**) | MISSING | No hierarchy-of-controls logic. | **M10** / **HazardScout** (owns 45001 8.1.2). |
| **8.1.3** Management of change | MISSING | No OH&S MOC. | **M10** / **HazardScout** (45001 8.1.3); cross-links **M5** / **RiskSentinel**. |
| **8.1.4.1–8.1.4.3** Procurement (general / contractors / outsourcing) | MISSING | No contractor/outsourcing safety controls. | **M12** / **SupplierScout** (45001 8.1.4) + **M10** / **HazardScout**. |
| **8.2** Emergency preparedness and response | MISSING | — | **M10** / **EmergencyPlanner** (45001 8.2). |
| **9.1.1** Monitoring, measurement, analysis and performance evaluation (general) | MISSING | — | **M7** / **ObjectiveTracker** + **M10** / **HazardScout**. |
| **9.1.2** Evaluation of compliance | MISSING | — | **M8** / **LegalLedger** (9.1.2 for 45001). |
| **9.2.1 / 9.2.2** Internal audit (general / programme) | MISSING | Audit engine is 9001-only. | **M3** / **LeadAuditor** (all 3). |
| **9.3** Management review | MISSING | — | **M11** / **ReviewOrchestrator**. |
| **10.1** General | MISSING | — | **M2** / **CAPAGuru**. |
| **10.2** Incident, nonconformity and corrective action (**45001 adds "Incident"**) | MISSING | No incident investigation. | **M2 CAPA** + **M10** / **IncidentInvestigator** (Nova Pro, owns 45001 10.2) → **CAPAGuru** → **RecordsVault**. |
| **10.3** Continual improvement | MISSING | — | **M2** / **CAPAGuru** + **M7** / **ObjectiveTracker**. |

**45001 takeaway:** 100% green-field, and the 45001-unique clauses — **5.4 worker consultation (WorkerVoice)**, **6.1.2 hazard ID with hierarchy of controls (HazardScout)**, and **10.2 incident investigation (IncidentInvestigator)** — are impossible for a single-standard aerospace-quality competitor to answer without building an entirely new product line.

---

## 4. Top Differentiation Opportunities (ranked)

Ranked by defensibility × market gap × strength of the agentic + IMS + immutable-audit-trail moat. Each includes the concrete AWS mechanism a senior engineer will build against.

### #1 — Whole-of-standard green-field capture: ISO 14001 + ISO 45001 (all clauses 4–10)
**Why it wins:** CertifyAero has ZERO coverage of *two entire standards*. This is not a feature gap — it is a category gap. Cumplify owns 100% of the environmental and OH&S clause set out of the gate (M6–M13; AspectWarden, HazardScout, LegalLedger, ObjectiveTracker, IncidentInvestigator, EmergencyPlanner, WorkerVoice, SupplierScout, CompetenceKeeper).
**Moat:** A single-standard aerospace-QMS competitor cannot follow without rebuilding as an IMS. The three **Domain Gurus** (ISO9001 / ISO14001 / ISO45001, Claude Sonnet 4.6 via `us.anthropic.claude-sonnet-4-6` — in-region us-east-1 unavailable) give authoritative per-standard advisory that a browser chat assistant cannot match.
**AWS mechanism:** RDS PostgreSQL system-of-record hosts the aspects, hazard, and legal registers with rich joins; ElastiCache (Redis) caches the hot legal register + hazard register + objectives dashboard; AOSS VECTORSEARCH (Bedrock KB of ISO standards) serves grounded Q&A — **with mandatory 45-second cold-start timeout budget + exponential-backoff retry on every AOSS read**.

### #2 — Integrated Management System (single spine for clauses 4, 5, 7 across all three standards)
**Why it wins:** CertifyAero must re-author context (4.1/4.2), scope (4.3), leadership (5.1–5.3), and support (7.x) per standard — it can't, because it only has one standard. Cumplify authors these **once** in M6/M1/M4/M13 and projects them across 9001, 14001, and 45001 via the Annex SL HLS. One audit, one management review (M11/ReviewOrchestrator with parallel 9.3.2 input fan-out), one competence register (M13/CompetenceKeeper).
**Moat:** Combined tri-standard certification readiness at a fraction of the effort of three separate systems — a value proposition structurally unavailable to a single-standard tool.
**AWS mechanism:** **ControlTower** (Nova Pro supervisor, Bedrock multi-agent collaboration) governs 4.4/5.1/5.3 cross-standard; EventBridge + SQS event-driven orchestration.

### #3 — Agentic closed loop vs. static document generation (detect → draft → route → verify → close)
**Why it wins:** CertifyAero's AI *drafts and stops*. Cumplify's agents **detect** a trigger, **draft** the artifact, **route** it (e.g., LeadAuditor findings → CAPAGuru; NCTriage → CAPAGuru → RecordsVault; HazardScout → RiskSentinel → CAPAGuru), **verify** effectiveness, and **close** — including HITL pause via `returnControlInvocationResults` for any mutating action.
**Moat:** This is backend agentic behavior (Bedrock Agents on AWS), impossible to replicate from a client-side browser chat assistant. Applies to *every* CAPA (M2), audit finding (M3), incident (M10), and aspect/hazard (M9/M10).
**AWS mechanism:** Bedrock Agents + action-group Lambdas (resource-based policy for `bedrock.amazonaws.com`); Guardrails (PII anonymize/block + PROMPT_ATTACK); event-driven chains over EventBridge + SQS.

### #4 — Immutable audit trail (append-only) as the trust layer for auditors and regulators
**Why it wins:** A browser-based generator cannot prove tamper-evidence. Cumplify's **M4 Records Management** provides an append-only immutable event log — the single most valuable feature to an external certification auditor evaluating any of clauses 7.5, 8.7, 9.2, 9.3, 10.2.
**Moat:** WORM guarantees a competitor without a controlled backend simply cannot offer.
**AWS mechanism:** DynamoDB append-only audit-event mirror (single-table `CumplifyCore`, CMK — Lambda role needs all **6 KMS actions**; idempotent `PutItem attribute_not_exists(pk)`) + **S3 Object Lock COMPLIANCE mode** sealed audit-event archive; AOSS for audit-trail retrieval (45s cold-start + backoff).

### #5 — The 45001-unique clauses: worker voice (5.4) and incident investigation (10.2)
**Why it wins:** No 9001/14001 analogue exists, so no single-standard competitor can approximate them. **WorkerVoice** (5.4 consultation and participation of workers) and **IncidentInvestigator** (10.2 incident + NC + corrective action, feeding CAPAGuru) address clauses that are legally and operationally central to OH&S customers.
**Moat:** Directly targets the EHS Manager buyer persona that CertifyAero does not serve at all.
**AWS mechanism:** M10 Safety Operations; **HazardScout → RiskSentinel → CAPAGuru** and **IncidentInvestigator → CAPAGuru → RecordsVault** chains; AppSync subscriptions for real-time worker submissions — user-facing via `@aws_cognito` (COGNITO_USER_POOLS), agent-published notifications via `@aws_iam` (`publishAgentMessage`), with subscription resolver verifying the tenant claim.

### #6 — Enterprise multi-tenancy vs. SMB single-plan
**Why it wins:** CertifyAero is a single $349/mo plan for SMB aerospace shops. Cumplify's tenant isolation (Cognito 3 User Pools, `custom:tenantId` immutable via PreTokenGeneration into the **ID token only**, DynamoDB IAM `LeadingKeys` `ForAllValues:StringLike` on `aws:PrincipalTag/tenantId`) unlocks mid-market/enterprise multi-site organizations that need per-tenant isolation, ABAC, and separate dev/staging/prod accounts.
**Moat:** A different customer segment and price tier entirely — expands TAM rather than competing on CertifyAero's turf.
**AWS mechanism:** AppSync default USER_POOL + IAM mode + Lambda Authorizer (returns `resolverContext.tenantId/role`); DynamoDB authoritative for runtime role/tier; WAFv2 (REGIONAL) on `api.graphQLEndpointArn`.

### #7 — Legal/Compliance Register as a cross-standard revenue and stickiness engine (14001 6.1.3, 45001 6.1.3, 9.1.2 both)
**Why it wins:** The legal register is the highest-maintenance, highest-anxiety artifact for EHS customers and is completely absent from CertifyAero. **LegalLedger** (Claude Sonnet 4.6) maintains obligations and drives 9.1.2 evaluation of compliance for both 14001 and 45001.
**Moat:** Continuously updated obligations = recurring value and switching cost.
**AWS mechanism:** **M8 Compliance Obligations Register**; RDS system-of-record + ElastiCache hot cache; AOSS KB grounding (45s cold-start + exponential-backoff retry mandatory).

---

## 5. Summary Scorecard

| Standard | CertifyAero COVERED | CertifyAero PARTIAL | CertifyAero MISSING | Cumplify coverage |
|---|---|---|---|---|
| **ISO 9001:2015** | Document control, scope, policy, design/dev, customer requirements, internal audit, NCR, CAPA | Context, interested parties, risk, objectives, resources, communication, mgmt review, monitoring | 6.3 change planning, 7.1.6 org knowledge | 100% — as an agentic closed loop on an immutable trail |
| **ISO 14001:2015** | — (none) | — (none) | **ALL clauses 4–10** (single-standard competitor) | 100% green-field capture (M8, M9 + AspectWarden, LegalLedger, EmergencyPlanner) |
| **ISO 45001:2018** | — (none) | — (none) | **ALL clauses 4–10**, incl. unique 5.4 & 10.2 "Incident" | 100% green-field capture (M10 + HazardScout, WorkerVoice, IncidentInvestigator) |

**Bottom line for the handoff:** On 9001, Cumplify beats CertifyAero on *quality of execution* (agentic loop + immutable trail + IMS reuse), not mere presence. On 14001 and 45001, there is no contest — CertifyAero has nothing, and Cumplify captures the entire tri-standard IMS market with a genuinely agentic AWS-Bedrock backend, enterprise multi-tenancy, and a WORM-grade immutable audit trail.
