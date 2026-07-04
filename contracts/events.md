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
| Records | `Record.Registered`, `Calibration.Due`, `Calibration.Recorded`, `AuditEvent.Appended` |
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
