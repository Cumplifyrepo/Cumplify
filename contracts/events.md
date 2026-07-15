# Cumplify Event Taxonomy Registry

> **Append-only:** every later spec registers events here BEFORE use.
> Do not alter existing entries.

---

## Naming Convention

- **DetailType:** `<Domain>.<Action>` in PascalCase (e.g., `CAPA.Opened`, `Audit.FindingRaised`)
- **Source:** `cumplify.<module-id>.<module-name>` (e.g., `cumplify.m2.capa`)

---

## Envelope Schema (ET-4)

Every event published to the `cumplify-events` bus carries this detail payload:

```typescript
interface CumplifyEvent<T = Record<string, unknown>> {
  tenantId: string;       // tenant identifier
  eventId: string;        // ULID (auto-generated if absent)
  timestamp: string;      // ISO 8601
  actor: string;          // cognito sub or agentName
  module: string;         // M1..M13
  clauseRef: string;      // ISO clause string (e.g., "ISO 9001 10.2")
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
  auditTrail: boolean;    // true = routes to audit-sink (R-3); stamped by publisher from registry
  payload: T;             // domain-specific
}
```

---

## Canonical Queue-Message Contract (FIX-1)

Every SQS message body in every consumer queue has this shape — enforced by
input transformers on all EventBridge rule targets (direct SQS and FIFO-router):

```json
{
  "detailType": "<Domain>.<Action>",
  "detail": { /* CumplifyEvent */ }
}
```

Consumers validate `detailType` (string) and ET-4 fields on `.detail`.

---

## Seed Taxonomy (46 events)

| Domain | Events |
|--------|--------|
| Document | `Document.Approved`, `Document.Published`, `Policy.Updated`, `Scope.Changed` |
| CAPA | `NC.Raised`, `CAPA.Opened`, `CAPA.Closed`, `CAPA.EffectivenessVerified`, `CAPA.ActionRequiresDocChange` |
| Audit | `Audit.Scheduled`, `Audit.FindingRaised`, `Audit.Completed`, `Readiness.Scored` |
| Records | `Record.Registered`, `MeasuringResource.Registered`, `Calibration.Due`, `Calibration.Recorded`, `AuditEvent.Appended` |
| Risk | `Risk.Created`, `Risk.Escalated`, `Change.Planned` |
| Context | `Context.Updated`, `InterestedParty.Identified`, `Communication.Planned` |
| Objectives | `Objectives.Updated`, `Objectives.OffTrack` |
| Compliance | `Obligation.Added`, `Compliance.Evaluated`, `Compliance.NonCompliance`, `Obligation.ReviewDue` |
| Enviro | `Aspect.SignificantImpact`, `Enviro.MonitoringLogged`, `EnvIncident.Reported`, `EnvEmergency.PlanUpdated` |
| Safety | `Hazard.Identified`, `Hazard.RiskEscalated`, `Incident.Reported`, `Worker.ConsultationLogged`, `Safety.MetricLogged`, `OHSEmergency.PlanUpdated` |
| Supplier | `Supplier.Onboarded`, `Supplier.Evaluated`, `Supplier.NonConformance` |
| Competence | `Training.Recorded`, `Training.Expiring`, `Competence.GapIdentified`, `Awareness.Delivered` |
| ManagementReview | `ManagementReview.ActionAudit`, `ManagementReview.ObjectivesSet`, `ManagementReview.ContextInput`, `Review.Completed` |

---

## Spec 9 (frontend-app): HITL Approval Events

| Domain | Events |
|--------|--------|
| Hitl | `Hitl.Approved` (auditTrail: **true**), `Hitl.SentBack` (auditTrail: **true**) |

---

## Registry Notes

### Note 1 — Prefix matching vs domain membership (R-7 `records-q`)

The `records-q` rule (R-7) matches events by **detail-type PREFIX**: `CAPA.`, `Document.`, `Risk.`.

`Change.Planned` is in the **Risk domain** but does NOT match the `Risk.` prefix because its
detail-type starts with `Change.`, not `Risk.`. Record-bearing events are matched by detail-type
prefix, not by domain membership. Later specs adding record-bearing events must ensure the
detail-type starts with one of the three prefixes, or add a new prefix to R-7.

### Note 2 — Audit-sink rule (R-3) suffix matching

The audit-sink rule matches detail-type by suffix: `.Approved`, `.Closed`, `.Raised`, `.Evaluated`,
plus the constant `AuditEvent.Appended`.

**Mixed pattern (suffix operators + constant string) CONFIRMED VALID** by live `TestEventPattern`
API call (task 5, 2026-07-04). No fallback in effect — the primary pattern is deployed as-is.

Any future event whose detail-type ends with one of the four suffixes will automatically route to
the audit-sink FIFO queue. This is intentional: all state-transition events (approved, closed,
raised, evaluated) belong in the immutable audit trail.

---

## New Event Registrations (spec 3: api-core)

| Domain | Events |
|--------|--------|
| Document | `Document.DraftCreated`, `Document.SubmittedForApproval` |
| CAPA | `CAPA.RootCauseRecorded`, `CAPA.OutputDisposed` |
| Audit | `Audit.ProgrammeCreated`, `Audit.ChecklistGenerated` |
| Risk | `Risk.TreatmentAdded` |
| Records | `Record.RetentionPolicySet` |

---

## Trail Designation (OQ-5, ratified 2026-07-07)

> **Rule:** `auditTrail: true` = domain state transition that MUST be sealed
> in the immutable audit trail. `auditTrail: false` = advisory/operational
> event that informs downstream consumers but is not independently sealed.
> The publisher stamps this field from a compile-time registry map; publishing
> an unregistered detailType throws. R-3 pattern: `{ "detail": { "auditTrail": [true] } }`.

### Seed Taxonomy Trail Designations (46 events)

| detailType | auditTrail | Rationale |
|-----------|------------|-----------|
| `Document.Approved` | true | State transition: document enters approved state |
| `Document.Published` | true | State transition: controlled distribution begins |
| `Policy.Updated` | true | State transition: policy text changed |
| `Scope.Changed` | true | State transition: IMS scope boundaries altered |
| `NC.Raised` | true | State transition: nonconformity entered into system |
| `CAPA.Opened` | true | State transition: corrective action initiated |
| `CAPA.Closed` | true | State transition: corrective action completed |
| `CAPA.EffectivenessVerified` | true | State transition: effectiveness confirmed |
| `CAPA.ActionRequiresDocChange` | true | State transition: triggers document revision |
| `Audit.Scheduled` | true | State transition: audit committed to calendar |
| `Audit.FindingRaised` | true | State transition: finding entered |
| `Audit.Completed` | true | State transition: audit concluded |
| `Readiness.Scored` | false | Advisory: agent-computed score, not a controlled decision |
| `Record.Registered` | true | State transition: record enters retention control |
| `MeasuringResource.Registered` | true | State transition: measuring/monitoring equipment enters the calibration register |
| `Calibration.Due` | false | Advisory: upcoming deadline notification |
| `Calibration.Recorded` | true | State transition: calibration evidence captured |
| `AuditEvent.Appended` | true | The audit event itself (self-referential; sealed by definition) |
| `Risk.Created` | true | State transition: risk entered into register |
| `Risk.Escalated` | true | State transition: risk rating elevated |
| `Change.Planned` | true | State transition: change plan committed |
| `Context.Updated` | true | State transition: organizational context changed |
| `InterestedParty.Identified` | true | State transition: stakeholder registered |
| `Communication.Planned` | true | State transition: communication plan committed |
| `Objectives.Updated` | true | State transition: objectives changed |
| `Objectives.OffTrack` | false | Advisory: triggers review, not itself a controlled decision |
| `Obligation.Added` | true | State transition: legal requirement registered |
| `Compliance.Evaluated` | true | State transition: compliance status assessed |
| `Compliance.NonCompliance` | true | State transition: non-compliance finding |
| `Obligation.ReviewDue` | false | Advisory: upcoming deadline notification |
| `Aspect.SignificantImpact` | true | State transition: aspect significance determined |
| `Enviro.MonitoringLogged` | true | State transition: environmental measurement recorded |
| `EnvIncident.Reported` | true | State transition: environmental incident entered |
| `EnvEmergency.PlanUpdated` | true | State transition: emergency plan revised |
| `Hazard.Identified` | true | State transition: hazard entered into register |
| `Hazard.RiskEscalated` | true | State transition: hazard risk elevated |
| `Incident.Reported` | true | State transition: OH&S incident entered |
| `Worker.ConsultationLogged` | true | State transition: worker participation recorded |
| `Safety.MetricLogged` | true | State transition: safety measurement recorded |
| `OHSEmergency.PlanUpdated` | true | State transition: OH&S emergency plan revised |
| `Supplier.Onboarded` | true | State transition: supplier approved |
| `Supplier.Evaluated` | true | State transition: supplier assessment completed |
| `Supplier.NonConformance` | true | State transition: supplier NC raised |
| `Training.Recorded` | true | State transition: training evidence captured |
| `Training.Expiring` | false | Advisory: upcoming expiry notification |
| `Competence.GapIdentified` | true | State transition: gap assessment result |
| `Awareness.Delivered` | true | State transition: awareness campaign completed |

### Spec 3 New Registrations Trail Designations

| detailType | auditTrail | Rationale |
|-----------|------------|-----------|
| `Document.DraftCreated` | true | State transition: draft entered into system (C-3 compliance) |
| `Document.SubmittedForApproval` | true | State transition: document enters review workflow |
| `CAPA.RootCauseRecorded` | true | State transition: root-cause analysis phase completed |
| `CAPA.OutputDisposed` | true | State transition: nonconforming output disposition decided (8.7) |
| `Audit.ProgrammeCreated` | true | State transition: audit programme established (9.2.2) |
| `Audit.ChecklistGenerated` | false | Advisory: agent-generated checklist, not a controlled decision |
| `Risk.TreatmentAdded` | true | State transition: risk treatment plan committed (6.1) |
| `Record.RetentionPolicySet` | true | State transition: retention rules established (7.5.3) |

### Management Review Events (M11, for completeness)

| detailType | auditTrail | Rationale |
|-----------|------------|-----------|
| `ManagementReview.ActionAudit` | true | State transition: review action assigned |
| `ManagementReview.ObjectivesSet` | true | State transition: objectives committed from review |
| `ManagementReview.ContextInput` | true | State transition: context input gathered |
| `Review.Completed` | true | State transition: management review concluded |

### Agent Writeback Events (Task 8R, H-3)
| detailType | auditTrail | Rationale |
|-----------|------------|-----------|
| `Agent.WritebackCommitted` | true | State transition: HITL-approved agent mutation committed to RDS — sealed for audit completeness |

### QMS Forms & Records Events (spec 41 — registered at the 2026-07-15 wave readback)
| detailType | auditTrail | Rationale |
|-----------|------------|-----------|
| `FormRecord.Submitted` | true | State transition: record completed; NCR templates also materialize m2 rows (BC-3) |
| `FormRecord.Reopened` | true | State transition: immutable record explicitly reopened with justification (REC-4) |
| `FormRecord.Approved` | true | State transition: SoD-checked approval stamped (BC-4) |
| `Security.SodViolationBlocked` | true | Security event: self-approval attempt blocked — the attempt is ledgered, the write is not |
| `Generation.SectionComposed` | true | spec-40: section composed (prose/gap/na) — kind + assertion summary ledgered (GEN-7) |
| `Generation.SectionFailed` | true | spec-40: deterministic checker rejected the section after retry — violations ledgered, content NOT shipped |
| `Generation.RunCompleted` | true | spec-40: generation run terminal state (complete/partial) + section-status summary |
