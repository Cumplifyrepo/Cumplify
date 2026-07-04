# Eventing Backbone — Requirements (EARS Format)

**Spec:** `eventing-backbone`
**Spine reference:** D.4 (SQS Topology of Compliance Events)
**Source documents:**

- `docs/architecture/module-spec.md` — Appendix B (Cross-Module Event Chains)
- `docs/architecture/cumplify-architecture.md` — Section D.4
- `.kiro/steering/07-events.md` — bus, naming, SQS/DLQ topology, build rules
- `.kiro/steering/00-stack-facts.md` — verified stack constraints (verbatim)

**Depends on:** Spec 1 (`platform-foundation`)
**Revision:** R2 — architect review 2026-07-04 (REV-1 through REV-7 applied; OQ-1/2/3 resolved)

---

## 1. Constraints (from 00-stack-facts.md — verbatim, non-negotiable)

| ID | Constraint |
|----|-----------|
| C-1 | Region: us-east-1 primary. Dev account 697114252993. All resources deploy to the dev workload account; synth-time account boundary guardrail (env-config.ts) forbids mgmt — do not touch it. |
| C-2 | CDK Nag (`AwsSolutionsChecks`) warnings = build failures. Every resource must pass. |
| C-3 | TypeScript Lambdas MUST use `aws-cdk-lib/aws-lambda-nodejs` `NodejsFunction` (esbuild bundles .ts → .js). NEVER `lambda.Code.fromAsset()` on a raw .ts directory — the Node runtime cannot load TypeScript. |
| C-4 | Bundle AWS SDK v3 clients INLINE: `bundling.externalModules: []`. Set `memorySize >= 512` so cold start stays well under the consumer visibility timeout. |
| C-5 | NO hardcoded physical resource names for queues, DLQs, rules, and Lambdas. CloudFormation auto-naming only, so rollbacks never collide. Resolve every name in readback from committed `cdk-outputs.json`. **Exception:** the EventBridge bus (see EB-3). |
| C-6 | Emit `CfnOutput` for everything readback needs: bus name + ARN, each queue URL + ARN, each DLQ ARN, each rule name, FIFO-router Lambda ARN. (F-9 contract.) |
| C-7 | Readback must EXERCISE behavior, not just assert resource existence: publish a real event → assert it lands in the target queue; publish a poison message → assert it lands in the DLQ. Use the `requireOutput()` pattern — a missing output on a deployed env FAILS, never skips. |
| C-8 | Cold-start latency proven by direct invoke in the readback (memorySize >= 512 + inline SDK bundles). |

---

## 2. EventBridge Bus

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| EB-1 | **The system shall** provision a single custom EventBridge bus for the application. | Spine D.4; module-spec cross-cutting rules |
| EB-2 | **The system shall** emit a `CfnOutput` exposing the bus name and ARN so downstream stacks and readback can resolve it from `cdk-outputs.json`. | C-6 |
| EB-3 | **The system shall** set `eventBusName: 'cumplify-events'` explicitly. The bus is a per-account singleton with no collision risk across rollbacks, and steering 07-events.md mandates this name. This is the ONE explicit-naming exception to C-5. All queues, DLQs, rules, and Lambdas remain auto-named. | 07-events.md; REV-3 |

---

## 3. Event Taxonomy Registry

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| ET-1 | **The system shall** maintain a canonical event-taxonomy registry at `contracts/events.md` listing every domain event the platform produces or consumes. | Scope definition |
| ET-2 | **The system shall** seed the registry with all events named in module-spec Appendix B and spine D.4 (see §3.1 below). | module-spec Appendix B |
| ET-3 | **When** a later spec adds new events, **the system shall** append them to `contracts/events.md` without altering existing entries (append-only registry). | Scope definition |
| ET-4 | **Every event schema** shall carry the following mandatory envelope fields: `tenantId` (string), `eventId` (ULID), `timestamp` (ISO 8601), `actor` (cognito sub or agentName), `module` (M1–M13), `clauseRef` (ISO clause string), `standard` (ISO9001 \| ISO14001 \| ISO45001), `payload` (domain-specific object). | Scope definition; spine C.2 audit-event schema |
| ET-5 | **The system shall** use the naming convention `<Domain>.<Action>` for the `detail-type` field on EventBridge (e.g., `Audit.FindingRaised`, `CAPA.Opened`). | Spine D.4; module-spec per-module events |

### 3.1 Seed Events (from module-spec Appendix B + per-module sections)

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

> **Note (REV-6):** `Hazard.RiskEscalated` is listed once under Safety (its emitting module is M10). Risk domain events are `Risk.Created`, `Risk.Escalated`, `Change.Planned` only.

---

## 4. SQS Consumer-Queue Topology (7 queues + 7 DLQs)

The spine D.4 topology defines **seven** consumer queues. Each has a paired DLQ. Two are FIFO (per-tenant ordering required); five are standard.

### 4.1 FIFO Queues (messageGroupId = tenantId — per-tenant ordering required)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| SQS-F1 | **The system shall** provision a FIFO SQS queue (`capa-intake`) for CAPA-lifecycle events consumed by the future CAPAGuru consumer. Events: `NC.Raised`, `CAPA.Opened`, `CAPA.Closed`, `CAPA.EffectivenessVerified`, `CAPA.ActionRequiresDocChange`. `messageGroupId` = `tenantId` to guarantee per-tenant ordering. | Spine D.4 (capa-intake); module-spec M2; Appendix B NCTriage→CAPAGuru chain |
| SQS-F2 | **The system shall** provision a FIFO SQS queue (`audit-sink`) for the append-only audit-event mirror. `messageGroupId` = `tenantId` to preserve causal ordering of the hash chain per tenant. | Spine D.4 (audit-sink); module-spec M4 |
| SQS-F3 | **Each FIFO queue shall** have a paired FIFO dead-letter queue (DLQ) with `maxReceiveCount: 3`. | Spine D.4; 07-events.md topology |
| SQS-F4 | **The system shall NOT** build the Marketplace `mp-lifecycle` queue in this spec. That queue is FIFO by `CustomerIdentifier` (NOT `tenantId`) and belongs to spec 40. | Out-of-scope note; v7 Part 44.2 |

### 4.2 Standard Queues (ordering not required)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| SQS-S1 | **The system shall** provision a standard SQS queue (`nc-triage`) for raw detection events consumed by the future NCTriage consumer. Events: `Audit.FindingRaised`, `Incident.Reported`, `EnvIncident.Reported`, `Aspect.SignificantImpact`. | Spine D.4 (nc-triage); Appendix B NC/CAPA chain entry point |
| SQS-S2 | **The system shall** provision a standard SQS queue (`hazard-q`) for hazard/OH&S events consumed by HazardScout/RiskSentinel. Events: `Hazard.Identified`, `Hazard.RiskEscalated`, `Incident.Reported`, `Safety.MetricLogged`. | Spine D.4 (hazard-q) |
| SQS-S3 | **The system shall** provision a standard SQS queue (`aspect-q`) for environmental aspect events consumed by AspectWarden/RiskSentinel. Events: `Aspect.SignificantImpact`, `Enviro.MonitoringLogged`, `EnvIncident.Reported`, `EnvEmergency.PlanUpdated`. | Spine D.4 (aspect-q) |
| SQS-S4 | **The system shall** provision a standard SQS queue (`review-fanout`) for management-review fan-out events consumed by ReviewOrchestrator. | Spine D.4 (review-fanout) |
| SQS-S5 | **The system shall** provision a standard SQS queue (`records-q`) for record-bearing events consumed by the future RecordsVault consumer. Events matching: `CAPA.*`, `Document.*`, `Risk.*`. | Spine D.4 (records-q) |
| SQS-S6 | **Each standard queue shall** have a paired standard dead-letter queue (DLQ) with `maxReceiveCount: 3`. | Spine D.4; 07-events.md topology |

### 4.3 General Queue Requirements

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| SQS-G1 | **The system shall** emit `CfnOutput` for every queue URL, queue ARN, and DLQ ARN so readback can resolve them from `cdk-outputs.json`. | C-6 |
| SQS-G2 | **The system shall NOT** hardcode any physical queue name. CloudFormation auto-generates names. | C-5 |
| SQS-G3 | **The system shall** configure visibility timeout on consumer queues to 360 seconds (6× the 60s Lambda timeout). | AWS best practice; C-4; OQ-3 resolved |
| SQS-G4 | **When** DLQ depth > 0 for 15 minutes, **the system shall** alarm (CloudWatch alarm on `ApproximateNumberOfMessagesVisible`). This applies to ALL DLQs: the 7 consumer DLQs AND the delivery-failure DLQ (see §5.1). | v1 Part 10 observability golden signals; REV-4 |

---

## 5. EventBridge Rules (routing events → queues)

### 5.1 Delivery-Failure Protection (REV-4)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| DLV-1 | **Every EventBridge rule target shall** configure a `RetryPolicy` (maxRetryAttempts ≥ 3, maxEventAge ≥ 24h) AND a `DeadLetterConfig` pointing to a shared standard SQS delivery-failure DLQ. | 07-events.md "no silent event loss"; REV-4 |
| DLV-2 | **The system shall** provision ONE shared standard SQS delivery-failure DLQ for all rule targets (acceptable per REV-4). | REV-4 |
| DLV-3 | **The system shall** emit a `CfnOutput` for the delivery-failure DLQ ARN. | C-6 |
| DLV-4 | **The delivery-failure DLQ shall** have a CloudWatch alarm on `ApproximateNumberOfMessagesVisible > 0` for 15 minutes per SQS-G4. | SQS-G4; REV-4 |

### 5.2 Rule Definitions

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| R-1 | **The system shall** create an EventBridge rule matching NC-triage detection events (`detail-type` in [`Audit.FindingRaised`, `Incident.Reported`, `EnvIncident.Reported`, `Aspect.SignificantImpact`]) and targeting the `nc-triage` standard queue. | Spine D.4 (nc-triage); REV-1 |
| R-2 | **The system shall** create an EventBridge rule matching CAPA-lifecycle events (`detail-type` in [`NC.Raised`, `CAPA.Opened`, `CAPA.Closed`, `CAPA.EffectivenessVerified`, `CAPA.ActionRequiresDocChange`]) and targeting the **FIFO-router Lambda** (which forwards to the `capa-intake` FIFO queue with `MessageGroupId` = `detail.tenantId`). | Spine D.4 (capa-intake); REV-1; REV-2 |
| R-3 | **The system shall** create an EventBridge rule matching audit-sink events using EventBridge suffix matching (`{"suffix": ".Approved"}`, `{"suffix": ".Closed"}`, `{"suffix": ".Raised"}`, `{"suffix": ".Evaluated"}` OR explicit `AuditEvent.Appended`) and targeting the **FIFO-router Lambda** (which forwards to the `audit-sink` FIFO queue with `MessageGroupId` = `detail.tenantId`). | module-spec Appendix B (audit-trail fan-in); OQ-1 resolved |
| R-4 | **The system shall** create an EventBridge rule matching hazard/OH&S events (`detail-type` in [`Hazard.Identified`, `Hazard.RiskEscalated`, `Incident.Reported`, `Safety.MetricLogged`]) and targeting the `hazard-q` standard queue. | Spine D.4 (hazard-q) |
| R-5 | **The system shall** create an EventBridge rule matching environmental aspect events (`detail-type` in [`Aspect.SignificantImpact`, `Enviro.MonitoringLogged`, `EnvIncident.Reported`, `EnvEmergency.PlanUpdated`]) and targeting the `aspect-q` standard queue. | Spine D.4 (aspect-q) |
| R-6 | **The system shall** create an EventBridge rule matching management-review fan-out events (`detail-type` in [`Audit.Completed`, `CAPA.Closed`, `Objectives.Updated`, `Aspect.SignificantImpact`, `Incident.Reported`, `Compliance.Evaluated`, `Risk.Escalated`, `Context.Updated`]) and targeting the `review-fanout` standard queue. | module-spec M11 consumed events (9.3.2 inputs) |
| R-7 | **The system shall** create an EventBridge rule matching record-bearing events (`detail-type` prefix matching: `CAPA.`, `Document.`, `Risk.`) and targeting the `records-q` standard queue. | Spine D.4 (records-q); REV-1 |
| R-8 | **Each rule shall** emit a `CfnOutput` with the rule name so readback can verify rule existence and configuration. | C-6 |
| R-9 | **The system shall** use event-pattern matching on the `detail-type` field (not `source` alone) to route events to the correct queue with precision. | 07-events.md naming convention |

---

## 6. FIFO-Router Lambda (REV-2)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| RTR-1 | **The system shall** provision a FIFO-router Lambda (NodejsFunction, C-3/C-4/C-6 apply) that receives events from EventBridge rules R-2 and R-3 and forwards them to the appropriate FIFO queue. | REV-2; verified AWS constraint (EventBridge rule targets accept only a static MessageGroupId for FIFO queues) |
| RTR-2 | **The FIFO-router Lambda shall** extract `detail.tenantId` from the event and set it as the `MessageGroupId` on the SQS `SendMessage` call. | REV-2 |
| RTR-3 | **The FIFO-router Lambda shall** set `MessageDeduplicationId` = `detail.eventId` (ULID) for exactly-once delivery within the 5-minute FIFO deduplication window. | OQ-2 resolved; REV-2 |
| RTR-4 | **The FIFO-router Lambda shall** determine the target FIFO queue (capa-intake vs audit-sink) based on the incoming event's `detail-type` or a routing key passed via the rule's input transformer. | Design decision deferred to design.md |
| RTR-5 | **The FIFO-router Lambda shall** use Powertools for AWS Lambda structured logging on every forwarded message (event name, tenantId, eventId, target queue, success/failure). | v3 Part 25.1 |
| RTR-6 | **When** the FIFO-router Lambda fails to forward a message, **the system shall** ensure no event is lost: the EventBridge rule target's `RetryPolicy` + `DeadLetterConfig` (DLV-1) catches invocation failures; the Lambda itself uses async-invoke `onFailure` destination to the delivery-failure DLQ for processing errors. | REV-2; 07-events.md "no silent event loss" |
| RTR-7 | **The FIFO-router Lambda shall** be provisioned with `memorySize >= 512` and `timeout: 30s` (routing is fast; no AOSS or heavy I/O). | C-4; C-8 |
| RTR-8 | **The system shall** emit a `CfnOutput` for the FIFO-router Lambda function ARN. | C-6 |

---

## 7. Publisher Library (`services/eventing/`)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| PUB-1 | **The system shall** provide a TypeScript publisher module at `services/eventing/src/publisher.ts` that wraps `@aws-sdk/client-eventbridge` `PutEvents`. | Scope definition |
| PUB-2 | **The publisher shall** enforce the mandatory envelope schema (ET-4) at compile time via a TypeScript type/interface for all events. | ET-4 |
| PUB-3 | **The publisher shall** set `Source` to the module name (e.g., `cumplify.m2.capa`) and `DetailType` to the `<Domain>.<Action>` event name. | 07-events.md naming convention |
| PUB-4 | **The publisher shall** generate the `eventId` as a ULID if not provided by the caller. | ET-4 |
| PUB-5 | **The publisher shall** use **Powertools for AWS Lambda** structured logging on every publish (event name, tenantId, eventId, success/failure). | v3 Part 25.1 (Powertools adopted) |
| PUB-6 | **The publisher shall** be packaged as a workspace package (`services/eventing`) that consuming Lambdas import at build time; esbuild bundles it inline per C-4. NO Lambda layer. | C-3; C-4; REV-7 |

---

## 8. Consumer Library (`services/eventing/`)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| CON-1 | **The system shall** provide a TypeScript consumer base module at `services/eventing/src/consumer.ts` that wraps SQS event processing with structured error handling. | Scope definition |
| CON-2 | **When** a message fails JSON parsing or envelope-schema validation, **the consumer shall** route the message to the DLQ (by not deleting it and letting `maxReceiveCount` exhaust, OR by explicit DLQ send) — NEVER crash-loop. | Scope definition (poison-message handling) |
| CON-3 | **When** a message fails processing with a transient error (timeout, throttle), **the consumer shall** allow SQS visibility-timeout retry semantics (message returns to queue). | AWS SQS best practice |
| CON-4 | **The consumer shall** use Powertools for AWS Lambda structured logging on every message received (event name, tenantId, eventId, queue, success/failure/DLQ). | v3 Part 25.1 |
| CON-5 | **The consumer shall** validate the mandatory envelope fields (ET-4) before passing the payload to business-logic handlers. Parse failure = poison → DLQ. | Scope definition |
| CON-6 | **The consumer Lambda shall** be provisioned with `memorySize >= 512` and `timeout >= 60s` to handle cold starts within the queue visibility timeout. | C-4; C-8 |
| CON-7 | **The consumer Lambda shall** be deployed using `NodejsFunction` (esbuild) with `bundling.externalModules: []` (SDK bundled inline). | C-3; C-4 |
| CON-8 | **The system shall** deploy ONE demo/reference consumer Lambda in this spec — built on the `services/eventing` consumer library (CON-1..7), wired via an SQS event-source mapping to one consumer queue (design.md picks the queue). Business logic is throwaway-grade (log-and-ack) but plumbing is production-grade: NodejsFunction, inline SDK, >= 512 MB, Powertools structured logging, poison-message → explicit DLQ send per CON-2. This Lambda is required because ACC-1/ACC-2 cannot execute without a deployed consumer. | ACC-1; ACC-2; architect approval |

---

## 9. CDK Infrastructure Requirements

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| CDK-1 | **The system shall** define all eventing resources in a dedicated CDK stack (EventingStack) within the existing CDK app. | cdk-guidance.md §1.2; v1 Part 11.2 |
| CDK-2 | **The system shall** pass CDK Nag (`AwsSolutionsChecks`) with zero warnings on all resources in the EventingStack. | C-2 |
| CDK-3 | **The EventingStack shall** be added to `CumplifyStage` and therefore synthesizes for dev, staging, and prod. The existing pipeline gates hold staging and prod deployments. D3 closure evidence comes from the dev deployment. The stack is NOT a dev-only construct outside the stage. | C-1; REV-5 |
| CDK-4 | **The system shall** use `NodejsFunction` from `aws-cdk-lib/aws-lambda-nodejs` for any Lambda in this spec. NEVER `lambda.Code.fromAsset()` on raw TypeScript. | C-3 |
| CDK-5 | **The system shall** set `bundling.externalModules: []` on all `NodejsFunction` constructs so AWS SDK v3 clients are bundled inline. | C-4 |
| CDK-6 | **The system shall** set `memorySize >= 512` on all Lambda functions in this spec. | C-4 |

---

## 10. Readback & Acceptance (D3 closure — deployed to dev + green)

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| RB-1 | **When** readback runs against the deployed dev environment, **it shall** resolve all resource identifiers (bus name, queue URLs, DLQ ARNs, rule names, FIFO-router ARN) from `cdk-outputs.json` using the `requireOutput()` pattern. A missing output FAILS, never skips. | C-7 |
| RB-2 | **When** readback publishes a well-formed event to the bus, **it shall** assert the event arrives in the correct target queue within 30 seconds (poll `ReceiveMessage`). This includes verifying the FIFO path: event → rule → FIFO-router → FIFO queue. | C-7 |
| RB-3 | **When** readback publishes a malformed/poison message to a consumer queue, **it shall** assert the message lands in the paired DLQ (after `maxReceiveCount` exhaustion or explicit DLQ routing by the consumer). | C-7 |
| RB-4 | **When** readback invokes the FIFO-router Lambda and a consumer Lambda directly (cold start), **it shall** assert each completes within its configured timeout and log the cold-start duration. | C-8 |
| RB-5 | **Readback evidence tables shall** carry the run's timestamp, exit code, and the git blob SHA of the `cdk-outputs.json` resolved against. | 19-kiro-truth.md rule 8 |

---

## 11. Headline Acceptance Proof

| ID | Requirement (EARS) | Source |
|----|--------------------|--------|
| ACC-1 | **A demo event shall** round-trip: bus → rule → FIFO-router → FIFO queue → consumer Lambda in dev, evidenced per Template F with an architect-witnessed readback (timestamp + exit code + cdk-outputs blob SHA). | User acceptance definition |
| ACC-2 | **A poisoned message shall** route to the DLQ instead of crash-looping the consumer, evidenced per Template F. | User acceptance definition |
| ACC-3 | **The spec closes** at D3 (deployed to dev + readback green). Truth discipline rules 7 (closure commit includes tasks.md checkbox edit) and 8 (readback tables carry timestamp + exit code + cdk-outputs blob SHA) apply. Executed evidence only. | D-rung / closure mandate |

---

## 12. Out of Scope

| Item | Reason | Owning spec |
|------|--------|-------------|
| Consumer business logic (agent invocations, state mutations) | Downstream module specs own their handlers | Specs 3, 4, 11 |
| Audit-trail sealer (DynamoDB Streams → S3 WORM) | Separate immutability concern | Spec 5 (`immutable-trail`) |
| Marketplace `mp-lifecycle` queue | FIFO by `CustomerIdentifier`, NOT `tenantId` — different trust boundary | Spec 40 (`marketplace-integration`) |
| Agent/module code (NCTriage, CAPAGuru, RecordsVault, etc.) | This spec delivers infrastructure + library only | Specs 4, 11 |
| CloudWatch dashboards beyond the DLQ alarms (SQS-G4, DLV-4) | Full observability is spec 14 | Spec 14 (`observability-dr`) |

---

## Open Questions

All prior open questions resolved by architect review:

| OQ | Resolution |
|----|-----------|
| OQ-1 (audit-sink rule breadth) | **Resolved:** Use EventBridge suffix matching (`{"suffix": ".Approved"}` etc.) for the four verbs + explicit `AuditEvent.Appended`. Suffix match is a verified supported operator. |
| OQ-2 (FIFO deduplication) | **Resolved:** `eventId` (ULID) as explicit `MessageDeduplicationId`, set by the FIFO-router Lambda. Direct FIFO targets would force content-based dedup; the router makes explicit dedup possible. |
| OQ-3 (visibility timeout) | **Resolved:** 360s (6× the 60s Lambda timeout). |

No new open questions at this revision.
