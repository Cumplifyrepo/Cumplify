# Eventing Backbone — Tasks

**Spec:** `eventing-backbone`
**Design approved:** 2026-07-04 (R2, FIX-1..FIX-7 applied)
**D-rung floor:** D3 (deployed to dev + readback green)
**Closure:** Template F — every task checkbox includes evidence log path; rules 7 (checkbox + commit) and 8 (timestamp + exit code + cdk-outputs blob SHA) apply.

---

## Task Dependency Graph

```
1 (package) ──┬──► 2 (types/publisher) ──┬──► 4 (CDK stack) ──► 6 (deploy) ──► 7 (readback)
              │                           │
              └──► 3 (consumer/router) ───┘
                                          │
              5 (pattern test) ───────────┘
```

Tasks 1–3 are parallelizable. Task 4 depends on 1–3. Task 5 can run in parallel with 4 (unit test, no infra). Task 6 depends on 4+5. Task 7 depends on 6.

---

## Tasks

### Task 1 — Initialize `services/eventing` workspace package
**D-rung:** D1 (compiles)
**Depends on:** none

- [ ] 1.1 Create `services/eventing/package.json` (`@cumplify/eventing`, private, workspace package)
- [ ] 1.2 Create `services/eventing/tsconfig.json` (extends root, target ES2022, module NodeNext)
- [ ] 1.3 Add workspace reference in root `package.json` (or pnpm-workspace.yaml)
- [ ] 1.4 Verify: `npm install` / `pnpm install` resolves the workspace package

**Evidence:** `npm ci && tsc --noEmit` passes → `.kiro/evidence/eventing-backbone/task-1.log`

---

### Task 2 — Implement publisher + types
**D-rung:** D2 (tested)
**Depends on:** Task 1

- [ ] 2.1 Create `src/types.ts` — `CumplifyEvent<T>` interface + `QueueMessage<T>` interface (design §5.1)
- [ ] 2.2 Create `src/constants.ts` — source prefixes, event-name enum/const registry
- [ ] 2.3 Create `src/publisher.ts` — `publish()` function (design §5.2)
- [ ] 2.4 Create `src/index.ts` — barrel export
- [ ] 2.5 Install deps: `@aws-sdk/client-eventbridge`, `@aws-lambda-powertools/logger`, `ulid`
- [ ] 2.6 Write `__tests__/publisher.test.ts` — mock EventBridgeClient, assert envelope shape, ULID generation, error on FailedEntryCount > 0
- [ ] 2.7 Verify: `tsc --noEmit && vitest run` passes

**Evidence:** test output → `.kiro/evidence/eventing-backbone/task-2.log`

---

### Task 3 — Implement consumer library + router + demo handler
**D-rung:** D2 (tested)
**Depends on:** Task 1

- [ ] 3.1 Create `src/consumer.ts` — `createHandler()` with canonical QueueMessage parsing (FIX-1), explicit DLQ send on poison (D-2), partial batch failures (design §5.3)
- [ ] 3.2 Create `handlers/fifo-router.ts` — router handler with QUEUE_MAP, canonical MessageBody (FIX-1), MessageGroupId/DeduplicationId (design §6.1)
- [ ] 3.3 Create `handlers/demo-consumer.ts` — log-and-ack using createHandler (design §7.2)
- [ ] 3.4 Install deps: `@aws-sdk/client-sqs`, `aws-lambda` (types)
- [ ] 3.5 Write `__tests__/consumer.test.ts` — assert: valid QueueMessage passes handler; malformed JSON → PoisonMessageError + DLQ send; missing detail field → PoisonMessageError; transient error → batchItemFailures
- [ ] 3.6 Write `__tests__/fifo-router.test.ts` — assert: known targetQueue → SendMessage with correct params; unknown targetQueue → throw
- [ ] 3.7 Verify: `tsc --noEmit && vitest run` passes

**Evidence:** test output → `.kiro/evidence/eventing-backbone/task-3.log`

---

### Task 4 — Implement EventingStack (CDK)
**D-rung:** D1 (synths + CDK Nag clean)
**Depends on:** Tasks 2, 3

- [ ] 4.1 Create `infra/lib/eventing-stack.ts` with:
  - EventBridge bus (`eventBusName: 'cumplify-events'`)
  - 7 consumer queues + 7 DLQs (FIFO: capa-intake, audit-sink; Standard: nc-triage, hazard-q, aspect-q, review-fanout, records-q)
  - 1 delivery-failure DLQ (shared)
  - All 16 queues: `enforceSSL: true` (FIX-3)
  - All 8 DLQs: NagSuppression for AwsSolutions-SQS3 (FIX-3)
  - visibilityTimeout: 360s on consumer queues; maxReceiveCount: 3
- [ ] 4.2 Add 7 EventBridge rules with event patterns per routing table (design §4)
  - Input transformer on ALL rule targets (canonical contract, FIX-1/FIX-2)
  - R-2/R-3 extended transformer with `targetQueue` field (D-3, §4.1)
  - All targets: RetryPolicy + DeadLetterConfig → delivery-failure DLQ
  - R-2/R-3 target: FIFO-router Lambda
  - R-1, R-4–R-7 target: direct SQS with input transformer
  - Note: use L1 CfnRule escape hatch for input transformers if L2 auto-quoting corrupts (FIX-2)
- [ ] 4.3 Add FIFO-router Lambda (NodejsFunction, NODEJS_22_X, ARM_64, 512MB, 30s, externalModules:[], target:node22)
  - Env vars: CAPA_INTAKE_QUEUE_URL, AUDIT_SINK_QUEUE_URL, POWERTOOLS_SERVICE_NAME
  - Grants: capaIntakeQueue.grantSendMessages, auditSinkQueue.grantSendMessages, deliveryFailureDlq.grantSendMessages (FIX-5)
  - onFailure: SqsDestination(deliveryFailureDlq) (FIX-5)
- [ ] 4.4 Add demo consumer Lambda (NodejsFunction, NODEJS_22_X, ARM_64, 512MB, 60s, externalModules:[], target:node22)
  - Env vars: NC_TRIAGE_DLQ_URL, POWERTOOLS_SERVICE_NAME
  - Grant: ncTriageDlq.grantSendMessages
  - ESM: SqsEventSource(ncTriageQueue, batchSize:10, reportBatchItemFailures:true)
- [ ] 4.5 Add 8 CloudWatch alarms (7 consumer DLQs + 1 delivery-failure DLQ)
  - Metric: ApproximateNumberOfMessagesVisible, threshold 1, period 5m, evaluationPeriods 3
  - `treatMissingData: TreatMissingData.NOT_BREACHING` (FIX-6)
  - No alarm actions (spec 14 wires alerting)
- [ ] 4.6 Add CfnOutputs: bus name+ARN, 7× queue URL+ARN, 7× DLQ ARN, delivery-DLQ ARN, 7× rule name, router Lambda ARN, demo consumer Lambda ARN, demo consumer log group name
- [ ] 4.7 Register EventingStack in CumplifyStage (not a standalone dev-only stack)
- [ ] 4.8 Verify: `cdk synth --all` succeeds + CDK Nag (`AwsSolutionsChecks`) clean (zero warnings)

**Evidence:** synth + Nag output → `.kiro/evidence/eventing-backbone/task-4.log`

---

### Task 5 — R-3 event pattern verification (FIX-7)
**D-rung:** D2 (tested, pre-deploy gate)
**Depends on:** Task 1 (needs SDK dep)

- [ ] 5.1 Create `__tests__/event-pattern.test.ts`:
  - Build the R-3 pattern: `{"detail-type": [{"suffix":".Approved"},{"suffix":".Closed"},{"suffix":".Raised"},{"suffix":".Evaluated"},"AuditEvent.Appended"]}`
  - Call `TestEventPattern` (EventBridgeClient) with:
    - `Document.Approved` → assert **matches**
    - `CAPA.Closed` → assert **matches**
    - `AuditEvent.Appended` → assert **matches**
    - `Hazard.Identified` → assert **does NOT match**
  - If the mixed array is rejected by the API, implement fallback: replace `"AuditEvent.Appended"` with `{"suffix": ".Appended"}` and re-run assertions
- [ ] 5.2 If fallback triggered, update the routing table in design.md §4 and note the broadened scope in `contracts/events.md`
- [ ] 5.3 Verify: `vitest run __tests__/event-pattern.test.ts` passes

**Evidence:** test output → `.kiro/evidence/eventing-backbone/task-5.log`

---

### Task 6 — Deploy to dev + create contracts/events.md
**D-rung:** D3 (deployed)
**Depends on:** Tasks 4, 5

- [ ] 6.1 Create `contracts/events.md`:
  - Seed taxonomy table (requirements §3.1)
  - Envelope schema (ET-4)
  - Canonical queue-message contract (FIX-1)
  - Naming convention (`<Domain>.<Action>`)
  - Prefix-match note: `Change.Planned` is Risk domain but does NOT match R-7's `Risk.` prefix
  - R-3 scope note (suffix patterns + constant or fallback)
- [ ] 6.2 Deploy EventingStack to dev via pipeline (or `cdk deploy --context env=dev`)
- [ ] 6.3 Capture `cdk-outputs.json` and commit it
- [ ] 6.4 Verify: stack reaches CREATE_COMPLETE / UPDATE_COMPLETE; all outputs present

**Evidence:** deploy output + `cdk-outputs.json` blob SHA → `.kiro/evidence/eventing-backbone/task-6.log`

---

### Task 7 — Readback (behavioral proof, D3 closure)
**D-rung:** D3 (deployed + readback green)
**Depends on:** Task 6

Execute all 12 tests from design §8.2 against the deployed dev environment:

- [ ] 7.1 Test 1: Bus exists (`DescribeEventBus`, ARN matches output)
- [ ] 7.2 Test 2: All queues exist (`GetQueueAttributes` — FIFO flag, visibility 360s, DLQ policy, SSL policy)
- [ ] 7.3 Test 3: All rules exist (`DescribeRule` — ENABLED, pattern correct)
- [ ] 7.4 Test 4: Standard-queue direct path — publish `Hazard.Identified` → `ReceiveMessage` on hazard-q → assert `body.detail.eventId` matches
- [ ] 7.5 Test 5: Standard-queue direct path — publish `Document.Published` → `ReceiveMessage` on records-q → assert `body.detail.eventId` + `body.detailType`
- [ ] 7.6 Test 6: FIFO path via router — publish `CAPA.Opened` → `ReceiveMessage` on capa-intake.fifo → assert eventId matches
- [ ] 7.7 Test 7: FIFO path via router — publish `Document.Approved` → `ReceiveMessage` on audit-sink.fifo → assert suffix rule matched
- [ ] 7.8 Test 8: ESM-drained path — publish `Audit.FindingRaised` → poll CloudWatch Logs for demo consumer log with matching eventId (D-1, ACC-1)
- [ ] 7.9 Test 9: Poison → DLQ — send malformed JSON to nc-triage → poll nc-triage-dlq for PoisonReason attribute (D-2, ACC-2)
- [ ] 7.10 Test 10: Cold-start FIFO-router — direct Invoke, log duration
- [ ] 7.11 Test 11: Cold-start demo consumer — direct Invoke with synthetic SQS payload, log duration
- [ ] 7.12 Test 12: ALL 8 DLQ alarms exist (`DescribeAlarms`, verify treatMissingData = notBreaching)

**Evidence format (per RB-5, 19-kiro-truth.md rule 8):**

```
| Timestamp | Test # | Result | Duration | Notes |
|-----------|--------|--------|----------|-------|
| <ISO8601> | 1–12   | PASS/FAIL | <ms>  | <details> |

Exit code: 0
cdk-outputs.json blob SHA: <git hash-object infra/cdk-outputs.json>
```

→ `.kiro/evidence/eventing-backbone/task-7.log`

---

## Closure (Template F)

**D-rung achieved:** D3 (deployed to dev + readback green)

**Closure commit includes:**
1. This `tasks.md` with all checkboxes ticked
2. Evidence logs at `.kiro/evidence/eventing-backbone/task-{1..7}.log`
3. `contracts/events.md` (seed taxonomy + canonical contract)
4. `cdk-outputs.json` with all EventingStack outputs
5. All source under `services/eventing/` and `infra/lib/eventing-stack.ts`

**Truth discipline:**
- Rule 7: closure commit includes this tasks.md checkbox edit
- Rule 8: readback table in task-7.log carries timestamp + exit code + cdk-outputs blob SHA
