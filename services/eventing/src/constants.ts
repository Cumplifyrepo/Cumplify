/**
 * Event source prefixes by module.
 * Used as the EventBridge `Source` field.
 */
export const EVENT_SOURCES = {
  M1: 'cumplify.m1.document-studio',
  M2: 'cumplify.m2.capa',
  M3: 'cumplify.m3.audit-studio',
  M4: 'cumplify.m4.records',
  M5: 'cumplify.m5.risk',
  M6: 'cumplify.m6.context',
  M7: 'cumplify.m7.objectives',
  M8: 'cumplify.m8.compliance',
  M9: 'cumplify.m9.enviro',
  M10: 'cumplify.m10.safety',
  M11: 'cumplify.m11.mgmt-review',
  M12: 'cumplify.m12.supplier',
  M13: 'cumplify.m13.competence',
} as const;

/**
 * Type-safe event name registry (Domain.Action).
 * Append-only — later specs add entries, never remove.
 */
export const EVENT_NAMES = {
  // Document (M1)
  'Document.Approved': 'Document.Approved',
  'Document.Published': 'Document.Published',
  'Policy.Updated': 'Policy.Updated',
  'Scope.Changed': 'Scope.Changed',
  // CAPA (M2)
  'NC.Raised': 'NC.Raised',
  'CAPA.Opened': 'CAPA.Opened',
  'CAPA.Closed': 'CAPA.Closed',
  'CAPA.EffectivenessVerified': 'CAPA.EffectivenessVerified',
  'CAPA.ActionRequiresDocChange': 'CAPA.ActionRequiresDocChange',
  // Audit (M3)
  'Audit.Scheduled': 'Audit.Scheduled',
  'Audit.FindingRaised': 'Audit.FindingRaised',
  'Audit.Completed': 'Audit.Completed',
  'Readiness.Scored': 'Readiness.Scored',
  // Records (M4)
  'Record.Registered': 'Record.Registered',
  'Calibration.Due': 'Calibration.Due',
  'Calibration.Recorded': 'Calibration.Recorded',
  'AuditEvent.Appended': 'AuditEvent.Appended',
  // Risk (M5)
  'Risk.Created': 'Risk.Created',
  'Risk.Escalated': 'Risk.Escalated',
  'Change.Planned': 'Change.Planned',
  // Context (M6)
  'Context.Updated': 'Context.Updated',
  'InterestedParty.Identified': 'InterestedParty.Identified',
  'Communication.Planned': 'Communication.Planned',
  // Objectives (M7)
  'Objectives.Updated': 'Objectives.Updated',
  'Objectives.OffTrack': 'Objectives.OffTrack',
  // Compliance (M8)
  'Obligation.Added': 'Obligation.Added',
  'Compliance.Evaluated': 'Compliance.Evaluated',
  'Compliance.NonCompliance': 'Compliance.NonCompliance',
  'Obligation.ReviewDue': 'Obligation.ReviewDue',
  // Enviro (M9)
  'Aspect.SignificantImpact': 'Aspect.SignificantImpact',
  'Enviro.MonitoringLogged': 'Enviro.MonitoringLogged',
  'EnvIncident.Reported': 'EnvIncident.Reported',
  'EnvEmergency.PlanUpdated': 'EnvEmergency.PlanUpdated',
  // Safety (M10)
  'Hazard.Identified': 'Hazard.Identified',
  'Hazard.RiskEscalated': 'Hazard.RiskEscalated',
  'Incident.Reported': 'Incident.Reported',
  'Worker.ConsultationLogged': 'Worker.ConsultationLogged',
  'Safety.MetricLogged': 'Safety.MetricLogged',
  'OHSEmergency.PlanUpdated': 'OHSEmergency.PlanUpdated',
  // Supplier (M12)
  'Supplier.Onboarded': 'Supplier.Onboarded',
  'Supplier.Evaluated': 'Supplier.Evaluated',
  'Supplier.NonConformance': 'Supplier.NonConformance',
  // Competence (M13)
  'Training.Recorded': 'Training.Recorded',
  'Training.Expiring': 'Training.Expiring',
  'Competence.GapIdentified': 'Competence.GapIdentified',
  'Awareness.Delivered': 'Awareness.Delivered',
  // ManagementReview (M11)
  'ManagementReview.ActionAudit': 'ManagementReview.ActionAudit',
  'ManagementReview.ObjectivesSet': 'ManagementReview.ObjectivesSet',
  'ManagementReview.ContextInput': 'ManagementReview.ContextInput',
  'Review.Completed': 'Review.Completed',
} as const;

export type EventName = keyof typeof EVENT_NAMES;
