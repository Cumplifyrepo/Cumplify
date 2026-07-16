/**
 * Audit-trail designation registry (OQ-5, ratified 2026-07-07).
 *
 * Maps every registered detailType to its auditTrail boolean.
 * - true = domain state transition → routes to audit-sink (R-3).
 * - false = advisory/notification → does NOT route to audit-sink.
 *
 * Publishing an unregistered detailType throws at runtime.
 * A parity test asserts this map matches contracts/events.md.
 */
export const AUDIT_TRAIL_REGISTRY: Record<string, boolean> = {
  // --- Seed Taxonomy (46 events) ---
  // Document domain
  'Document.Approved': true,
  'Document.Published': true,
  'Policy.Updated': true,
  'Scope.Changed': true,
  // CAPA domain
  'NC.Raised': true,
  'CAPA.Opened': true,
  'CAPA.Closed': true,
  'CAPA.EffectivenessVerified': true,
  'CAPA.ActionRequiresDocChange': true,
  // Audit domain
  'Audit.Scheduled': true,
  'Audit.FindingRaised': true,
  'Audit.Completed': true,
  'Readiness.Scored': false,
  // Records domain
  'Record.Registered': true,
  'Calibration.Due': false,
  'Calibration.Recorded': true,
  'AuditEvent.Appended': true,
  // Risk domain
  'Risk.Created': true,
  'Risk.Escalated': true,
  'Change.Planned': true,
  // Context domain
  'Context.Updated': true,
  'InterestedParty.Identified': true,
  'Communication.Planned': true,
  // Objectives domain
  'Objectives.Updated': true,
  'Objectives.OffTrack': false,
  // Compliance domain
  'Obligation.Added': true,
  'Compliance.Evaluated': true,
  'Compliance.NonCompliance': true,
  'Obligation.ReviewDue': false,
  // Enviro domain
  'Aspect.SignificantImpact': true,
  'Enviro.MonitoringLogged': true,
  'EnvIncident.Reported': true,
  'EnvEmergency.PlanUpdated': true,
  // Safety domain
  'Hazard.Identified': true,
  'Hazard.RiskEscalated': true,
  'Incident.Reported': true,
  'Worker.ConsultationLogged': true,
  'Safety.MetricLogged': true,
  'OHSEmergency.PlanUpdated': true,
  // Supplier domain
  'Supplier.Onboarded': true,
  'Supplier.Evaluated': true,
  'Supplier.NonConformance': true,
  // Competence domain
  'Training.Recorded': true,
  'Training.Expiring': false,
  'Competence.GapIdentified': true,
  'Awareness.Delivered': true,
  // Management Review domain
  'ManagementReview.ActionAudit': true,
  'ManagementReview.ObjectivesSet': true,
  'ManagementReview.ContextInput': true,
  'Review.Completed': true,

  // --- Spec 3 new registrations (8 events) ---
  'Document.DraftCreated': true,
  'Document.SubmittedForApproval': true,
  'CAPA.RootCauseRecorded': true,
  'CAPA.OutputDisposed': true,
  'Audit.ProgrammeCreated': true,
  'Audit.ChecklistGenerated': false,
  'Risk.TreatmentAdded': true,
  'Record.RetentionPolicySet': true,

  // --- Spec 8R: agent writeback (Task 8R, H-3) ---
  'Agent.WritebackCommitted': true,

  // --- Spec 9 (frontend-app): HITL approval events ---
  'Hitl.Approved': true,
  'Hitl.SentBack': true,

  // --- Architect follow-up 2026-07-14 (Phase C checkpoint, M4 unblock) ---
  'MeasuringResource.Registered': true,

  // --- Spec 41 (qms-forms-engine): record lifecycle + SoD (BC-4/BC-5).
  // Found UNREGISTERED at the 2026-07-15 wave readback: forms.ts published
  // these since Tasks 5/6 but publish() threw 'Unregistered detailType' on
  // every call — masked live by a rollback-after-commit error. Registered by
  // architect; all four are audit-trail events (hash-chained).
  'FormRecord.Submitted': true,
  'FormRecord.Reopened': true,
  'FormRecord.Approved': true,
  'Security.SodViolationBlocked': true,

  // spec-40 generation pipeline (Task 5) — every section outcome and run
  // terminus is ledgered (GEN-7); registered same-commit as the publisher.
  'Generation.SectionComposed': true,
  'Generation.SectionFailed': true,
  'Generation.RunCompleted': true,

  // spec-40 GEN-6 (regenerateSection wave) — single-section regeneration with
  // new document versions; registered same-commit as the publisher.
  'Generation.SectionRegenerated': true,
};
