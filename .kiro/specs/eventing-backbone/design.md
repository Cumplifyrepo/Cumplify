# Eventing Backbone — Design

**Spec:** `eventing-backbone`
**Requirements approved:** 2026-07-04 (R2 + CON-8 addition)
**Steering rules exercised:** `00-stack-facts.md`, `07-events.md`, `14-simplicity.md`, `19-kiro-truth.md`, `06-cdk-conventions.md`
**Architect design constraints:** D-1 (readback vs ESM), D-2 (fast poison test), D-3 (router routing key + registry nuances)

---

## 1. Architecture Overview

```mermaid
flowchart TB
  subgraph EventingStack ["EventingStack (in CumplifyStage)"]
    BUS["EventBridge bus<br/>cumplify-events<br/>(explicit name)"]

    subgraph RULES ["EventBridge Rules (7)"]
      R1[R-1 nc-triage-rule]
      R2[R-2 capa-intake-rule]
      R3[R-3 audit-sink-rule]
      R4[R-4 hazard-rule]
      R5[R-5 aspect-rule]
      R6[R-6 review-fanout-rule]
      R7[R-7 records-rule]
    end

    ROUTER["FIFO-Router Lambda<br/>(NodejsFunction, 512MB, 30s)"]

    subgraph FIFO ["FIFO Queues"]
      CAPA_Q["capa-intake.fifo"] --> CAPA_DLQ["capa-intake-dlq.fifo"]
      AUDIT_Q["audit-sink.fifo"] --> AUDIT_DLQ["audit-sink-dlq.fifo"]
    end

    subgraph STD ["Standard Queues"]
      NC_Q["nc-triage"] --> NC_DLQ["nc-triage-dlq"]
      HAZ_Q["hazard-q"] --> HAZ_DLQ["hazard-q-dlq"]
      ASP_Q["aspect-q"] --> ASP_DLQ["aspect-q-dlq"]
      REV_Q["review-fanout"] --> REV_DLQ["review-fanout-dlq"]
      REC_Q["records-q"] --> REC_DLQ["records-q-dlq"]
    end

    DELIVERY_DLQ["delivery-failure-dlq<br/>(shared, standard)"]
    DEMO["Demo Consumer Lambda<br/>(ESM on nc-triage)"]
  end

  BUS --> R1 --> NC_Q
  BUS --> R2 --> ROUTER
  BUS --> R3 --> ROUTER
  BUS --> R4 --> HAZ_Q
  BUS --> R5 --> ASP_Q
  BUS --> R6 --> REV_Q
  BUS --> R7 --> REC_Q
  ROUTER --> CAPA_Q
  ROUTER --> AUDIT_Q
  NC_Q --> DEMO
  R1 -. onFailure .-> DELIVERY_DLQ
  R2 -. onFailure .-> DELIVERY_DLQ
  R3 -. onFailure .-> DELIVERY_DLQ
  R4 -. onFailure .-> DELIVERY_DLQ
  R5 -. onFailure .-> DELIVERY_DLQ
  R6 -. onFailure .-> DELIVERY_DLQ
  R7 -. onFailure .-> DELIVERY_DLQ
  ROUTER -. onFailure .-> DELIVERY_DLQ
```

**Flow summary:**
1. Any module Lambda publishes an event via the `services/eventing` publisher → EventBridge bus `cumplify-events`.
2. Rules match on `detail-type` and route to standard queues (direct) or the FIFO-router Lambda (for FIFO queues).
3. The FIFO-router extracts `tenantId` → `MessageGroupId` and `eventId` → `MessageDeduplicationId`, then sends to the appropriate FIFO queue. The target queue URL is injected by the rule's input transformer (D-3).
4. Each queue has a paired DLQ. Every rule target has a RetryPolicy + DeadLetterConfig pointing to the shared delivery-failure DLQ.
5. The demo consumer Lambda (ESM on `nc-triage`) proves the end-to-end path for readback.

---

## 2. Construct Choices

| Component | CDK Construct | Key props |
|-----------|--------------|-----------|
| EventBridge bus | `events.EventBus` | `eventBusName: 'cumplify-events'` |
| FIFO queues | `sqs.Queue` | `fifo: true`, `contentBasedDeduplication: false`, `visibilityTimeout: Duration.seconds(360)`, `deadLetterQueue: { queue: <dlq>, maxReceiveCount: 3 }` |
| FIFO DLQs | `sqs.Queue` | `fifo: true` |
| Standard queues | `sqs.Queue` | `visibilityTimeout: Duration.seconds(360)`, `deadLetterQueue: { queue: <dlq>, maxReceiveCount: 3 }` |
| Standard DLQs | `sqs.Queue` | (default) |
| Delivery-failure DLQ | `sqs.Queue` | standard; shared across all rule targets |
| EventBridge rules | `events.Rule` | `eventBus`, `eventPattern: { detailType: [...] }`, targets with `RetryPolicy` + `deadLetterQueue` |
| FIFO-router Lambda | `NodejsFunction` | `memorySize: 512`, `timeout: Duration.seconds(30)`, `bundling: { externalModules: [] }`, `runtime: Runtime.NODEJS_20_X`, `architecture: Architecture.ARM_64` |
| Demo consumer Lambda | `NodejsFunction` | `memorySize: 512`, `timeout: Duration.seconds(60)`, `bundling: { externalModules: [] }`, `runtime: Runtime.NODEJS_20_X`, `architecture: Architecture.ARM_64` |
| Demo consumer ESM | `SqsEventSource` | `queue: ncTriageQueue`, `batchSize: 10`, `reportBatchItemFailures: true` |
| CloudWatch alarms | `cloudwatch.Alarm` | per DLQ (8 total: 7 consumer + 1 delivery), metric `ApproximateNumberOfMessagesVisible`, threshold 1, period 5m, evaluationPeriods 3 (= 15 min) |
| CfnOutputs | `CfnOutput` | one per: bus name, bus ARN, 7× queue URL, 7× queue ARN, 7× DLQ ARN, delivery-DLQ ARN, 7× rule name, router Lambda ARN |

**Graviton (ARM_64):** all Lambdas use `architecture: Architecture.ARM_64` per v3 Part 25.2 cost lever (20% better price-perf).

---

## 3. Routing Table (Rule → Pattern → Target)

| Rule ID | Rule logical name | Event pattern (`detail-type`) | Target | Input transformer |
|---------|------------------|-------------------------------|--------|-------------------|
| R-1 | `NcTriageRule` | `["Audit.FindingRaised", "Incident.Reported", "EnvIncident.Reported", "Aspect.SignificantImpact"]` | `nc-triage` queue (direct) | none |
| R-2 | `CapaIntakeRule` | `["NC.Raised", "CAPA.Opened", "CAPA.Closed", "CAPA.EffectivenessVerified", "CAPA.ActionRequiresDocChange"]` | FIFO-router Lambda | Stamps `targetQueue: "capa-intake"` (D-3) |
| R-3 | `AuditSinkRule` | `[{"suffix": ".Approved"}, {"suffix": ".Closed"}, {"suffix": ".Raised"}, {"suffix": ".Evaluated"}, "AuditEvent.Appended"]` | FIFO-router Lambda | Stamps `targetQueue: "audit-sink"` (D-3) |
| R-4 | `HazardRule` | `["Hazard.Identified", "Hazard.RiskEscalated", "Incident.Reported", "Safety.MetricLogged"]` | `hazard-q` queue (direct) | none |
| R-5 | `AspectRule` | `["Aspect.SignificantImpact", "Enviro.MonitoringLogged", "EnvIncident.Reported", "EnvEmergency.PlanUpdated"]` | `aspect-q` queue (direct) | none |
| R-6 | `ReviewFanoutRule` | `["Audit.Completed", "CAPA.Closed", "Objectives.Updated", "Aspect.SignificantImpact", "Incident.Reported", "Compliance.Evaluated", "Risk.Escalated", "Context.Updated"]` | `review-fanout` queue (direct) | none |
| R-7 | `RecordsRule` | `[{"prefix": "CAPA."}, {"prefix": "Document."}, {"prefix": "Risk."}]` | `records-q` queue (direct) | none |

**All targets** carry: `retryPolicy: { retryAttempts: 3, maximumEventAge: Duration.hours(24) }` and `deadLetterQueue: deliveryFailureDlq`.

### 3.1 Registry Note (D-3 — `contracts/events.md`)

`Change.Planned` is in the **Risk domain** but does NOT match the `records-q` prefix rule (R-7's `"Risk."` prefix). It is a planning event, not a record-bearing state change. Later specs must be aware: record-bearing events are matched by `detail-type` PREFIX (`CAPA.`, `Document.`, `Risk.`), not by domain membership. This will be documented as a note in `contracts/events.md`.

---

## 4. `services/eventing/` Package Layout

```
services/eventing/
├── package.json          # workspace package: "@cumplify/eventing"
├── tsconfig.json
├── src/
│   ├── index.ts          # barrel export
│   ├── types.ts          # CumplifyEvent<T> envelope interface (ET-4)
│   ├── publisher.ts      # publish() — wraps PutEvents
│   ├── consumer.ts       # createHandler() — SQS batch processor with poison routing
│   └── constants.ts      # source prefixes, event-name registry (type-safe)
├── handlers/
│   ├── fifo-router.ts    # FIFO-router Lambda entry point
│   └── demo-consumer.ts  # Demo consumer Lambda entry point (log-and-ack)
└── __tests__/
    ├── publisher.test.ts
    ├── consumer.test.ts
    └── fifo-router.test.ts
```

### 4.1 `types.ts` — Event Envelope

```typescript
export interface CumplifyEvent<T = Record<string, unknown>> {
  tenantId: string;
  eventId: string;       // ULID
  timestamp: string;     // ISO 8601
  actor: string;         // cognito sub or agentName
  module: string;        // M1..M13
  clauseRef: string;     // ISO clause string
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
  payload: T;
}
```

### 4.2 `publisher.ts` — Core Logic

```typescript
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Logger } from '@aws-lambda-powertools/logger';
import { ulid } from 'ulid';
import { CumplifyEvent } from './types';

const client = new EventBridgeClient({});
const logger = new Logger({ serviceName: 'eventing-publisher' });

export interface PublishOptions {
  busName: string;
  source: string;        // e.g. 'cumplify.m2.capa'
  detailType: string;    // e.g. 'CAPA.Opened'
  event: CumplifyEvent;
}

export async function publish(opts: PublishOptions): Promise<string> {
  const event = { ...opts.event, eventId: opts.event.eventId || ulid() };
  const cmd = new PutEventsCommand({
    Entries: [{
      EventBusName: opts.busName,
      Source: opts.source,
      DetailType: opts.detailType,
      Detail: JSON.stringify(event),
    }],
  });
  const result = await client.send(cmd);
  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    logger.error('PutEvents partial failure', { detailType: opts.detailType, eventId: event.eventId });
    throw new Error(`PutEvents failed: ${result.Entries?.[0]?.ErrorMessage}`);
  }
  logger.info('Event published', { detailType: opts.detailType, tenantId: event.tenantId, eventId: event.eventId });
  return event.eventId;
}
```

### 4.3 `consumer.ts` — SQS Batch Processor with Poison Routing (D-2)

```typescript
import { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Logger } from '@aws-lambda-powertools/logger';
import { CumplifyEvent } from './types';

const sqsClient = new SQSClient({});
const logger = new Logger({ serviceName: 'eventing-consumer' });

export type EventHandler<T = Record<string, unknown>> = (event: CumplifyEvent<T>) => Promise<void>;

export interface ConsumerConfig {
  dlqUrl: string;
  handler: EventHandler;
}

/**
 * Creates an SQS batch handler with:
 * - Envelope validation (ET-4 fields)
 * - Poison-message explicit DLQ send on parse/validation failure (D-2: immediate, no maxReceiveCount wait)
 * - Partial batch failure reporting (reportBatchItemFailures)
 * - Powertools structured logging
 */
export function createHandler(config: ConsumerConfig) {
  return async (sqsEvent: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of sqsEvent.Records) {
      try {
        const parsed = parseAndValidate(record.body);
        logger.info('Processing event', {
          detailType: parsed.__detailType,
          tenantId: parsed.event.tenantId,
          eventId: parsed.event.eventId,
        });
        await config.handler(parsed.event);
      } catch (err) {
        if (err instanceof PoisonMessageError) {
          // D-2: explicit DLQ send — immediate, no 18-minute wait
          logger.warn('Poison message → DLQ', {
            messageId: record.messageId,
            reason: err.message,
          });
          await sqsClient.send(new SendMessageCommand({
            QueueUrl: config.dlqUrl,
            MessageBody: record.body,
            MessageAttributes: {
              PoisonReason: { DataType: 'String', StringValue: err.message },
              OriginalMessageId: { DataType: 'String', StringValue: record.messageId },
            },
          }));
          // Do NOT add to batchItemFailures — message is handled (sent to DLQ)
        } else {
          // Transient error — let SQS retry via visibility timeout
          logger.error('Transient processing failure', {
            messageId: record.messageId,
            error: (err as Error).message,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      }
    }
    return { batchItemFailures };
  };
}

class PoisonMessageError extends Error {
  constructor(reason: string) { super(reason); this.name = 'PoisonMessageError'; }
}

function parseAndValidate(body: string): { event: CumplifyEvent; __detailType: string } {
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new PoisonMessageError('JSON parse failure');
  }
  // Validate mandatory envelope fields (ET-4)
  const required = ['tenantId', 'eventId', 'timestamp', 'actor', 'module', 'clauseRef', 'standard', 'payload'];
  for (const field of required) {
    if (!(field in parsed)) {
      throw new PoisonMessageError(`Missing envelope field: ${field}`);
    }
  }
  return { event: parsed as CumplifyEvent, __detailType: parsed.detailType || 'unknown' };
}
```

**D-2 resolution:** On validation failure the consumer does an explicit `SendMessage` to the DLQ immediately. The message is NOT returned to the source queue (not added to `batchItemFailures`), so the poison test completes in seconds, not 18 minutes.

---

## 5. FIFO-Router Lambda Design (D-3)

### 5.1 Input Transformer (rule-side)

Rules R-2 and R-3 use EventBridge input transformers to stamp the target queue URL environment-variable key:

```json
// R-2 (CapaIntakeRule) input transformer
{
  "inputPathsMap": { "detail": "$.detail", "detailType": "$.detail-type" },
  "inputTemplate": "{\"targetQueue\": \"CAPA_INTAKE_QUEUE_URL\", \"detailType\": <detailType>, \"detail\": <detail>}"
}

// R-3 (AuditSinkRule) input transformer
{
  "inputPathsMap": { "detail": "$.detail", "detailType": "$.detail-type" },
  "inputTemplate": "{\"targetQueue\": \"AUDIT_SINK_QUEUE_URL\", \"detailType\": <detailType>, \"detail\": <detail>}"
}
```

The router Lambda resolves the actual queue URL from its environment variables using the `targetQueue` key. This avoids re-parsing `detail-type` in the router (D-3).

### 5.2 Router Handler (`handlers/fifo-router.ts`)

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Logger } from '@aws-lambda-powertools/logger';

const sqsClient = new SQSClient({});
const logger = new Logger({ serviceName: 'fifo-router' });

// Queue URL map from environment variables
const QUEUE_MAP: Record<string, string> = {
  CAPA_INTAKE_QUEUE_URL: process.env.CAPA_INTAKE_QUEUE_URL!,
  AUDIT_SINK_QUEUE_URL: process.env.AUDIT_SINK_QUEUE_URL!,
};

interface RouterEvent {
  targetQueue: string;   // env var key stamped by input transformer
  detailType: string;
  detail: {
    tenantId: string;
    eventId: string;
    [key: string]: unknown;
  };
}

export async function handler(event: RouterEvent): Promise<void> {
  const queueUrl = QUEUE_MAP[event.targetQueue];
  if (!queueUrl) {
    throw new Error(`Unknown targetQueue key: ${event.targetQueue}`);
  }

  await sqsClient.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(event.detail),
    MessageGroupId: event.detail.tenantId,
    MessageDeduplicationId: event.detail.eventId,
  }));

  logger.info('Routed to FIFO', {
    targetQueue: event.targetQueue,
    detailType: event.detailType,
    tenantId: event.detail.tenantId,
    eventId: event.detail.eventId,
  });
}
```

### 5.3 Failure Handling (RTR-6)

- **Invocation failure** (Lambda error, throttle): EventBridge rule's `RetryPolicy` (3 retries, 24h max age) handles it; after exhaustion → delivery-failure DLQ via the rule target's `DeadLetterConfig`.
- **Processing failure** (unknown targetQueue, SQS SendMessage error): Lambda throws → caught by EventBridge retry. The Lambda is invoked asynchronously by EventBridge, so its `onFailure` destination (delivery-failure DLQ) catches errors that exhaust Lambda's internal retry (2 built-in retries for async invoke).

CDK wiring: `router.addEventSource()` is NOT used (this is EventBridge → Lambda, not SQS → Lambda). The rule target is `new targets.LambdaFunction(router, { retryAttempts: 3, maxEventAge: Duration.hours(24), deadLetterQueue: deliveryFailureDlq })`.

---

## 6. Demo Consumer Lambda Design (CON-8)

### 6.1 Queue Choice: `nc-triage`

The demo consumer is wired to `nc-triage` (standard queue) because:
- It is the entry point of the NC/CAPA chain (Appendix B) — the most common event flow.
- It is a standard queue (simpler ESM semantics than FIFO for the demo).
- It validates the direct rule→queue path (R-1) end-to-end in readback.

### 6.2 Handler (`handlers/demo-consumer.ts`)

```typescript
import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { createHandler } from '../src/consumer';
import { CumplifyEvent } from '../src/types';

const DLQ_URL = process.env.NC_TRIAGE_DLQ_URL!;

const businessLogic = async (event: CumplifyEvent): Promise<void> => {
  // Throwaway-grade: log and acknowledge
  // Production consumers will replace this with actual agent invocations
};

export const handler = createHandler({
  dlqUrl: DLQ_URL,
  handler: businessLogic,
});
```

### 6.3 CDK Wiring

```typescript
const demoConsumer = new NodejsFunction(this, 'DemoConsumerFn', {
  entry: 'services/eventing/handlers/demo-consumer.ts',
  handler: 'handler',
  runtime: Runtime.NODEJS_20_X,
  architecture: Architecture.ARM_64,
  memorySize: 512,
  timeout: Duration.seconds(60),
  bundling: { externalModules: [] },
  environment: {
    NC_TRIAGE_DLQ_URL: ncTriageDlq.queueUrl,
    POWERTOOLS_SERVICE_NAME: 'demo-consumer',
  },
});

// Grant send-message to the DLQ (for explicit poison routing)
ncTriageDlq.grantSendMessages(demoConsumer);

// ESM: wire to nc-triage queue
demoConsumer.addEventSource(new SqsEventSource(ncTriageQueue, {
  batchSize: 10,
  reportBatchItemFailures: true,
}));
```

---

## 7. Readback Plan (D-1, D-2, D-3)

### 7.1 Constraint Summary

| Constraint | Implication for readback |
|------------|------------------------|
| **D-1** | `nc-triage` has an ESM (demo consumer drains it). Readback CANNOT poll `nc-triage` for arrival. Instead: publish event → verify arrival via demo consumer's Powertools structured log (filter for `eventId` match in CloudWatch Logs). All other queues (no ESM) use `ReceiveMessage` polling. |
| **D-2** | Poison test uses explicit DLQ send (immediate). Readback sends a malformed message directly to `nc-triage` → demo consumer validates → poison → explicit send to DLQ → readback polls DLQ for the poison message. Completes in seconds. |
| **D-3** | FIFO path readback: publish a CAPA event → verify it arrives in `capa-intake` FIFO (no ESM, poll directly). Separately, publish an `*.Approved` event → verify `audit-sink` FIFO (no ESM, poll directly). Both pass through the FIFO-router; successful arrival proves the input-transformer + router chain. |

### 7.2 Readback Test Matrix

| # | Test | Method | Asserts | Req |
|---|------|--------|---------|-----|
| 1 | Bus exists | `DescribeEventBus` via SDK | ARN matches output | EB-2 |
| 2 | All queues exist | `GetQueueAttributes` on each URL from outputs | URL resolves, attributes match (FIFO flag, visibility timeout 360s, DLQ policy) | SQS-G1, SQS-G3 |
| 3 | All rules exist | `DescribeRule` on each rule name from outputs | State=ENABLED, event pattern correct | R-8 |
| 4 | Standard-queue direct path (hazard-q) | Publish `Hazard.Identified` → `ReceiveMessage` on `hazard-q` | Message body contains published eventId; arrives < 30s | RB-2 |
| 5 | Standard-queue direct path (records-q) | Publish `Document.Published` → `ReceiveMessage` on `records-q` | Message arrives with correct eventId | RB-2, R-7 |
| 6 | FIFO path via router (capa-intake) | Publish `CAPA.Opened` → `ReceiveMessage` on `capa-intake.fifo` | Message arrives; MessageGroupId = tenantId from event | RB-2, RTR-2 |
| 7 | FIFO path via router (audit-sink) | Publish `Document.Approved` → `ReceiveMessage` on `audit-sink.fifo` | Message arrives; suffix rule matched | RB-2, R-3 |
| 8 | ESM-drained path (nc-triage → demo consumer) | Publish `Audit.FindingRaised` → poll CloudWatch Logs for demo consumer log entry with matching `eventId` | Log entry found within 60s (D-1) | RB-2, ACC-1 |
| 9 | Poison → DLQ (explicit send, D-2) | Send malformed JSON directly to `nc-triage` via `SendMessage` → poll `nc-triage-dlq` for message with `PoisonReason` attribute | DLQ message found within 30s | RB-3, ACC-2 |
| 10 | Cold-start: FIFO-router | Direct `Invoke` on router Lambda (cold) | Completes < 30s; log cold-start duration | RB-4, C-8 |
| 11 | Cold-start: demo consumer | Direct `Invoke` on demo consumer Lambda (cold, with synthetic SQS event payload) | Completes < 60s; log cold-start duration | RB-4, C-8 |
| 12 | Delivery-failure DLQ alarm exists | `DescribeAlarms` | Alarm configured on delivery-failure DLQ metric | DLV-4 |

### 7.3 Readback Evidence Format (RB-5, 19-kiro-truth.md rule 8)

Each readback run produces a table:

```
| Timestamp | Test # | Result | Duration | Notes |
|-----------|--------|--------|----------|-------|
| 2026-07-XX T...Z | 1 | PASS | 1.2s | ARN: arn:aws:events:... |
| ... | ... | ... | ... | ... |

Exit code: 0
cdk-outputs.json blob SHA: <git hash-object infra/cdk-outputs.json>
```

---

## 8. Contracts Produced / Updated

| Artifact | Action | Contents |
|----------|--------|----------|
| `contracts/events.md` | **Created** | Full seed taxonomy (§3.1 of requirements), envelope schema (ET-4), naming convention, prefix-match note for R-7 (D-3: `Change.Planned` is Risk domain but does NOT match `Risk.` prefix) |
| `services/eventing/package.json` | **Created** | `@cumplify/eventing` workspace package |
| `infra/lib/eventing-stack.ts` | **Created** | EventingStack CDK construct |
| `cdk-outputs.json` (post-deploy) | **Updated** | Bus, queue, DLQ, rule, Lambda outputs appended |

---

## 9. SOC 2 Impact

| Criteria | Impact |
|----------|--------|
| CC7 Operations | DLQ alarms ensure no silent event loss; delivery-failure DLQ covers the bus→queue gap |
| CC8 Change management | EventingStack deploys via CDK Pipeline only; CDK Nag enforced |
| A1 Availability | RetryPolicy (24h) + DLQs mean transient failures do not lose events; consumers handle poison without crash-looping |

---

## 10. Cost Impact

| Resource | Monthly estimate (dev) | Notes |
|----------|----------------------|-------|
| EventBridge | < $1 | First 64K custom events/mo free; dev traffic negligible |
| SQS (7 queues + 8 DLQs) | < $1 | First 1M requests free; FIFO at $0.35/M after |
| Lambda (router + demo, idle) | $0 | Pay-per-invoke; dev traffic is readback only |
| CloudWatch alarms (8) | ~$0.80 | $0.10/alarm/mo |
| **Total** | **< $3/mo** | Well within Part 27 cost discipline |

---

## 11. Open Design Decisions

None. All decisions resolved by architect constraints D-1/D-2/D-3 and the routing table above.
