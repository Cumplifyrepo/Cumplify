---
inclusion: fileMatch
fileMatchPattern: "services/**"
---
# Eventing Rules (spine D.4 + module-spec Appendix B)
EventBridge is the nervous system. Every domain mutation is an event.

## Bus
- Name: `cumplify-events` (primary application bus).
- All domain events route through this bus. Rules fan to consumer SQS queues.
- Why: a single bus = a single place to observe, a single place to add
  consumers, a single schema registry.

## Event naming
- Pattern: `<Domain>.<Action>` in PascalCase (module-spec supersedes spine's
  lowercase names).
- Examples (per module-spec): `Audit.FindingRaised`, `Incident.Reported`,
  `CAPA.Closed`, `Document.Published`, `Hazard.Identified`,
  `Aspect.SignificantImpact`, `Compliance.Evaluated`, `Objectives.OffTrack`,
  `Supplier.Evaluated`.
- Every event carries: `tenantId`, `eventId` (ULID), `timestamp`, `actor`,
  `module`, `clauseRef`, `standard`, `payload`.
- Why: consistent naming = reliable rules; tenantId on every event = audit
  traceability + tenant-scoped consumption.

## SQS + DLQ topology
- Every consumer queue has a paired DLQ. DLQ depth > 0 for 15 min = page.
- FIFO queues (messageGroupId = `tenantId`) where per-tenant ordering matters:
  CAPA lifecycle, audit sink.
- Marketplace `mp-lifecycle` queue: FIFO by `CustomerIdentifier` (events
  arrive before tenant resolution — do NOT group by tenantId).
- Standard queues elsewhere (hazard, aspect, review fan-out).
- Why: FIFO-by-tenant = causal ordering within a tenant without global
  ordering bottlenecks; DLQ = no silent event loss.

## Event chains (module-spec Appendix B)
- NC chain: `Audit.FindingRaised` / `Incident.Reported` /
  `Aspect.SignificantImpact` → NCTriage → CAPAGuru → RecordsVault.
- Hazard chain: `Hazard.Identified` → HazardScout → RiskSentinel → CAPAGuru.
- Aspect chain: `Aspect.SignificantImpact` → AspectWarden → RiskSentinel.
- Management review fan-in: ReviewOrchestrator gathers 9.3.2 inputs in
  parallel from LeadAuditor, CAPAGuru, ObjectiveTracker, AspectWarden,
  HazardScout, LegalLedger, RiskSentinel, ContextCartographer.
- Audit trail fan-in: every `*.Approved`/`*.Closed`/`*.Raised`/`*.Evaluated`
  mirrors into the append-only immutable trail.

## Build rules
- Every new event MUST be registered in `contracts/events.md` before use.
- Every consumer Lambda MUST handle poison messages (parse failure → DLQ,
  never crash-loop).
- Powertools-based publisher/consumer library in `services/eventing/`.
- Why: the event taxonomy is a contract — unregistered events break consumers.
