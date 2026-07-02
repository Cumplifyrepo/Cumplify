# Cumplify.ai — Module Specification (M1–M13)

> **Handoff document for senior AWS engineer.** Per-module spec for all 13 modules of the Cumplify Integrated Management System (IMS) across ISO 9001:2015 (Quality), ISO 14001:2015 (Environmental), and ISO 45001:2018 (OH&S).
>
> **Legend:** `[EXISTING]` = one of the 5 modules already shipped (Quality-only), now extended to tri-standard. `[NEW]` = one of the 8 roadmap modules.
>
> **Cross-cutting rules baked into every module below:**
> - RDS PostgreSQL is the relational **system-of-record** for all ISO domain entities. DynamoDB single-table `CumplifyCore` (PK/SK, on-demand, CMK, 9 GSIs) holds tenant/user metadata, agent sessions, idempotency, rate limits, and the **append-only immutable audit-event mirror**. Tenant isolation via IAM `LeadingKeys` + `ForAllValues:StringLike` on `aws:PrincipalTag/tenantId`.
> - **Every OpenSearch Serverless (AOSS VECTORSEARCH, NextGen scale-to-zero) read** MUST implement application-side retry with **exponential backoff** and a **minimum 45-second cold-start timeout budget** (cold start up to 45 s). Restated per module that touches AOSS.
> - **AppSync auth modes:** `@aws_cognito` = user-facing (default USER_POOL); `@aws_iam` = agent-to-agent / service. Subscriptions use a None data source; the publishing mutation is annotated `@aws_iam` and the subscription resolver MUST verify the `tenantId` claim before delivery. Lambda Authorizer supplies `resolverContext.tenantId`/`role` for ABAC.
> - Mutating agent actions are **HITL-gated**: the Bedrock agent pauses and uses `returnControlInvocationResults`; approvals flow through the owning module's mutation.
> - S3 + Object Lock **COMPLIANCE mode** = WORM evidence + sealed audit archive; CloudFront (OAC) for delivery.
> - EventBridge custom bus `cumplify-events` + SQS (with DLQ) for event-driven agent orchestration; ControlTower (Nova Pro) is the Bedrock multi-agent supervisor.

---

## M1 — Document Studio `[EXISTING]`

### Purpose
Authoritative authoring, versioning, approval, and controlled distribution of all IMS documented information: the integrated manual, procedures, and work instructions across all three standards. Owns the IMS scope statement and the three policies.

### ISO clauses covered
- **ISO 9001:2015** — 4.3 Determining the scope of the QMS; 5.2 Policy (5.2.1 establishing the quality policy, 5.2.2 communicating the quality policy); 7.5 Documented information (7.5.1 general, 7.5.2 creating and updating, 7.5.3 control of documented information).
- **ISO 14001:2015** — 4.3 Determining the scope of the EMS; 5.2 Environmental policy; 7.5 Documented information (7.5.1 general, 7.5.2 creating and updating, 7.5.3 control).
- **ISO 45001:2018** — 4.3 Determining the scope of the OH&S management system; 5.2 OH&S policy; 7.5 Documented information.

### Core data entities (RDS tables)
- `documents` (id, tenant_id, standard[9001|14001|45001|IMS], doc_type[manual|procedure|work_instruction|policy|scope], title, clause_refs[], status[draft|in_review|approved|obsolete], owner_id)
- `document_versions` (id, document_id, version_no, content_ref[S3 key], change_summary, author_id, created_at)
- `document_approvals` (id, document_version_id, approver_id, decision, approved_at, e_signature_ref)
- `document_distribution` (id, document_version_id, audience_role, acknowledged_by, acknowledged_at)
- `policies` (id, tenant_id, standard, policy_text, effective_date, approved_version_id)
- `ims_scope` (id, tenant_id, scope_statement, boundaries, exclusions_9001, updated_at)

### Owning + collaborating agents
- **Owning:** DocStudio (Nova Pro).
- **Collaborating:** ControlTower (supervisor governance for 4.4/5.1/5.3 cross-standard consistency); RecordsVault (persists approved versions as controlled records to 7.5); the 3 Domain Gurus (advisory clause-conformance review of drafts); ContextCartographer (feeds 4.1/4.2 context into scope inputs 4.3).

### AppSync operations
- `query getDocument(id): Document @aws_cognito`
- `query listDocuments(filter): [Document] @aws_cognito`
- `query getDocumentVersionDiff(v1,v2): Diff @aws_cognito`
- `mutation createDocumentDraft(input): Document @aws_cognito`
- `mutation submitDocumentForApproval(id): Document @aws_cognito`
- `mutation approveDocumentVersion(versionId, decision): DocumentApproval @aws_cognito` (Quality Manager / EHS Manager role via ABAC)
- `mutation publishControlledDocument(versionId): Document @aws_cognito`
- `mutation agentDraftDocument(input): Document @aws_iam` (DocStudio agent writeback; HITL-gated before publish)
- `subscription onDocumentStatusChanged(tenantId): Document @aws_cognito` (resolver verifies tenant claim)
- `mutation publishDocumentEvent(input): DocumentEvent @aws_iam` (None data source; drives subscription)

### Events emitted / consumed
- **Emitted:** `Document.Approved`, `Document.Published`, `Policy.Updated`, `Scope.Changed` → EventBridge `cumplify-events`.
- **Consumed:** `Audit.FindingRaised` (from M3 → may trigger document revision), `CAPA.ActionRequiresDocChange` (from M2), `Context.Updated` (from M6 → scope review trigger). Delivered via SQS with DLQ to DocStudio action-group Lambda.

### Cache strategy (ElastiCache/Redis)
Cache the current approved manual/procedure index and controlled-distribution acknowledgment status per tenant (hot read on every module's "linked procedure" lookups). Invalidate on `Document.Published`.

### OpenSearch use
AOSS VECTORSEARCH backs Bedrock KB semantic search over tenant documents + ISO standard text (dimension 1024, Titan Embed v2). **All AOSS reads use exponential-backoff retry with a ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).** Bedrock KB service role must be present in the AOSS data-access policy.

---

## M2 — CAPA `[EXISTING]`

### Purpose
Nonconformity management, root-cause analysis, corrective action lifecycle, and effectiveness verification across all three standards, including the ISO 45001-specific incident dimension.

### ISO clauses covered
- **ISO 9001:2015** — 8.7 Control of nonconforming outputs; 10.2 Nonconformity and corrective action.
- **ISO 14001:2015** — 10.2 Nonconformity and corrective action.
- **ISO 45001:2018** — 10.2 Incident, nonconformity and corrective action (note: 45001 adds "Incident").

### Core data entities (RDS tables)
- `nonconformities` (id, tenant_id, standard, source[audit|incident|complaint|process], nc_type[nonconforming_output|nc|incident], description, clause_ref, severity, status, raised_by, raised_at)
- `root_cause_analyses` (id, nc_id, method[5why|fishbone|fta], findings, root_cause_summary)
- `corrective_actions` (id, nc_id, action_desc, owner_id, due_date, status, containment_flag)
- `capa_effectiveness_checks` (id, corrective_action_id, verification_method, verified_by, verified_at, effective_bool)
- `nonconforming_outputs` (id, nc_id, disposition[rework|scrap|concession|regrade], authorized_by) — 9001 8.7 specific

### Owning + collaborating agents
- **Owning:** CAPAGuru (Nova Pro).
- **Collaborating:** NCTriage (Nova Lite — classifies/routes incoming NCs, feeds CAPAGuru); IncidentInvestigator (Nova Pro — 45001 10.2 incidents + 14001 env incidents); LeadAuditor (audit findings → NC); RiskSentinel (risk linkage); RecordsVault (persists CAPA records + immutable trail). **Chain:** NCTriage → CAPAGuru → RecordsVault; LeadAuditor → (findings) → CAPAGuru.

### AppSync operations
- `query getNonconformity(id): Nonconformity @aws_cognito`
- `query listOpenCAPAs(filter): [CorrectiveAction] @aws_cognito`
- `mutation raiseNonconformity(input): Nonconformity @aws_cognito`
- `mutation recordRootCause(input): RootCauseAnalysis @aws_cognito`
- `mutation createCorrectiveAction(input): CorrectiveAction @aws_cognito`
- `mutation verifyEffectiveness(input): CapaEffectivenessCheck @aws_cognito`
- `mutation agentTriageNC(input): Nonconformity @aws_iam` (NCTriage) 
- `mutation agentProposeCorrectiveAction(input): CorrectiveAction @aws_iam` (CAPAGuru; HITL-gated)
- `subscription onCAPAStatusChanged(tenantId): CorrectiveAction @aws_cognito` (tenant-claim verified)
- `mutation publishCAPAEvent(input): CAPAEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `NC.Raised`, `CAPA.Opened`, `CAPA.Closed`, `CAPA.EffectivenessVerified`, `CAPA.ActionRequiresDocChange` (→ M1).
- **Consumed:** `Audit.FindingRaised` (M3), `Incident.Reported` (M10), `EnvIncident.Reported` (M9), `Hazard.RiskEscalated` (M10→M5→M2 chain), `Aspect.SignificantImpact` (M9). SQS + DLQ.

### Cache strategy
Cache the open-CAPA dashboard (counts by standard/severity/owner/overdue) per tenant; invalidate on any `CAPA.*` event.

### OpenSearch use
AOSS semantic search over historical NCs/root causes for "similar past nonconformity" retrieval by CAPAGuru. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## M3 — Audit Studio `[EXISTING]`

### Purpose
Internal audit programme management, checklist generation, finding capture, and audit-readiness scoring across all three standards.

### ISO clauses covered
- **ISO 9001:2015** — 9.2 Internal audit.
- **ISO 14001:2015** — 9.2 Internal audit (9.2.1 general, 9.2.2 internal audit programme).
- **ISO 45001:2018** — 9.2 Internal audit (9.2.1 general, 9.2.2 internal audit programme).

### Core data entities (RDS tables)
- `audit_programmes` (id, tenant_id, standard, year, frequency_plan, status)
- `audits` (id, programme_id, standard, scope, lead_auditor_id, planned_date, actual_date, status)
- `audit_checklists` (id, audit_id, clause_ref, question, expected_evidence)
- `audit_findings` (id, audit_id, checklist_id, finding_type[major_nc|minor_nc|observation|ofi], clause_ref, description, evidence_ref)
- `audit_readiness_scores` (id, tenant_id, standard, clause_ref, score, assessed_at)

### Owning + collaborating agents
- **Owning:** LeadAuditor (Nova Pro).
- **Collaborating:** CAPAGuru (findings → CAPA); the 3 Domain Gurus (clause-accurate checklist content); RecordsVault (audit evidence + trail); ControlTower (cross-standard combined-audit orchestration). **Fan-out:** LeadAuditor fans out checklist generation in parallel per clause.

### AppSync operations
- `query getAudit(id): Audit @aws_cognito`
- `query getAuditReadiness(standard): [ReadinessScore] @aws_cognito`
- `mutation createAuditProgramme(input): AuditProgramme @aws_cognito`
- `mutation scheduleAudit(input): Audit @aws_cognito`
- `mutation recordFinding(input): AuditFinding @aws_cognito`
- `mutation agentGenerateChecklist(auditId): [AuditChecklist] @aws_iam` (LeadAuditor)
- `mutation agentScoreReadiness(standard): [ReadinessScore] @aws_iam` (LeadAuditor)
- `subscription onFindingRecorded(tenantId): AuditFinding @aws_cognito` (tenant-claim verified)
- `mutation publishAuditEvent(input): AuditEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Audit.Scheduled`, `Audit.FindingRaised` (→ M2), `Audit.Completed`, `Readiness.Scored`.
- **Consumed:** `ManagementReview.ActionAudit` (M11), `Objectives.OffTrack` (M7 → targeted audit). SQS + DLQ.

### Cache strategy
Cache per-tenant readiness scorecard and audit calendar; invalidate on `Audit.Completed` / `Readiness.Scored`.

### OpenSearch use
AOSS backs checklist generation grounded in ISO KB + tenant procedures, and semantic finding-clustering. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).**

---

## M4 — Records Management `[EXISTING]`

### Purpose
Retention and control of records, calibration/monitoring-resource records, evidence storage, and the **immutable append-only audit trail** for the entire platform.

### ISO clauses covered
- **ISO 9001:2015** — 7.5 Documented information (retention/control of records); 7.1.5 Monitoring and measuring resources (7.1.5.1 general, 7.1.5.2 measurement traceability [calibration]).
- **ISO 14001:2015** — 7.5 Documented information (retention/control).
- **ISO 45001:2018** — 7.5 Documented information (retention/control).

### Core data entities (RDS tables)
- `records` (id, tenant_id, standard, record_type, source_module, retention_class, retain_until, s3_object_ref, object_lock_until)
- `retention_policies` (id, tenant_id, record_type, retention_years, disposition_rule)
- `measuring_resources` (id, tenant_id, asset_tag, description, status) — 7.1.5
- `calibration_records` (id, measuring_resource_id, calibrated_at, next_due, standard_used, traceability_ref, result) — 7.1.5.2
- **Immutable audit trail:** append-only event log — authoritative mirror in DynamoDB `CumplifyCore` (append-only, `attribute_not_exists(pk)` idempotency) + sealed archive in S3 Object Lock COMPLIANCE.

### Owning + collaborating agents
- **Owning:** RecordsVault (Nova Lite) — also serves M13.
- **Collaborating:** all mutating agents write evidence/trail through RecordsVault; CompetenceKeeper (shares RecordsVault for training records).

### AppSync operations
- `query getRecord(id): Record @aws_cognito`
- `query listCalibrationsDue(window): [CalibrationRecord] @aws_cognito`
- `query getAuditTrail(entityId): [AuditEvent] @aws_cognito` (Auditor/Executive ABAC; read-only)
- `mutation registerRecord(input): Record @aws_cognito`
- `mutation recordCalibration(input): CalibrationRecord @aws_cognito`
- `mutation appendAuditEvent(input): AuditEvent @aws_iam` (append-only; all agents/services)
- `subscription onCalibrationDue(tenantId): CalibrationRecord @aws_cognito` (tenant-claim verified)

> The audit trail exposes **no** update/delete mutations by design (append-only + S3 Object Lock COMPLIANCE WORM).

### Events emitted / consumed
- **Emitted:** `Record.Registered`, `Calibration.Due`, `Calibration.Recorded`, `AuditEvent.Appended`.
- **Consumed:** every `*.Approved` / `*.Closed` / `*.Raised` event platform-wide (mirrors into immutable trail). EventBridge fan-in + SQS with DLQ.

### Cache strategy
Cache calibration-due list and retention dashboard per tenant; invalidate on `Calibration.Recorded`.

### OpenSearch use
AOSS backs **audit-trail semantic retrieval** and compliance-record search. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## M5 — Risk Management `[EXISTING]`

### Purpose
Cross-standard risk-and-opportunity register, risk-based thinking (9001), and change planning. Hosts the unified cross-register risk view spanning quality, environmental aspects, and OH&S hazards.

### ISO clauses covered
- **ISO 9001:2015** — 6.1 Actions to address risks and opportunities (risk-based thinking); 6.3 Planning of changes.
- **ISO 14001:2015** — 6.1 Actions to address risks and opportunities (6.1.1 general, 6.1.4 planning action).
- **ISO 45001:2018** — 6.1 Actions to address risks and opportunities (6.1.1 general, 6.1.4 planning action); 8.1.3 Management of change.

### Core data entities (RDS tables)
- `risks` (id, tenant_id, standard, category[quality|environmental|ohs|opportunity], source_ref[aspect_id|hazard_id|process], description, likelihood, severity, risk_rating, treatment, owner_id, status)
- `risk_treatments` (id, risk_id, action_desc, owner_id, due_date, status)
- `change_plans` (id, tenant_id, standard, change_desc, impact_assessment, approval_status) — 9001 6.3 / 45001 8.1.3
- `risk_register_view` (materialized cross-standard rollup)

### Owning + collaborating agents
- **Owning:** RiskSentinel (Nova Pro).
- **Collaborating:** AspectWarden (14001 aspects → risk); HazardScout (45001 hazards → risk); CAPAGuru (risk-driven CAPA). **Chains:** HazardScout → RiskSentinel → CAPAGuru; AspectWarden → RiskSentinel.

### AppSync operations
- `query getRisk(id): Risk @aws_cognito`
- `query getCrossRegisterRiskView(filter): [Risk] @aws_cognito`
- `mutation createRisk(input): Risk @aws_cognito`
- `mutation addRiskTreatment(input): RiskTreatment @aws_cognito`
- `mutation createChangePlan(input): ChangePlan @aws_cognito`
- `mutation agentAssessRisk(input): Risk @aws_iam` (RiskSentinel; HITL-gated on rating write)
- `subscription onRiskEscalated(tenantId): Risk @aws_cognito` (tenant-claim verified)
- `mutation publishRiskEvent(input): RiskEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Risk.Created`, `Risk.Escalated`, `Change.Planned`, `Hazard.RiskEscalated` (→ M2).
- **Consumed:** `Aspect.SignificantImpact` (M9), `Hazard.Identified` (M10), `Incident.Reported` (M10). SQS + DLQ.

### Cache strategy
Cache the **hot cross-register risk view** and top-risk dashboard per tenant; invalidate on `Risk.*`.

### OpenSearch use
AOSS semantic search over historical risks/treatments and ISO KB for treatment suggestions. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).**

---

## M6 — Context & Stakeholder Studio `[NEW]`

### Purpose
Capture organizational context, interested parties/workers, communication planning, and leadership roles — feeding scope determination across all three standards.

### ISO clauses covered
- **ISO 9001:2015** — 4.1 Understanding the organization and its context; 4.2 Understanding the needs and expectations of interested parties; 4.3 (scope inputs); 5.1 Leadership and commitment; 5.3 Organizational roles, responsibilities and authorities; 7.4 Communication.
- **ISO 14001:2015** — 4.1; 4.2; 4.3 (scope inputs); 5.1; 5.3; 7.4 Communication (7.4.1 general, 7.4.2 internal communication, 7.4.3 external communication).
- **ISO 45001:2018** — 4.1; 4.2 (needs/expectations of workers and other interested parties); 4.3 (scope inputs); 5.1; 5.3; 7.4 Communication (7.4.1 general, 7.4.2 internal, 7.4.3 external).

### Core data entities (RDS tables)
- `context_issues` (id, tenant_id, standard, issue_type[internal|external], description, relevance)
- `interested_parties` (id, tenant_id, standard, party_name, is_worker_bool, needs_expectations, is_compliance_obligation_bool)
- `roles_responsibilities` (id, tenant_id, standard, role_name, responsibilities, authority, assigned_to)
- `communication_plans` (id, tenant_id, standard, topic, direction[internal|external], audience, method, frequency, owner_id)

### Owning + collaborating agents
- **Owning:** ContextCartographer (Nova Lite).
- **Collaborating:** DocStudio (context → 4.3 scope in M1); LegalLedger (interested parties → compliance obligations, M8); ControlTower (5.1/5.3 governance); WorkerVoice (45001 worker inputs to 4.2).

### AppSync operations
- `query listContextIssues(standard): [ContextIssue] @aws_cognito`
- `query listInterestedParties(standard): [InterestedParty] @aws_cognito`
- `mutation createContextIssue(input): ContextIssue @aws_cognito`
- `mutation createInterestedParty(input): InterestedParty @aws_cognito`
- `mutation createCommunicationPlan(input): CommunicationPlan @aws_cognito`
- `mutation agentMapContext(input): [ContextIssue] @aws_iam` (ContextCartographer; HITL-gated)
- `subscription onContextUpdated(tenantId): ContextIssue @aws_cognito` (tenant-claim verified)
- `mutation publishContextEvent(input): ContextEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Context.Updated` (→ M1 scope review), `InterestedParty.Identified` (→ M8), `Communication.Planned`.
- **Consumed:** `Worker.ConsultationLogged` (M10 → 4.2 inputs), `ManagementReview.ContextInput` (M11). SQS + DLQ.

### Cache strategy
Cache the interested-parties and context matrix per tenant (read by M1, M8, M11); invalidate on `Context.Updated`.

### OpenSearch use
AOSS semantic search over prior context entries and ISO KB for peer/industry context prompts. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## M7 — Objectives & Targets `[NEW]`

### Purpose
Manage IMS objectives, targets, programmes, and KPIs (owner/due/progress) across all three standards, linked to monitoring.

### ISO clauses covered
- **ISO 9001:2015** — 6.2 Quality objectives and planning to achieve them; links to 9.1.1 Monitoring, measurement, analysis and evaluation (general).
- **ISO 14001:2015** — 6.2 Environmental objectives and planning to achieve them (6.2.1 objectives, 6.2.2 planning actions to achieve them); links to 9.1.1.
- **ISO 45001:2018** — 6.2 OH&S objectives and planning to achieve them (6.2.1 objectives, 6.2.2 planning to achieve); links to 9.1.1.

### Core data entities (RDS tables)
- `objectives` (id, tenant_id, standard, statement, target_value, unit, baseline, owner_id, due_date, status)
- `objective_programmes` (id, objective_id, action_desc, resources, responsible_id, timeline, means_of_evaluation)
- `kpis` (id, objective_id, name, current_value, target_value, measured_at, trend)
- `objective_progress` (id, objective_id, period, actual, on_track_bool)

### Owning + collaborating agents
- **Owning:** ObjectiveTracker (Nova Lite).
- **Collaborating:** AspectWarden / HazardScout / DocStudio (objective sources per standard); ReviewOrchestrator (9.3.2 inputs); LeadAuditor (off-track → targeted audit).

### AppSync operations
- `query listObjectives(standard): [Objective] @aws_cognito`
- `query getObjectivesDashboard(tenantId): Dashboard @aws_cognito`
- `mutation createObjective(input): Objective @aws_cognito`
- `mutation updateObjectiveProgress(input): ObjectiveProgress @aws_cognito`
- `mutation createProgramme(input): ObjectiveProgramme @aws_cognito`
- `mutation agentTrackObjectives(tenantId): [Objective] @aws_iam` (ObjectiveTracker)
- `subscription onObjectiveOffTrack(tenantId): Objective @aws_cognito` (tenant-claim verified)
- `mutation publishObjectiveEvent(input): ObjectiveEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Objectives.Updated`, `Objectives.OffTrack` (→ M3, M11).
- **Consumed:** `Enviro.MonitoringLogged` (M9), `Safety.MetricLogged` (M10), `ManagementReview.ObjectivesSet` (M11). SQS + DLQ.

### Cache strategy
Cache the **objectives dashboard** per tenant (hot register); invalidate on `Objectives.Updated`.

### OpenSearch use
None required for core CRUD. (If SMART-objective drafting is enabled, AOSS KB grounding applies with **exponential-backoff retry + ≥45 s cold-start timeout budget**.)

---

## M8 — Compliance Obligations Register (Legal Register) `[NEW]`

### Purpose
Maintain the register of legal and other requirements (environmental compliance obligations; OH&S legal & other requirements) and evaluate compliance.

### ISO clauses covered
- **ISO 14001:2015** — 6.1.3 Compliance obligations; 9.1.2 Evaluation of compliance.
- **ISO 45001:2018** — 6.1.3 Determination of legal requirements and other requirements; 9.1.2 Evaluation of compliance.
- *(9001 has no compliance-obligations clause; this module is 14001/45001 only.)*

### Core data entities (RDS tables)
- `compliance_obligations` (id, tenant_id, standard[14001|45001], obligation_type[legal|other], title, jurisdiction, source_reference, applicability, owner_id, review_due)
- `obligation_requirements` (id, obligation_id, requirement_text, related_aspect_id, related_hazard_id)
- `compliance_evaluations` (id, obligation_id, evaluated_at, evaluated_by, status[compliant|non_compliant|partial], evidence_ref, next_evaluation_due) — 9.1.2

### Owning + collaborating agents
- **Owning:** LegalLedger (Claude Sonnet 4.6).
- **Collaborating:** AspectWarden (obligations ↔ 14001 aspects); HazardScout (obligations ↔ 45001 hazards); CAPAGuru (non-compliance → CAPA); ContextCartographer (interested parties → obligations).

### AppSync operations
- `query listObligations(standard): [ComplianceObligation] @aws_cognito`
- `query getComplianceStatus(standard): [ComplianceEvaluation] @aws_cognito`
- `mutation createObligation(input): ComplianceObligation @aws_cognito`
- `mutation recordComplianceEvaluation(input): ComplianceEvaluation @aws_cognito`
- `mutation agentIdentifyObligations(input): [ComplianceObligation] @aws_iam` (LegalLedger; HITL-gated)
- `subscription onComplianceStatusChanged(tenantId): ComplianceEvaluation @aws_cognito` (tenant-claim verified)
- `mutation publishComplianceEvent(input): ComplianceEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Obligation.Added`, `Compliance.Evaluated`, `Compliance.NonCompliance` (→ M2), `Obligation.ReviewDue`.
- **Consumed:** `InterestedParty.Identified` (M6), `Aspect.SignificantImpact` (M9), `Hazard.Identified` (M10). SQS + DLQ.

### Cache strategy
Cache the **legal register** (hot compliance register) and compliance-status rollup per tenant; invalidate on `Obligation.Added` / `Compliance.Evaluated`.

### OpenSearch use
AOSS semantic search over obligation text + ISO KB for applicability mapping (LegalLedger). **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).**

---

## M9 — Environmental Management (EnviroStudio) `[NEW]`

### Purpose
Manage environmental aspects/impacts and their significance, operational controls, emergency preparedness, and environmental monitoring (waste/emissions/energy/water).

### ISO clauses covered
- **ISO 14001:2015** — 6.1.2 Environmental aspects (and impacts, significance determination); 8.1 Operational planning and control (environmental operational controls); 8.2 Emergency preparedness and response; 9.1.1 Monitoring, measurement, analysis and evaluation (general — waste/emissions/energy/water).

### Core data entities (RDS tables)
- `environmental_aspects` (id, tenant_id, activity, aspect, impact, condition[normal|abnormal|emergency], lifecycle_stage, significance_score, is_significant_bool, owner_id) — 6.1.2
- `env_operational_controls` (id, aspect_id, control_desc, control_type, procedure_ref) — 8.1
- `env_emergency_plans` (id, tenant_id, scenario, response_procedure, drill_frequency, last_drill_at) — 8.2
- `env_monitoring_readings` (id, tenant_id, metric[waste|emissions|energy|water], value, unit, measured_at, source) — 9.1.1

### Owning + collaborating agents
- **Owning:** AspectWarden (Nova Pro).
- **Collaborating:** RiskSentinel (significant aspects → risk); LegalLedger (aspects ↔ obligations); EmergencyPlanner (Nova Lite — 14001 8.2, shared with M10); IncidentInvestigator (env incidents → 14001 10.2 via M2); ObjectiveTracker (monitoring → objectives). **Chain:** AspectWarden → RiskSentinel.

### AppSync operations
- `query listAspects(filter): [EnvironmentalAspect] @aws_cognito`
- `query getEnvMonitoring(metric, window): [EnvMonitoringReading] @aws_cognito`
- `mutation createAspect(input): EnvironmentalAspect @aws_cognito`
- `mutation evaluateSignificance(aspectId): EnvironmentalAspect @aws_cognito`
- `mutation logEnvReading(input): EnvMonitoringReading @aws_cognito`
- `mutation createEnvEmergencyPlan(input): EnvEmergencyPlan @aws_cognito`
- `mutation agentAssessAspects(input): [EnvironmentalAspect] @aws_iam` (AspectWarden; HITL-gated on significance write)
- `subscription onSignificantAspect(tenantId): EnvironmentalAspect @aws_cognito` (tenant-claim verified)
- `mutation publishEnviroEvent(input): EnviroEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Aspect.SignificantImpact` (→ M5, M8, M2), `Enviro.MonitoringLogged` (→ M7), `EnvIncident.Reported` (→ M2), `EnvEmergency.PlanUpdated`.
- **Consumed:** `Obligation.Added` (M8 → aspect applicability), `Change.Planned` (M5). SQS + DLQ.

### Cache strategy
Cache the significant-aspects register and environmental-monitoring dashboard per tenant; invalidate on significance change / new reading.

### OpenSearch use
AOSS semantic search over aspect libraries + ISO 14001 KB for significance guidance. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## M10 — Safety Operations (OH&S / EHS Ops) `[NEW]`

### Purpose
Hazard identification and OH&S risk assessment with the hierarchy of controls, hazard elimination, management of change, procurement/contractors/outsourcing, emergency preparedness, incident management, and worker consultation & participation.

### ISO clauses covered
- **ISO 45001:2018** — 6.1.2 Hazard identification and assessment of risks and opportunities (6.1.2.1 hazard identification, 6.1.2.2 assessment of OH&S risks and other risks, 6.1.2.3 assessment of OH&S opportunities and other opportunities); 8.1.2 Eliminating hazards and reducing OH&S risks (hierarchy of controls); 8.1.3 Management of change; 8.1.4 Procurement (8.1.4.1 general, 8.1.4.2 contractors, 8.1.4.3 outsourcing); 8.2 Emergency preparedness and response; 10.2 Incident, nonconformity and corrective action; 5.4 Consultation and participation of workers (unique to 45001).

### Core data entities (RDS tables)
- `hazards` (id, tenant_id, activity, hazard_desc, hazard_source, affected_workers) — 6.1.2.1
- `ohs_risk_assessments` (id, hazard_id, likelihood, severity, risk_rating, existing_controls) — 6.1.2.2
- `hierarchy_of_controls` (id, hazard_id, control_level[eliminate|substitute|engineering|admin|ppe], control_desc, status) — 8.1.2
- `ohs_moc` (id, tenant_id, change_desc, ohs_impact, approval_status) — 8.1.3
- `ohs_procurement_controls` (id, tenant_id, type[general|contractor|outsourcing], party_ref, control_desc) — 8.1.4
- `ohs_emergency_plans` (id, tenant_id, scenario, response_procedure, drill_frequency, last_drill_at) — 8.2
- `incidents` (id, tenant_id, incident_type[injury|near_miss|illness], description, occurred_at, severity, status) — 10.2
- `worker_consultations` (id, tenant_id, topic, method[consultation|participation], workers_involved, outcome, logged_at) — 5.4

### Owning + collaborating agents
- **Owning:** HazardScout (Nova Pro).
- **Collaborating:** WorkerVoice (Nova Lite — 5.4, unique to 45001); IncidentInvestigator (Nova Pro — 45001 10.2, → M2); EmergencyPlanner (Nova Lite — 8.2, shared with M9); SupplierScout (8.1.4 procurement/contractors); RiskSentinel (hazard → risk). **Chain:** HazardScout → RiskSentinel → CAPAGuru.

### AppSync operations
- `query listHazards(filter): [Hazard] @aws_cognito`
- `query getIncident(id): Incident @aws_cognito`
- `query listWorkerConsultations(window): [WorkerConsultation] @aws_cognito`
- `mutation createHazard(input): Hazard @aws_cognito`
- `mutation assessOHSRisk(input): OhsRiskAssessment @aws_cognito`
- `mutation addControl(input): HierarchyOfControls @aws_cognito`
- `mutation reportIncident(input): Incident @aws_cognito`
- `mutation logWorkerConsultation(input): WorkerConsultation @aws_cognito`
- `mutation createOHSMoC(input): OhsMoc @aws_cognito`
- `mutation agentIdentifyHazards(input): [Hazard] @aws_iam` (HazardScout; HITL-gated on risk-rating write)
- `mutation agentInvestigateIncident(input): Incident @aws_iam` (IncidentInvestigator)
- `subscription onIncidentReported(tenantId): Incident @aws_cognito` (tenant-claim verified)
- `mutation publishSafetyEvent(input): SafetyEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Hazard.Identified` (→ M5, M8), `Hazard.RiskEscalated` (→ M2), `Incident.Reported` (→ M2, M5), `Worker.ConsultationLogged` (→ M6), `Safety.MetricLogged` (→ M7), `OHSEmergency.PlanUpdated`.
- **Consumed:** `Supplier.Onboarded` (M12 → contractor controls), `Change.Planned` (M5), `Obligation.Added` (M8). SQS + DLQ.

### Cache strategy
Cache the **hazard register** and open-incident dashboard per tenant (hot register); invalidate on `Hazard.Identified` / `Incident.Reported`.

### OpenSearch use
AOSS semantic search over hazard libraries + ISO 45001 KB for hierarchy-of-controls suggestions and incident precedent. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).**

---

## M11 — Management Review `[NEW]`

### Purpose
Structure the management review across all three standards: gather inputs, capture outputs/decisions, record minutes and action items.

### ISO clauses covered
- **ISO 9001:2015** — 9.3 Management review (9.3.1 general, 9.3.2 management review inputs, 9.3.3 management review outputs).
- **ISO 14001:2015** — 9.3 Management review.
- **ISO 45001:2018** — 9.3 Management review.

### Core data entities (RDS tables)
- `management_reviews` (id, tenant_id, standard_scope[9001|14001|45001|IMS], review_date, chair_id, status)
- `review_inputs` (id, review_id, input_category, source_module, summary, data_ref) — 9.3.2
- `review_outputs` (id, review_id, decision, output_category[improvement|resource|change], rationale) — 9.3.3
- `review_action_items` (id, review_id, action_desc, owner_id, due_date, status)
- `review_minutes` (id, review_id, minutes_ref[S3], recorded_by)

### Owning + collaborating agents
- **Owning:** ReviewOrchestrator (Nova Pro).
- **Collaborating (parallel fan-out for 9.3.2 inputs):** LeadAuditor (audit results), CAPAGuru (NC/CAPA status), ObjectiveTracker (objectives status), AspectWarden (env performance), HazardScout (OH&S performance), LegalLedger (compliance status), RiskSentinel (risk changes), ContextCartographer (context/interested-party changes). ControlTower supervises.

### AppSync operations
- `query getManagementReview(id): ManagementReview @aws_cognito`
- `query listReviewActionItems(status): [ReviewActionItem] @aws_cognito`
- `mutation scheduleManagementReview(input): ManagementReview @aws_cognito`
- `mutation recordReviewOutput(input): ReviewOutput @aws_cognito`
- `mutation createReviewActionItem(input): ReviewActionItem @aws_cognito`
- `mutation agentGatherReviewInputs(reviewId): [ReviewInput] @aws_iam` (ReviewOrchestrator; parallel fan-out)
- `subscription onReviewCompleted(tenantId): ManagementReview @aws_cognito` (tenant-claim verified)
- `mutation publishReviewEvent(input): ReviewEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `ManagementReview.ActionAudit` (→ M3), `ManagementReview.ObjectivesSet` (→ M7), `ManagementReview.ContextInput` (→ M6), `Review.Completed`.
- **Consumed (fan-in for 9.3.2):** `Audit.Completed`, `CAPA.Closed`, `Objectives.Updated`, `Aspect.SignificantImpact`, `Incident.Reported`, `Compliance.Evaluated`, `Risk.Escalated`, `Context.Updated`. EventBridge fan-in + SQS with DLQ.

### Cache strategy
Cache the assembled 9.3.2 input bundle per pending review and the open-action-item list per tenant; invalidate on `Review.Completed`.

### OpenSearch use
AOSS retrieval to summarize prior review minutes and cross-standard performance narratives. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## M12 — Supplier & External Provider Management `[NEW]`

### Purpose
Control of externally provided processes, products, and services, plus environmental and OH&S procurement/contractor/outsourcing controls, with evaluation and monitoring.

### ISO clauses covered
- **ISO 9001:2015** — 8.4 Control of externally provided processes, products and services (8.4.1 general, 8.4.2 type and extent of control, 8.4.3 information for external providers).
- **ISO 14001:2015** — 8.1 Operational planning and control (procurement / lifecycle control of external providers).
- **ISO 45001:2018** — 8.1.4 Procurement (8.1.4.1 general, 8.1.4.2 contractors, 8.1.4.3 outsourcing).

### Core data entities (RDS tables)
- `suppliers` (id, tenant_id, name, provider_type[process|product|service|contractor|outsourced], approval_status, criticality)
- `supplier_evaluations` (id, supplier_id, evaluated_at, criteria, score, outcome, evaluated_by) — 8.4.1/8.4.2
- `supplier_requirements` (id, supplier_id, standard, requirement_communicated, communicated_at) — 8.4.3 / 14001 8.1 / 45001 8.1.4
- `supplier_monitoring` (id, supplier_id, period, performance_metric, value, status)

### Owning + collaborating agents
- **Owning:** SupplierScout (Nova Lite).
- **Collaborating:** DocStudio (external-provider requirement docs); HazardScout / M10 (contractor OH&S controls, 8.1.4); AspectWarden / M9 (supplier environmental controls, 14001 8.1); CAPAGuru (supplier NC → CAPA).

### AppSync operations
- `query listSuppliers(filter): [Supplier] @aws_cognito`
- `query getApprovedSupplierList(): [Supplier] @aws_cognito`
- `mutation createSupplier(input): Supplier @aws_cognito`
- `mutation evaluateSupplier(input): SupplierEvaluation @aws_cognito`
- `mutation communicateRequirements(input): SupplierRequirement @aws_cognito`
- `mutation agentAssessSupplier(input): SupplierEvaluation @aws_iam` (SupplierScout; HITL-gated on approval status)
- `subscription onSupplierStatusChanged(tenantId): Supplier @aws_cognito` (tenant-claim verified)
- `mutation publishSupplierEvent(input): SupplierEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Supplier.Onboarded` (→ M10 contractor controls), `Supplier.Evaluated`, `Supplier.NonConformance` (→ M2).
- **Consumed:** `CAPA.Closed` (supplier-related), `Obligation.Added` (M8 → supplier requirements). SQS + DLQ.

### Cache strategy
Cache the **approved-supplier list** (hot register) and supplier-scorecard per tenant; invalidate on `Supplier.Evaluated` / `Supplier.Onboarded`.

### OpenSearch use
AOSS semantic search over supplier documentation + ISO KB for requirement-clause mapping. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero cold start up to 45 s).**

---

## M13 — Competence & Training `[NEW]`

### Purpose
Manage competence, awareness, training records, expiry tracking, and competency verification across all three standards.

### ISO clauses covered
- **ISO 9001:2015** — 7.2 Competence; 7.3 Awareness.
- **ISO 14001:2015** — 7.2 Competence; 7.3 Awareness.
- **ISO 45001:2018** — 7.2 Competence; 7.3 Awareness.

### Core data entities (RDS tables)
- `competence_requirements` (id, tenant_id, standard, role_or_function, required_competency, evidence_basis)
- `training_records` (id, tenant_id, worker_id, training_title, standard, completed_at, expiry_date, provider, evidence_ref)
- `competency_verifications` (id, worker_id, competence_requirement_id, verified_by, verified_at, result)
- `awareness_campaigns` (id, tenant_id, standard, topic, audience_role, delivered_at, acknowledgment_rate) — 7.3

### Owning + collaborating agents
- **Owning:** CompetenceKeeper (Nova Lite).
- **Collaborating:** RecordsVault (Nova Lite — persists training records to 7.5; shared ownership per roster); ContextCartographer (roles → competence requirements); WorkerVoice (awareness participation, 45001).

### AppSync operations
- `query getWorkerCompetence(workerId): [CompetencyVerification] @aws_cognito`
- `query listTrainingExpiring(window): [TrainingRecord] @aws_cognito`
- `mutation createCompetenceRequirement(input): CompetenceRequirement @aws_cognito`
- `mutation recordTraining(input): TrainingRecord @aws_cognito`
- `mutation verifyCompetency(input): CompetencyVerification @aws_cognito`
- `mutation logAwarenessCampaign(input): AwarenessCampaign @aws_cognito`
- `mutation agentAssessCompetenceGaps(tenantId): [CompetenceRequirement] @aws_iam` (CompetenceKeeper)
- `subscription onTrainingExpiring(tenantId): TrainingRecord @aws_cognito` (tenant-claim verified)
- `mutation publishCompetenceEvent(input): CompetenceEvent @aws_iam` (None data source)

### Events emitted / consumed
- **Emitted:** `Training.Recorded`, `Training.Expiring`, `Competence.GapIdentified`, `Awareness.Delivered`.
- **Consumed:** `Role.Assigned` (M6 → competence requirement), `Incident.Reported` (M10 → retraining trigger), `Document.Published` (M1 → awareness campaign). SQS + DLQ.

### Cache strategy
Cache training-expiry list and per-worker competence matrix per tenant; invalidate on `Training.Recorded` / `Training.Expiring`.

### OpenSearch use
AOSS semantic search over training catalog + ISO KB for competence-gap suggestions. **Exponential-backoff retry, ≥45 s cold-start timeout budget (scale-to-zero).**

---

## Appendix A — Module ↔ Agent ↔ Standard Matrix

| Module | Status | Owning agent | Standards | Hot cache register |
|---|---|---|---|---|
| M1 Document Studio | EXISTING | DocStudio (Nova Pro) | 9001/14001/45001 | Manual/procedure index |
| M2 CAPA | EXISTING | CAPAGuru (Nova Pro) | 9001/14001/45001 | Open-CAPA dashboard |
| M3 Audit Studio | EXISTING | LeadAuditor (Nova Pro) | 9001/14001/45001 | Readiness scorecard |
| M4 Records Management | EXISTING | RecordsVault (Nova Lite) | 9001/14001/45001 | Calibration-due list |
| M5 Risk Management | EXISTING | RiskSentinel (Nova Pro) | 9001/14001/45001 | Cross-register risk view |
| M6 Context & Stakeholder | NEW | ContextCartographer (Nova Lite) | 9001/14001/45001 | Interested-parties matrix |
| M7 Objectives & Targets | NEW | ObjectiveTracker (Nova Lite) | 9001/14001/45001 | Objectives dashboard |
| M8 Compliance Obligations | NEW | LegalLedger (Sonnet 4.6) | 14001/45001 | Legal register |
| M9 EnviroStudio | NEW | AspectWarden (Nova Pro) | 14001 | Significant-aspects register |
| M10 Safety Operations | NEW | HazardScout (Nova Pro) | 45001 | Hazard register |
| M11 Management Review | NEW | ReviewOrchestrator (Nova Pro) | 9001/14001/45001 | 9.3.2 input bundle |
| M12 Supplier Management | NEW | SupplierScout (Nova Lite) | 9001/14001/45001 | Approved-supplier list |
| M13 Competence & Training | NEW | CompetenceKeeper (Nova Lite) | 9001/14001/45001 | Training-expiry list |

## Appendix B — Cross-Module Event Chains (EventBridge `cumplify-events` + SQS/DLQ)
- **NC/CAPA chain:** `Audit.FindingRaised` (M3) / `Incident.Reported` (M10) / `Aspect.SignificantImpact` (M9) → NCTriage → CAPAGuru → RecordsVault. (`NCTriage → CAPAGuru → RecordsVault`.)
- **Hazard chain:** `Hazard.Identified` (M10) → HazardScout → RiskSentinel → CAPAGuru. (`HazardScout → RiskSentinel → CAPAGuru`.)
- **Aspect chain:** `Aspect.SignificantImpact` (M9) → AspectWarden → RiskSentinel. (`AspectWarden → RiskSentinel`.)
- **Management review fan-in:** ReviewOrchestrator gathers 9.3.2 inputs in **parallel fan-out** from LeadAuditor, CAPAGuru, ObjectiveTracker, AspectWarden, HazardScout, LegalLedger, RiskSentinel, ContextCartographer.
- **Audit trail fan-in:** every `*.Approved`/`*.Closed`/`*.Raised`/`*.Evaluated` event mirrors into M4's append-only immutable trail (DynamoDB `CumplifyCore` + S3 Object Lock COMPLIANCE archive).
- **Advisory routing:** ComplianceCopilot (Nova Pro, user-facing router) routes clause Q&A to the 3 Domain Gurus (ISO9001/14001/45001, Sonnet 4.6). ControlTower (Nova Pro) supervises all mutating multi-agent collaboration.
