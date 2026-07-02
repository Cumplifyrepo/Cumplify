# ISO Requirements Map — Cumplify.ai

**Purpose:** This document walks clauses 4–10 of each of the three standards in Cumplify's Integrated Management System (IMS) scope — **ISO 9001:2015 (Quality)**, **ISO 14001:2015 (Environmental)**, **ISO 45001:2018 (Occupational Health & Safety)** — sub-clause by sub-clause. For every clause it states: **(a)** the exact clause number and title, **(b)** a one-line statement of what the clause requires, and **(c)** what a SaaS platform must provide (concrete features, data models, and workflows) to satisfy it. Each standard is a separate top-level section so the three are never conflated. A closing note distinguishes shared Annex SL High-Level Structure (HLS) clauses from standard-specific ones.

Terminology is kept strictly distinct per standard: **9001** = quality, product/service conformity, customer; **14001** = environmental aspects, impacts, compliance obligations, environment; **45001** = hazards, OH&S risks, workers, incidents.

Owning Cumplify modules (M1–M13) and Bedrock agents are referenced where relevant.

---

# Section A — ISO 9001:2015 (Quality Management System)

## 4 Context of the organization

**4.1 Understanding the organization and its context**
- (b) Requires: Determine external and internal issues relevant to the QMS purpose and strategic direction.
- (c) SaaS must provide: A **context register** (M6 Context & Stakeholder Studio) capturing internal/external issues with issue type (PESTEL categories), owner, review date, and link to strategic direction; version-controlled, monitored/reviewed status; RDS PostgreSQL system-of-record entity `context_issue` with tenant_id scoping; ContextCartographer agent to draft/refresh issues.

**4.2 Understanding the needs and expectations of interested parties**
- (b) Requires: Identify interested parties relevant to the QMS and their relevant requirements.
- (c) SaaS must provide: An **interested-parties register** (M6): party name, type (customer, regulator, supplier, employee), needs/expectations, which become compliance/QMS requirements, review cadence; traceability from party requirement → QMS control.

**4.3 Determining the scope of the QMS**
- (b) Requires: Determine QMS boundaries and applicability; document scope including justified exclusions.
- (c) SaaS must provide: A **scope statement builder** (M1 Document Studio, owns 4.3) that pulls inputs from 4.1/4.2, records products/services/sites/processes covered, documents non-applicable requirements with justification, and publishes as controlled documented information; DocStudio agent drafts.

**4.4 Quality management system and its processes**
- (b) Requires: Establish, implement, maintain and continually improve the QMS and its interacting processes.
- (c) SaaS must provide: A **process map / process inventory** with inputs, outputs, sequence, interactions, process owners, criteria, KPIs, resources, and risks; ControlTower agent governs cross-process orchestration; each process links to its controlling documents and metrics.

## 5 Leadership

**5.1 Leadership and commitment (5.1.1 general, 5.1.2 customer focus)**
- (b) Requires: Top management demonstrates leadership/commitment to the QMS (5.1.1) and ensures customer focus (5.1.2).
- (c) SaaS must provide: **Leadership commitment records** (M6): policy sign-off, resource allocation, management-review participation logs; Executive role dashboard. For 5.1.2, link to customer requirements (8.2), customer satisfaction (9.1.2), and risk/opportunity register (6.1).

**5.2 Policy (5.2.1 establishing, 5.2.2 communicating the quality policy)**
- (b) Requires: Establish an appropriate quality policy (5.2.1) and communicate it (5.2.2).
- (c) SaaS must provide: **Quality policy authoring** in M1 (owns 5.2), approval workflow, controlled version; **communication distribution** with read-acknowledgement tracking per worker; availability to interested parties as documented information.

**5.3 Organizational roles, responsibilities and authorities**
- (b) Requires: Assign, communicate and understand responsibilities and authorities for relevant roles.
- (c) SaaS must provide: A **roles & authorities matrix** (M6): role → responsibility → authority → assigned person, mapped to Cognito groups (Quality Manager, Auditor, Executive, Employee); RACI per process; communicated-and-acknowledged tracking.

## 6 Planning

**6.1 Actions to address risks and opportunities**
- (b) Requires: Determine risks/opportunities to be addressed to give assurance the QMS achieves results and plan actions.
- (c) SaaS must provide: A **risk & opportunity register** (M5 Risk Management, owns 6.1; RiskSentinel agent): risk description, likelihood/impact scoring, risk-based-thinking rationale, planned actions, action owners/due dates, effectiveness evaluation; links actions into M2 CAPA and M7 Objectives.

**6.2 Quality objectives and planning to achieve them**
- (b) Requires: Establish measurable quality objectives at relevant functions/levels and plan how to achieve them.
- (c) SaaS must provide: **Objectives & targets** (M7 Objectives & Targets; ObjectiveTracker agent): objective, measurable KPI, owner, resources, timeline, evaluation method, progress %, linkage to 9.1.1 monitoring; dashboard cached in ElastiCache.

**6.3 Planning of changes**
- (b) Requires: Carry out QMS changes in a planned manner (purpose, integrity, resources, responsibilities).
- (c) SaaS must provide: A **change-planning workflow** (M5, owns 6.3): change request, purpose, consequences, resource/authority allocation, impact on QMS integrity, approval gate, audit-trail entry in M4.

## 7 Support

**7.1 Resources**

- **7.1.1 General** — (b) Determine and provide resources for the QMS. (c) Resource register linked to processes (4.4) and objectives (6.2).
- **7.1.2 People** — (b) Provide persons necessary for QMS operation. (c) Staffing/competence linkage to M13 Competence & Training.
- **7.1.3 Infrastructure** — (b) Provide/maintain infrastructure. (c) Infrastructure/equipment register with maintenance schedules and status.
- **7.1.4 Environment for the operation of processes** — (b) Provide suitable process environment (social/psychological/physical). (c) Environment-condition register with monitoring records.
- **7.1.5 Monitoring and measuring resources (7.1.5.1 general; 7.1.5.2 measurement traceability / calibration)** — (b) Ensure valid/reliable monitoring & measuring resources; ensure calibration traceable to standards. (c) **Calibration register** (M4 Records Management, owns 7.1.5): instrument ID, calibration due dates, traceability to national/international standards, calibration certificates as WORM evidence in S3 Object Lock, out-of-calibration recall workflow; RecordsVault agent; expiry alerts.
- **7.1.6 Organizational knowledge** — (b) Determine and maintain knowledge needed for QMS. (c) Knowledge base (Bedrock KB in OpenSearch Serverless) capturing lessons learned; **all reads implement 45-second cold-start timeout budget with exponential-backoff retry** for OpenSearch Serverless NextGen scale-to-zero.

**7.2 Competence**
- (b) Requires: Determine necessary competence, ensure competence, take actions to acquire it, retain evidence.
- (c) SaaS must provide: **Competence matrix** (M13; CompetenceKeeper agent): role → required competence → person → evidence → gap; training actions, records retention.

**7.3 Awareness**
- (b) Requires: Ensure persons are aware of quality policy, objectives, their contribution, and implications of nonconformity.
- (c) SaaS must provide: **Awareness campaigns** (M13): policy/objective acknowledgement tracking, awareness quiz records, per-worker awareness status.

**7.4 Communication**
- (b) Requires: Determine internal/external communications relevant to the QMS (what, when, whom, how, who).
- (c) SaaS must provide: A **communication plan matrix** (M6, owns 7.4): topic, audience, frequency, channel, responsible party; delivery/acknowledgement logs.

**7.5 Documented information (7.5.1 general; 7.5.2 creating and updating; 7.5.3 control of documented information)**
- (b) Requires: Maintain required documented information (7.5.1); ensure appropriate identification, format, review/approval on create/update (7.5.2); control availability, protection, distribution, storage, retention, disposition (7.5.3).
- (c) SaaS must provide: Full **document control** (M1, owns 7.5; DocStudio agent): version control, unique IDs, review/approval workflow, controlled distribution, access control (Cognito + ABAC), retention/disposition rules, and **immutable audit trail** (M4 append-only event log mirrored in DynamoDB; sealed archive in S3 Object Lock COMPLIANCE mode).

## 8 Operation

**8.1 Operational planning and control**
- (b) Requires: Plan, implement and control processes to meet product/service requirements.
- (c) SaaS must provide: Operational-control definitions per process (criteria, resources, documented information), change control per 6.3, and control of outsourced processes.

**8.2 Requirements for products and services**

- **8.2.1 Customer communication** — (b) Communicate with customers (enquiries, contracts, feedback, complaints, property, contingency). (c) Customer communication log; complaint intake feeding M2 CAPA.
- **8.2.2 Determining the requirements for products and services** — (b) Define product/service requirements incl. statutory/regulatory. (c) Requirements capture per product/service with regulatory linkage (M8 where legal obligations apply).
- **8.2.3 Review of the requirements for products and services** — (b) Review ability to meet requirements before commitment; retain records. (c) Order/contract review workflow with capability check and record retention.
- **8.2.4 Changes to requirements for products and services** — (b) Ensure documentation is amended and personnel informed on requirement changes. (c) Requirement-change control with re-communication tracking.

**8.3 Design and development (8.3.1–8.3.6) — UNIQUE to 9001 in this IMS**

- **8.3.1 General** — (b) Establish a design & development (D&D) process. (c) D&D project workspace.
- **8.3.2 Design and development planning** — (b) Plan D&D stages, reviews, verification, validation, responsibilities. (c) D&D plan with stage gates, owners, resources.
- **8.3.3 Design and development inputs** — (b) Determine essential requirements as inputs. (c) Input register (functional, regulatory, prior-design, consequence-of-failure).
- **8.3.4 Design and development controls** — (b) Apply reviews, verification, validation controls. (c) Review/verification/validation records with pass/fail and actions.
- **8.3.5 Design and development outputs** — (b) Ensure outputs meet inputs and are adequate for provision. (c) Output register traced to inputs; acceptance criteria.
- **8.3.6 Design and development changes** — (b) Identify, review, control D&D changes. (c) Design-change control with impact assessment and record retention.

**8.4 Control of externally provided processes, products and services**

- **8.4.1 General** — (b) Ensure externally provided items conform; apply criteria for evaluation/selection/monitoring/re-evaluation. (c) **Approved supplier list** (M12 Supplier & External Provider Management; SupplierScout agent), evaluation scoring, monitoring records; cached in ElastiCache.
- **8.4.2 Type and extent of control** — (b) Define controls over external providers and their outputs. (c) Per-supplier control level, verification activities, inspection records.
- **8.4.3 Information for external providers** — (b) Communicate requirements to external providers before communication. (c) Purchase-requirement communication records, competence/qualification requirements to providers.

**8.5 Production and service provision**

- **8.5.1 Control of production and service provision** — (b) Implement controlled conditions. (c) Work instructions (M1), monitoring at defined stages, release criteria.
- **8.5.2 Identification and traceability** — (b) Identify outputs and control unique identification where traceability is required. (c) Identification/traceability records (lot/serial), status of outputs w.r.t. monitoring.
- **8.5.3 Property belonging to customers or external providers** — (b) Exercise care with customer/provider property. (c) Property register, condition/loss reporting to customer.
- **8.5.4 Preservation** — (b) Preserve outputs during production/delivery. (c) Preservation controls (handling, storage, packaging) records.
- **8.5.5 Post-delivery activities** — (b) Meet post-delivery requirements (warranty, maintenance, recycling, disposal). (c) Post-delivery obligation register and service records.
- **8.5.6 Control of changes** — (b) Review/control changes for production/service provision. (c) Production-change control with record retention.

**8.6 Release of products and services**
- (b) Requires: Verify requirements met before release; retain evidence of conformity and release authority.
- (c) SaaS must provide: **Release/acceptance workflow** with acceptance criteria, release authority sign-off (traceable person), and conformity evidence retained (M4).

**8.7 Control of nonconforming outputs**
- (b) Requires: Identify and control nonconforming outputs to prevent unintended use/delivery; take appropriate action; retain records.
- (c) SaaS must provide: **Nonconforming-output workflow** (M2 CAPA, owns 8.7; NCTriage → CAPAGuru agents): quarantine/disposition (correct, segregate, return, concession), authority for concession, records of nonconformity, actions, and disposition.

## 9 Performance evaluation

**9.1 Monitoring, measurement, analysis and evaluation**

- **9.1.1 General** — (b) Determine what/how/when to monitor and evaluate QMS performance. (c) Monitoring plan linked to objectives (M7) and processes; KPI dashboards.
- **9.1.2 Customer satisfaction** — (b) Monitor customer perception of requirement fulfilment. (c) Customer satisfaction capture (surveys, feedback, complaints), trend analysis.
- **9.1.3 Analysis and evaluation** — (b) Analyse/evaluate data to assess conformity, satisfaction, QMS performance, supplier performance, risk actions. (c) Analytics views aggregating conformity, satisfaction, process, and supplier data.

**9.2 Internal audit**
- (b) Requires: Conduct planned internal audits to determine QMS conformity and effective implementation; retain records.
- (c) SaaS must provide: **Audit programme, checklists, findings, readiness scoring** (M3 Audit Studio, owns 9.2; LeadAuditor agent, fans out checklist generation); findings route to M2 CAPA (LeadAuditor → CAPAGuru chain).

**9.3 Management review (9.3.1 general; 9.3.2 inputs; 9.3.3 outputs)**
- (b) Requires: Top management reviews the QMS at planned intervals (9.3.1) with defined inputs (9.3.2) producing defined outputs/decisions (9.3.3).
- (c) SaaS must provide: **Management review workspace** (M11 Management Review; ReviewOrchestrator agent, parallel fan-out to gather 9.3.2 inputs): structured input agenda (status of prior actions, changes, performance, audit results, customer satisfaction, supplier performance, resource adequacy, risk actions, improvement opportunities), minutes, and output action items with owners/due dates.

## 10 Improvement

**10.1 General**
- (b) Requires: Determine and select improvement opportunities to meet requirements and enhance satisfaction.
- (c) SaaS must provide: Improvement-opportunity backlog fed from audits, CAPA, risks, and objectives.

**10.2 Nonconformity and corrective action**
- (b) Requires: React to nonconformity, evaluate need for action to eliminate causes, implement, review effectiveness; retain records.
- (c) SaaS must provide: **CAPA workflow** (M2, owns 10.2; CAPAGuru agent): nonconformity capture, containment, root-cause analysis, corrective action, effectiveness verification, and records; NCTriage → CAPAGuru → RecordsVault chain.

**10.3 Continual improvement**
- (b) Requires: Continually improve suitability, adequacy and effectiveness of the QMS.
- (c) SaaS must provide: Trend dashboards and continual-improvement tracking tying objectives, CAPA effectiveness, and management-review outputs.

---

# Section B — ISO 14001:2015 (Environmental Management System)

## 4 Context of the organization

**4.1 Understanding the organization and its context**
- (b) Requires: Determine internal/external issues relevant to the EMS, including environmental conditions affected by or affecting the organization.
- (c) SaaS must provide: **Environmental context register** (M6): issues including environmental conditions (climate, resource availability), owner, review date; ContextCartographer agent.

**4.2 Understanding the needs and expectations of interested parties**
- (b) Requires: Determine interested parties, their needs/expectations, and which become compliance obligations.
- (c) SaaS must provide: Interested-parties register (M6) with a flag marking which expectations become **compliance obligations** (feeding M8).

**4.3 Determining the scope of the EMS**
- (b) Requires: Determine EMS boundaries and applicability considering context, obligations, units/functions, activities, authority.
- (c) SaaS must provide: EMS scope builder (M1, owns 4.3) recording physical/organizational boundaries, activities, products, services, and authority; published as controlled documented information.

**4.4 Environmental management system**
- (b) Requires: Establish, implement, maintain and continually improve the EMS and its processes.
- (c) SaaS must provide: EMS process inventory (ControlTower governance) linking aspects, obligations, objectives, and controls.

## 5 Leadership

**5.1 Leadership and commitment**
- (b) Requires: Top management demonstrates leadership/commitment to the EMS.
- (c) SaaS must provide: Leadership commitment records (M6): EHS Manager/Executive dashboards, resource allocation, review participation.

**5.2 Environmental policy**
- (b) Requires: Establish an environmental policy including commitment to protection of the environment, fulfil compliance obligations, and continual improvement.
- (c) SaaS must provide: Environmental policy authoring (M1, owns 5.2) with mandatory commitments (protection of environment incl. pollution prevention, compliance obligations, continual improvement), approval, controlled distribution with acknowledgement.

**5.3 Organizational roles, responsibilities and authorities**
- (b) Requires: Assign and communicate EMS roles/responsibilities/authorities.
- (c) SaaS must provide: Roles & authorities matrix (M6) mapped to EHS Manager Cognito group.

## 6 Planning

**6.1 Actions to address risks and opportunities**

- **6.1.1 General** — (b) Determine risks/opportunities from aspects, obligations, and 4.1/4.2 issues. (c) EMS risk/opportunity register (M5; RiskSentinel agent) drawing from aspects and obligations.
- **6.1.2 Environmental aspects — UNIQUE to 14001** — (b) Determine environmental aspects of activities/products/services and associated impacts; determine significant aspects using criteria. (c) **Aspects & impacts register** (M9 Environmental Management / EnviroStudio, owns 6.1.2; AspectWarden agent): activity → aspect → impact → lifecycle stage → significance scoring against defined criteria → significant-aspect flag; AspectWarden → RiskSentinel chain.
- **6.1.3 Compliance obligations** — (b) Determine and have access to compliance obligations related to aspects. (c) **Compliance obligations / legal register** (M8 Compliance Obligations Register; LegalLedger agent): obligation, source, applicability to aspects, requirements, owner; cached in ElastiCache.
- **6.1.4 Planning action** — (b) Plan actions to address significant aspects, obligations, risks/opportunities and integrate into EMS. (c) Action-planning workflow linking significant aspects/obligations to objectives (M7) and controls (M9), with effectiveness evaluation.

**6.2 Environmental objectives and planning to achieve them (6.2.1 objectives; 6.2.2 planning actions to achieve them)**
- (b) Requires: Establish environmental objectives at relevant functions/levels consistent with policy (6.2.1) and plan actions/resources/responsibility/timeframe/evaluation (6.2.2).
- (c) SaaS must provide: Environmental objectives & targets (M7; ObjectiveTracker agent): objective, KPI (waste/emissions/energy/water), owner, resources, timeframe, evaluation indicator, progress; linked to 9.1.1 monitoring.

## 7 Support

**7.1 Resources**
- (b) Requires: Determine and provide resources for the EMS.
- (c) SaaS must provide: EMS resource register linked to processes and objectives.

**7.2 Competence**
- (b) Requires: Determine and ensure competence of persons affecting environmental performance and compliance obligations.
- (c) SaaS must provide: Competence matrix (M13; CompetenceKeeper agent) covering environmental roles; evidence retained.

**7.3 Awareness**
- (b) Requires: Ensure persons are aware of the environmental policy, significant aspects, their contribution, and implications of nonconformity.
- (c) SaaS must provide: Awareness tracking (M13) including significant-aspect awareness per worker.

**7.4 Communication (7.4.1 general; 7.4.2 internal communication; 7.4.3 external communication)**
- (b) Requires: Establish communication processes (7.4.1); communicate internally (7.4.2); communicate externally per obligations (7.4.3).
- (c) SaaS must provide: Communication plan matrix (M6, owns 7.4) with internal vs external channels, external communication decision records per compliance obligations, and delivery/acknowledgement logs.

**7.5 Documented information (7.5.1 general; 7.5.2 creating and updating; 7.5.3 control)**
- (b) Requires: Maintain required documented information (7.5.1); control creation/update (7.5.2); control the documented information (7.5.3).
- (c) SaaS must provide: Document control (M1, owns 7.5; DocStudio agent) with version control, review/approval, controlled distribution, retention/disposition, and immutable audit trail (M4).

## 8 Operation

**8.1 Operational planning and control**
- (b) Requires: Establish/implement/control processes to meet EMS requirements and address significant aspects, obligations, risks/opportunities; control planned changes and outsourced processes; consider lifecycle perspective.
- (c) SaaS must provide: **Operational controls register** (M9, owns 14001 8.1; AspectWarden agent): control per significant aspect, procedures/work instructions, lifecycle-stage controls, procurement/outsourcing controls (via M12 SupplierScout), and change control.

**8.2 Emergency preparedness and response**
- (b) Requires: Establish processes to prepare for and respond to potential environmental emergencies.
- (c) SaaS must provide: **Emergency preparedness plans** (M9; EmergencyPlanner agent): identified emergency scenarios, response procedures, drill/test records, review after tests/incidents.

## 9 Performance evaluation

**9.1 Monitoring, measurement, analysis and evaluation**

- **9.1.1 General** — (b) Monitor/measure/analyse/evaluate environmental performance. (c) Environmental monitoring (M9): waste, emissions, energy, water metrics against objectives (M7); calibrated monitoring equipment records.
- **9.1.2 Evaluation of compliance** — (b) Establish processes to evaluate fulfilment of compliance obligations; maintain knowledge/understanding of compliance status. (c) **Compliance evaluation workflow** (M8, owns 9.1.2; LegalLedger agent): per-obligation evaluation, status, evidence, and non-compliance routing to M2 CAPA.

**9.2 Internal audit (9.2.1 general; 9.2.2 internal audit programme)**
- (b) Requires: Conduct internal audits (9.2.1) per a planned programme (9.2.2) to check EMS conformity and effectiveness.
- (c) SaaS must provide: Audit programme, checklists, findings, readiness scoring (M3; LeadAuditor agent); findings route to M2 CAPA.

**9.3 Management review**
- (b) Requires: Top management reviews the EMS with defined inputs and outputs.
- (c) SaaS must provide: Management review workspace (M11; ReviewOrchestrator agent) with EMS-specific inputs (aspects, obligations status, compliance evaluation results, environmental performance, objectives progress) and output action items.

## 10 Improvement

**10.1 General**
- (b) Requires: Determine improvement opportunities and implement actions to achieve intended EMS outcomes.
- (c) SaaS must provide: Improvement backlog fed from audits, compliance evaluation, aspects, and CAPA.

**10.2 Nonconformity and corrective action**
- (b) Requires: React to nonconformity, evaluate and eliminate causes, review effectiveness; retain records.
- (c) SaaS must provide: CAPA workflow (M2, owns 10.2; CAPAGuru agent; IncidentInvestigator for environmental incidents): nonconformity capture, root cause, corrective action, effectiveness verification, records.

**10.3 Continual improvement**
- (b) Requires: Continually improve the EMS to enhance environmental performance.
- (c) SaaS must provide: Environmental-performance trend dashboards tying objectives, CAPA effectiveness, and review outputs.

---

# Section C — ISO 45001:2018 (Occupational Health & Safety Management System)

## 4 Context of the organization

**4.1 Understanding the organization and its context**
- (b) Requires: Determine internal/external issues relevant to the OH&S management system.
- (c) SaaS must provide: OH&S context register (M6): issues affecting OH&S performance, owner, review date; ContextCartographer agent.

**4.2 Understanding the needs and expectations of workers and other interested parties**
- (b) Requires: Determine workers and other interested parties, their needs/expectations, and which become legal/other requirements.
- (c) SaaS must provide: **Workers & interested-parties register** (M6) explicitly including workers as a party; flag which expectations become legal & other requirements (feeding M8).

**4.3 Determining the scope of the OH&S management system**
- (b) Requires: Determine boundaries/applicability considering context, requirements, and work-related activities.
- (c) SaaS must provide: OH&S scope builder (M1, owns 4.3) recording units, functions, work-related activities, and authority; controlled documented information.

**4.4 OH&S management system**
- (b) Requires: Establish, implement, maintain and continually improve the OH&S management system and its processes.
- (c) SaaS must provide: OH&S process inventory (ControlTower governance) linking hazards, requirements, objectives, and controls.

## 5 Leadership and worker participation

**5.1 Leadership and commitment**
- (b) Requires: Top management demonstrates leadership/commitment, taking overall responsibility for worker health and safety.
- (c) SaaS must provide: Leadership commitment records (M6): EHS Manager/Executive dashboards, resource allocation, protection of workers from reprisal records, review participation.

**5.2 OH&S policy**
- (b) Requires: Establish an OH&S policy including commitment to safe/healthy working conditions, hazard elimination/risk reduction, fulfil legal & other requirements, and worker consultation/participation.
- (c) SaaS must provide: OH&S policy authoring (M1, owns 5.2) with mandatory commitments (safe/healthy conditions, prevention of injury/ill health, hazard elimination and OH&S risk reduction, legal & other requirements, consultation & participation), approval, controlled distribution with acknowledgement.

**5.3 Organizational roles, responsibilities and authorities**
- (b) Requires: Assign and communicate OH&S roles/responsibilities/authorities; workers at each level take responsibility.
- (c) SaaS must provide: Roles & authorities matrix (M6) mapped to EHS Manager Cognito group.

**5.4 Consultation and participation of workers — UNIQUE to 45001**
- (b) Requires: Establish processes for consultation and participation of workers (and their representatives) at all levels/functions in developing, planning, implementing, evaluating and improving the OH&S management system.
- (c) SaaS must provide: **Worker consultation & participation module** (M10 Safety Operations, owns 5.4; WorkerVoice agent): consultation topic log, worker feedback/suggestion intake, participation records, removal of barriers to participation, records of non-managerial worker input on hazard identification, risk assessment, incident investigation, and controls.

## 6 Planning

**6.1 Actions to address risks and opportunities**

- **6.1.1 General** — (b) Determine risks/opportunities considering hazards, OH&S risks, legal/other requirements. (c) OH&S risk/opportunity register (M5; RiskSentinel agent).
- **6.1.2 Hazard identification and assessment of risks and opportunities — UNIQUE to 45001**
  - **6.1.2.1 Hazard identification** — (b) Establish ongoing/proactive hazard identification process. (c) **Hazard register** (M10, owns 6.1.2; HazardScout agent): hazard source, routine/non-routine activities, incidents/emergencies, human factors, work organization; continuous intake.
  - **6.1.2.2 Assessment of OH&S risks and other risks** — (b) Assess OH&S risks from identified hazards using defined methodology/criteria. (c) OH&S risk assessment records with likelihood/severity scoring and methodology; HazardScout → RiskSentinel chain.
  - **6.1.2.3 Assessment of OH&S opportunities and other opportunities** — (b) Assess OH&S opportunities to enhance performance. (c) OH&S opportunity register.
- **6.1.3 Determination of legal requirements and other requirements** — (b) Determine and have access to legal & other requirements applicable to hazards/OH&S risks. (c) **Legal & other requirements register** (M8; LegalLedger agent) with applicability to hazards; cached in ElastiCache.
- **6.1.4 Planning action** — (b) Plan actions to address risks/opportunities, legal/other requirements, and emergencies; integrate into OH&S processes; apply hierarchy of controls. (c) Action-planning workflow linking hazards/risks to controls (M10) and objectives (M7), with hierarchy-of-controls tagging.

**6.2 OH&S objectives and planning to achieve them (6.2.1 objectives; 6.2.2 planning to achieve)**
- (b) Requires: Establish OH&S objectives consistent with policy (6.2.1) and plan actions/resources/responsibility/timeframe/evaluation (6.2.2).
- (c) SaaS must provide: OH&S objectives & targets (M7; ObjectiveTracker agent): objective, KPI, owner, resources, timeframe, evaluation indicator, progress; linked to 9.1.1 monitoring.

## 7 Support

**7.1 Resources**
- (b) Requires: Determine and provide resources for the OH&S management system.
- (c) SaaS must provide: OH&S resource register linked to processes and objectives.

**7.2 Competence**
- (b) Requires: Ensure workers are competent (including to identify hazards) on the basis of education/training/experience.
- (c) SaaS must provide: Competence matrix (M13; CompetenceKeeper agent) covering OH&S/hazard-identification competence; evidence retained.

**7.3 Awareness**
- (b) Requires: Make workers aware of the OH&S policy, hazards/risks, incidents relevant to them, and their ability to remove themselves from danger.
- (c) SaaS must provide: Awareness tracking (M13) including hazard awareness and right-to-remove-from-danger acknowledgement per worker.

**7.4 Communication (7.4.1 general; 7.4.2 internal; 7.4.3 external)**
- (b) Requires: Establish communication processes (7.4.1); communicate internally including with workers (7.4.2); communicate externally (7.4.3).
- (c) SaaS must provide: Communication plan matrix (M6, owns 7.4) with internal/external channels, worker-inclusive communication, and delivery/acknowledgement logs.

**7.5 Documented information**
- (b) Requires: Maintain required documented information and control its creation, update, and control.
- (c) SaaS must provide: Document control (M1, owns 7.5; DocStudio agent) with version control, review/approval, controlled distribution, retention, and immutable audit trail (M4).

## 8 Operation

**8.1 Operational planning and control**

- **8.1.1 General** — (b) Plan/implement/control processes to meet OH&S requirements and implement actions from clause 6. (c) Operational-control definitions per OH&S process; criteria and documented information.
- **8.1.2 Eliminating hazards and reducing OH&S risks — hierarchy of controls** — (b) Apply the hierarchy of controls (eliminate; substitute; engineering controls/reorganization; administrative controls incl. training; PPE). (c) **Controls register** (M10, owns 8.1.2; HazardScout agent) tagging each control to a hierarchy tier, with effectiveness tracking.
- **8.1.3 Management of change** — (b) Establish processes to implement/control planned changes affecting OH&S performance. (c) OH&S change-control workflow (M10, owns 8.1.3; also M5 change planning) with hazard-impact assessment.
- **8.1.4 Procurement (8.1.4.1 general; 8.1.4.2 contractors; 8.1.4.3 outsourcing)** — (b) Control procurement to conform to OH&S (8.1.4.1); coordinate with contractors on hazards (8.1.4.2); ensure outsourced functions are controlled (8.1.4.3). (c) **Procurement/contractor/outsourcing controls** (M10 + M12 Supplier & External Provider Management; SupplierScout agent): contractor prequalification, hazard coordination records, outsourced-function control criteria.

**8.2 Emergency preparedness and response**
- (b) Requires: Establish processes to prepare for and respond to potential emergency situations.
- (c) SaaS must provide: Emergency preparedness plans (M10; EmergencyPlanner agent): scenarios, response procedures including worker/contractor/interested-party needs, drill/test records, post-test/post-incident review.

## 9 Performance evaluation

**9.1 Monitoring, measurement, analysis and performance evaluation**

- **9.1.1 General** — (b) Monitor/measure/analyse/evaluate OH&S performance. (c) OH&S monitoring (M10): leading/lagging indicators against objectives (M7); calibrated monitoring equipment records.
- **9.1.2 Evaluation of compliance** — (b) Establish processes to evaluate fulfilment of legal & other requirements; maintain knowledge of compliance status. (c) Compliance evaluation workflow (M8, owns 9.1.2; LegalLedger agent): per-requirement evaluation, status, evidence, non-compliance routing to M2 CAPA.

**9.2 Internal audit (9.2.1 general; 9.2.2 internal audit programme)**
- (b) Requires: Conduct internal audits (9.2.1) per a planned programme (9.2.2) to check OH&S management system conformity and effectiveness.
- (c) SaaS must provide: Audit programme, checklists, findings, readiness scoring (M3; LeadAuditor agent); findings route to M2 CAPA.

**9.3 Management review**
- (b) Requires: Top management reviews the OH&S management system with defined inputs and outputs.
- (c) SaaS must provide: Management review workspace (M11; ReviewOrchestrator agent) with OH&S-specific inputs (incident/nonconformity trends, hazard/risk status, consultation & participation results, compliance evaluation, objectives progress) and output action items.

## 10 Improvement

**10.1 General**
- (b) Requires: Determine improvement opportunities and implement actions to achieve intended OH&S outcomes.
- (c) SaaS must provide: Improvement backlog fed from incidents, audits, compliance evaluation, hazards, and worker participation input.

**10.2 Incident, nonconformity and corrective action — NOTE: 45001 adds "Incident"**
- (b) Requires: React to incidents and nonconformities, investigate incidents, evaluate and eliminate causes (with worker participation), review effectiveness; retain records.
- (c) SaaS must provide: **Incident + CAPA workflow** (M2 + M10, owns 10.2; IncidentInvestigator → CAPAGuru agents): incident reporting/intake, investigation with worker participation (M10/WorkerVoice), root-cause analysis, corrective action via hierarchy of controls, effectiveness verification, and records; NCTriage → CAPAGuru → RecordsVault chain.

**10.3 Continual improvement**
- (b) Requires: Continually improve the OH&S management system to enhance OH&S performance.
- (c) SaaS must provide: OH&S-performance trend dashboards tying objectives, incident/CAPA effectiveness, worker participation, and review outputs.

---

# Shared vs Standard-Specific Clauses (Annex SL HLS note)

All three standards share the **Annex SL High-Level Structure (HLS)**, so clauses 4–10 align at the top level and Cumplify's shared modules (M1 Document Studio, M2 CAPA, M3 Audit Studio, M4 Records Management, M5 Risk Management, M6 Context & Stakeholder Studio, M7 Objectives & Targets, M11 Management Review, M13 Competence & Training) serve all three from a single IMS spine.

**Common HLS clauses (same intent across 9001 / 14001 / 45001, terminology differs):**
- 4.1 Understanding the organization and its context; 4.2 interested parties (14001/45001 add the "which become obligations/requirements" test; 45001 explicitly names **workers**); 4.3 scope; 4.4 the management system.
- 5.1 Leadership and commitment; 5.2 Policy; 5.3 Roles, responsibilities and authorities.
- 6.1 Actions to address risks and opportunities (structure diverges below — see specifics); 6.2 Objectives and planning to achieve them.
- 7.1 Resources; 7.2 Competence; 7.3 Awareness; 7.4 Communication; 7.5 Documented information.
- 8.1 Operational planning and control.
- 9.1 Monitoring, measurement, analysis and evaluation; 9.2 Internal audit; 9.3 Management review.
- 10.1 General; 10.2 Nonconformity and corrective action; 10.3 Continual improvement.

**Standard-specific / unique clauses (require standard-specific modules and agents):**
- **ISO 9001 only:** 5.1.2 Customer focus; 8.2 Requirements for products and services; **8.3 Design and development (8.3.1–8.3.6)** — no 14001/45001 equivalent; 8.5 Production and service provision (incl. 8.5.2 identification & traceability, 8.5.3 customer property); 8.6 Release of products and services; 8.7 Control of nonconforming outputs; 9.1.2 Customer satisfaction. (Terminology: product/service conformity, customer.)
- **ISO 14001 only:** **6.1.2 Environmental aspects** and impacts with significance evaluation (M9/AspectWarden); 6.1.3 Compliance obligations; 6.1.4 Planning action; 8.2 Emergency preparedness and response; 9.1.2 Evaluation of compliance. Lifecycle perspective in 8.1. (Terminology: aspects, impacts, compliance obligations, environment.)
- **ISO 45001 only:** **5.4 Consultation and participation of workers** (M10/WorkerVoice) — the flagship unique clause; 6.1.2.1–6.1.2.3 Hazard identification and assessment of OH&S risks/opportunities (M10/HazardScout); 6.1.3 Legal & other requirements; 8.1.2 Eliminating hazards / hierarchy of controls; 8.1.3 Management of change; 8.1.4 Procurement (contractors/outsourcing); 8.2 Emergency preparedness and response; **10.2 adds "Incident"** to nonconformity and corrective action, requiring incident investigation with worker participation. (Terminology: hazards, OH&S risks, workers, incidents.)

**Structural divergences to respect (do not conflate):**
- **6.1** is a single clause in 9001, but subdivides in 14001 (6.1.1–6.1.4) and 45001 (6.1.1–6.1.4 with 6.1.2 further split into 6.1.2.1–6.1.2.3).
- **9.1.2** means "Customer satisfaction" in 9001 but "Evaluation of compliance" in both 14001 and 45001 — same number, entirely different requirement.
- **8.2** means "Requirements for products and services" in 9001 but "Emergency preparedness and response" in both 14001 and 45001.
- **9.2** is a single clause in 9001 but subdivides into 9.2.1/9.2.2 in 14001 and 45001.
- **10.2** is "Nonconformity and corrective action" in 9001/14001 but "Incident, nonconformity and corrective action" in 45001.

**Cumplify IMS implication:** the shared HLS lets one control (e.g., a single documented information control in M1, one audit programme in M3, one management review in M11) satisfy the common clauses across all three standards simultaneously, while the standard-specific modules (M9 EnviroStudio for 14001 aspects, M10 Safety Operations for 45001 hazards/worker participation/incidents, and 9001's design & development in M1) provide the non-overlapping coverage — the core of Cumplify's true tri-standard Integrated Management System differentiation.

---

The complete document is above. Intended output path: `/home/julio-medrano/Documents/Cumplify SaaS/iso-requirements-map.md`
