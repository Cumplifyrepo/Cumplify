---
inclusion: always
---
# Model Policy (Part 30 — under 30 lines)
Every model assignment defaults to the Amazon Nova family.

## Nova ladder
| Model | Profile ID | Duty |
|---|---|---|
| Micro | `us.amazon.nova-micro-v1:0` | Classification, routing, triage (NCTriage), telemetry |
| Lite | `us.amazon.nova-lite-v1:0` | Lightweight agents (RecordsVault, ObjectiveTracker, ContextCartographer, SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice) |
| Pro | `us.amazon.nova-pro-v1:0` | Workhorse agents (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RiskSentinel, AspectWarden, HazardScout, IncidentInvestigator, ReviewOrchestrator, ComplianceCopilot) |
| Premier | `us.amazon.nova-premier-v1:0` | ISO9001/14001/45001 Domain Gurus (reassigned from Sonnet per 30.2; quarterly 30.3 re-validation) |

## Sole exception
LegalLedger (M8): `us.anthropic.claude-sonnet-4-6`, quarterly-expiring
MODELEXCEPTION record, IAM-scoped to that one agent boundary.

## Rules
- A Sonnet reference outside LegalLedger's boundary fails review.
- No model outside the Nova ladder may be introduced without a written,
  evaluated justification in the Model Justification Register.
- The 30.3 eval gate re-benchmarks Nova Premier vs Sonnet every quarter;
  the day Premier passes, the LegalLedger seat flips.
- Why: cost discipline (Part 27), sovereignty, prompt-portability.
