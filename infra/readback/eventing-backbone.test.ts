/**
 * Readback — Spec 2 eventing-backbone (design §8.2, 12-test matrix)
 *
 * ALL resource identifiers resolved from cdk-outputs.json Dev-EventingStack.
 * Missing output key = FAIL (requireOutput pattern).
 *
 * Constraints honored:
 * - D-1: nc-triage has ESM → prove via CloudWatch Logs eventId match, NOT ReceiveMessage
 * - D-2: poison test uses explicit DLQ send (immediate, not maxReceiveCount exhaustion)
 * - Tests 4-7: assert body.detail.eventId (canonical contract)
 * - Tests 10-11: direct invoke, record cold-start ms
 * - Test 12: all 8 alarms with treatMissingData=notBreaching
 *
 * Run: npm run readback (uses infra/readback/vitest.config.ts, serial)
 * Requires: AWS credentials with EventBridge/SQS/Lambda/CloudWatch/Logs access (dev account)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadCdkOutputs, type StackOutputs } from './helpers.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const STACK = 'Dev-EventingStack';
const PROFILE = 'cumplify-dev-readonly';
const REGION = 'us-east-1';

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireOutput(outputs: StackOutputs, key: string): string {
  const value = outputs[STACK]?.[key];
  if (!value) {
    throw new Error(
      `requireOutput FAILED: key "${key}" not found in cdk-outputs.json[${STACK}]. ` +
        `A missing output on a deployed env FAILS, never skips.`,
    );
  }
  return value;
}

function aws<T>(command: string, timeout = 30_000): T {
  const output = execSync(`aws ${command} --region ${REGION} --profile ${PROFILE} --output json`, {
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(output) as T;
}

function awsNoJson(command: string, timeout = 30_000): string {
  return execSync(`aws ${command} --region ${REGION} --profile ${PROFILE}`, {
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cdkOutputsBlobSha(): string {
  const filePath = resolve(process.cwd(), 'cdk-outputs.json');
  return execSync(`git hash-object "${filePath}"`, { encoding: 'utf-8' }).trim();
}

// ─── Setup ──────────────────────────────────────────────────────────────────

let outputs: StackOutputs;
let busName: string;
let ncTriageQueueUrl: string;
let hazardQueueUrl: string;
let recordsQueueUrl: string;
let capaIntakeQueueUrl: string;
let auditSinkQueueUrl: string;
let routerArn: string;
let demoConsumerArn: string;
let demoConsumerLogGroup: string;

describe('eventing-backbone readback (12-test matrix)', () => {
  beforeAll(() => {
    const loaded = loadCdkOutputs();
    if (!loaded || !loaded[STACK]) {
      throw new Error(`cdk-outputs.json missing or ${STACK} block absent. Cannot readback.`);
    }
    outputs = loaded;

    busName = requireOutput(outputs, 'EventBusName');
    ncTriageQueueUrl = requireOutput(outputs, 'NcTriageQueueUrl');
    hazardQueueUrl = requireOutput(outputs, 'HazardQueueUrl');
    recordsQueueUrl = requireOutput(outputs, 'RecordsQueueUrl');
    capaIntakeQueueUrl = requireOutput(outputs, 'CapaIntakeQueueUrl');
    auditSinkQueueUrl = requireOutput(outputs, 'AuditSinkQueueUrl');
    routerArn = requireOutput(outputs, 'FifoRouterArn');
    demoConsumerArn = requireOutput(outputs, 'DemoConsumerArn');
    demoConsumerLogGroup = requireOutput(outputs, 'DemoConsumerLogGroup');

    console.log(`cdk-outputs.json blob SHA: ${cdkOutputsBlobSha()}`);
  });

  // ─── Test 1: Bus exists ─────────────────────────────────────────────────

  it('test 1: bus exists (DescribeEventBus)', () => {
    const busArn = requireOutput(outputs, 'EventBusArn');
    const result = aws<{ Arn: string; Name: string }>(
      `events describe-event-bus --name "${busName}"`,
    );
    expect(result.Name).toBe('cumplify-events');
    expect(result.Arn).toBe(busArn);
    console.log(`  Bus ARN: ${result.Arn}`);
  });

  // ─── Test 2: All queues exist ───────────────────────────────────────────

  it('test 2: all queues exist (GetQueueAttributes)', () => {
    const queueKeys = [
      'CapaIntakeQueueUrl', 'AuditSinkQueueUrl', 'NcTriageQueueUrl',
      'HazardQueueUrl', 'AspectQueueUrl', 'ReviewFanoutQueueUrl', 'RecordsQueueUrl',
    ];
    for (const key of queueKeys) {
      const url = requireOutput(outputs, key);
      const result = aws<{ Attributes: Record<string, string> }>(
        `sqs get-queue-attributes --queue-url "${url}" --attribute-names All`,
      );
      const attrs = result.Attributes;
      expect(Number(attrs.VisibilityTimeout)).toBe(360);
      expect(attrs.RedrivePolicy).toBeDefined();

      // FIFO check for capa-intake and audit-sink
      if (key.includes('CapaIntake') || key.includes('AuditSink')) {
        expect(url).toContain('.fifo');
        expect(attrs.FifoQueue).toBe('true');
      }

      // SSL policy check: queue should have a policy with SecureTransport condition
      expect(attrs.Policy).toBeDefined();
      expect(attrs.Policy).toContain('aws:SecureTransport');
      console.log(`  ${key}: VisibilityTimeout=${attrs.VisibilityTimeout}, FIFO=${attrs.FifoQueue ?? 'false'}, SSL=enforced`);
    }
  });

  // ─── Test 3: All rules exist ────────────────────────────────────────────

  it('test 3: all rules exist (DescribeRule)', () => {
    const ruleKeys = [
      'NcTriageRuleName', 'CapaIntakeRuleName', 'AuditSinkRuleName',
      'HazardRuleName', 'AspectRuleName', 'ReviewFanoutRuleName', 'RecordsRuleName',
    ];
    for (const key of ruleKeys) {
      const ruleName = requireOutput(outputs, key);
      const result = aws<{ State: string; EventPattern: string }>(
        `events describe-rule --name "${ruleName}" --event-bus-name "${busName}"`,
      );
      expect(result.State).toBe('ENABLED');
      expect(result.EventPattern).toBeDefined();
      console.log(`  ${key}: ${ruleName} = ENABLED`);
    }
  });

  // ─── Test 4: Standard-queue direct path (hazard-q) ──────────────────────

  it('test 4: publish Hazard.Identified → arrives in hazard-q', async () => {
    const eventId = `readback-t4-${Date.now()}`;
    const event = JSON.stringify({
      tenantId: 'readback-tenant', eventId, timestamp: new Date().toISOString(),
      actor: 'readback', module: 'M10', clauseRef: 'ISO 45001 6.1.2.1',
      standard: 'ISO45001', payload: { test: true },
    });

    aws(`events put-events --entries '[{"EventBusName":"${busName}","Source":"cumplify.readback","DetailType":"Hazard.Identified","Detail":${JSON.stringify(event)}}]'`);

    // Poll hazard-q for up to 30s
    let found = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const result = aws<{ Messages?: Array<{ Body: string; ReceiptHandle: string }> }>(
        `sqs receive-message --queue-url "${hazardQueueUrl}" --max-number-of-messages 10 --wait-time-seconds 5`,
      );
      for (const msg of result.Messages ?? []) {
        const body = JSON.parse(msg.Body);
        if (body.detail?.eventId === eventId) {
          found = true;
          expect(body.detailType).toBe('Hazard.Identified');
          // Clean up
          aws(`sqs delete-message --queue-url "${hazardQueueUrl}" --receipt-handle "${msg.ReceiptHandle}"`);
          break;
        }
      }
      if (found) break;
    }
    expect(found, `Event ${eventId} not found in hazard-q within 30s`).toBe(true);
    console.log(`  eventId ${eventId} arrived in hazard-q ✓`);
  }, 60_000);

  // ─── Test 5: Standard-queue direct path (records-q) ─────────────────────

  it('test 5: publish Document.Published → arrives in records-q', async () => {
    const eventId = `readback-t5-${Date.now()}`;
    const event = JSON.stringify({
      tenantId: 'readback-tenant', eventId, timestamp: new Date().toISOString(),
      actor: 'readback', module: 'M1', clauseRef: 'ISO 9001 7.5',
      standard: 'ISO9001', payload: { test: true },
    });

    aws(`events put-events --entries '[{"EventBusName":"${busName}","Source":"cumplify.readback","DetailType":"Document.Published","Detail":${JSON.stringify(event)}}]'`);

    let found = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const result = aws<{ Messages?: Array<{ Body: string; ReceiptHandle: string }> }>(
        `sqs receive-message --queue-url "${recordsQueueUrl}" --max-number-of-messages 10 --wait-time-seconds 5`,
      );
      for (const msg of result.Messages ?? []) {
        const body = JSON.parse(msg.Body);
        if (body.detail?.eventId === eventId) {
          found = true;
          expect(body.detailType).toBe('Document.Published');
          aws(`sqs delete-message --queue-url "${recordsQueueUrl}" --receipt-handle "${msg.ReceiptHandle}"`);
          break;
        }
      }
      if (found) break;
    }
    expect(found, `Event ${eventId} not found in records-q within 30s`).toBe(true);
    console.log(`  eventId ${eventId} arrived in records-q, detailType=Document.Published ✓`);
  }, 60_000);

  // ─── Test 6: FIFO path via router (capa-intake) ─────────────────────────

  it('test 6: publish CAPA.Opened → arrives in capa-intake.fifo via router', async () => {
    const eventId = `readback-t6-${Date.now()}`;
    const event = JSON.stringify({
      tenantId: 'readback-tenant', eventId, timestamp: new Date().toISOString(),
      actor: 'readback', module: 'M2', clauseRef: 'ISO 9001 10.2',
      standard: 'ISO9001', payload: { test: true },
    });

    aws(`events put-events --entries '[{"EventBusName":"${busName}","Source":"cumplify.readback","DetailType":"CAPA.Opened","Detail":${JSON.stringify(event)}}]'`);

    let found = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const result = aws<{ Messages?: Array<{ Body: string; ReceiptHandle: string }> }>(
        `sqs receive-message --queue-url "${capaIntakeQueueUrl}" --max-number-of-messages 10 --wait-time-seconds 5`,
      );
      for (const msg of result.Messages ?? []) {
        const body = JSON.parse(msg.Body);
        if (body.detail?.eventId === eventId) {
          found = true;
          expect(body.detailType).toBe('CAPA.Opened');
          aws(`sqs delete-message --queue-url "${capaIntakeQueueUrl}" --receipt-handle "${msg.ReceiptHandle}"`);
          break;
        }
      }
      if (found) break;
    }
    expect(found, `Event ${eventId} not found in capa-intake.fifo within 30s`).toBe(true);
    console.log(`  eventId ${eventId} arrived in capa-intake.fifo via router ✓`);
  }, 60_000);

  // ─── Test 7: FIFO path via router (audit-sink) ──────────────────────────

  it('test 7: publish Document.Approved → arrives in audit-sink.fifo via router', async () => {
    const eventId = `readback-t7-${Date.now()}`;
    const event = JSON.stringify({
      tenantId: 'readback-tenant', eventId, timestamp: new Date().toISOString(),
      actor: 'readback', module: 'M1', clauseRef: 'ISO 9001 7.5',
      standard: 'ISO9001', payload: { test: true },
    });

    aws(`events put-events --entries '[{"EventBusName":"${busName}","Source":"cumplify.readback","DetailType":"Document.Approved","Detail":${JSON.stringify(event)}}]'`);

    let found = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const result = aws<{ Messages?: Array<{ Body: string; ReceiptHandle: string }> }>(
        `sqs receive-message --queue-url "${auditSinkQueueUrl}" --max-number-of-messages 10 --wait-time-seconds 5`,
      );
      for (const msg of result.Messages ?? []) {
        const body = JSON.parse(msg.Body);
        if (body.detail?.eventId === eventId) {
          found = true;
          expect(body.detailType).toBe('Document.Approved');
          aws(`sqs delete-message --queue-url "${auditSinkQueueUrl}" --receipt-handle "${msg.ReceiptHandle}"`);
          break;
        }
      }
      if (found) break;
    }
    expect(found, `Event ${eventId} not found in audit-sink.fifo within 30s`).toBe(true);
    console.log(`  eventId ${eventId} arrived in audit-sink.fifo (suffix rule matched) ✓`);
  }, 60_000);

  // ─── Test 8: ESM-drained path (D-1: prove via CloudWatch Logs) ──────────

  it('test 8: publish Audit.FindingRaised → demo consumer logs eventId (D-1)', async () => {
    const eventId = `readback-t8-${Date.now()}`;
    const event = JSON.stringify({
      tenantId: 'readback-tenant', eventId, timestamp: new Date().toISOString(),
      actor: 'readback', module: 'M3', clauseRef: 'ISO 9001 9.2',
      standard: 'ISO9001', payload: { test: true },
    });

    aws(`events put-events --entries '[{"EventBusName":"${busName}","Source":"cumplify.readback","DetailType":"Audit.FindingRaised","Detail":${JSON.stringify(event)}}]'`);

    // D-1: do NOT poll nc-triage queue (ESM drains it). Verify via CloudWatch Logs.
    let found = false;
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      try {
        const result = aws<{ results: Array<Array<{ field: string; value: string }>> }>(
          `logs start-query --log-group-name "${demoConsumerLogGroup}" ` +
            `--start-time ${Math.floor((Date.now() - 120_000) / 1000)} ` +
            `--end-time ${Math.floor(Date.now() / 1000)} ` +
            `--query-string 'fields @message | filter @message like "${eventId}" | limit 1'`,
        );
        const queryId = (result as unknown as { queryId: string }).queryId;
        await sleep(2000);
        const queryResult = aws<{ status: string; results: Array<Array<{ field: string; value: string }>> }>(
          `logs get-query-results --query-id "${queryId}"`,
        );
        if (queryResult.results && queryResult.results.length > 0) {
          found = true;
          break;
        }
      } catch {
        // Query may fail if log group is cold — retry
      }
    }
    expect(found, `eventId ${eventId} not found in demo consumer logs within 60s`).toBe(true);
    console.log(`  eventId ${eventId} found in demo consumer CloudWatch Logs (D-1 proven) ✓`);
  }, 90_000);

  // ─── Test 9: Poison → DLQ (D-2: explicit send, immediate) ──────────────

  it('test 9: malformed JSON → nc-triage-dlq via explicit poison send (D-2)', async () => {
    // Send malformed JSON directly to nc-triage (ESM picks it up → consumer validates → poison → DLQ)
    const poisonBody = '{"this is not valid JSON at all!!!';
    aws(`sqs send-message --queue-url "${ncTriageQueueUrl}" --message-body '${poisonBody}'`);

    // Poll the DLQ for the poison message (should arrive within seconds due to explicit DLQ send)
    // Extract DLQ URL from ARN
    const dlqArnParts = requireOutput(outputs, 'NcTriageDlqArn').split(':');
    const dlqName = dlqArnParts[dlqArnParts.length - 1];
    const dlqUrlResult = aws<{ QueueUrl: string }>(
      `sqs get-queue-url --queue-name "${dlqName}"`,
    );
    const dlqUrl = dlqUrlResult.QueueUrl;

    let found = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const result = aws<{ Messages?: Array<{ Body: string; MessageAttributes?: Record<string, { StringValue: string }> }> }>(
        `sqs receive-message --queue-url "${dlqUrl}" --max-number-of-messages 10 --wait-time-seconds 5 --message-attribute-names All`,
      );
      for (const msg of result.Messages ?? []) {
        if (msg.Body === poisonBody || msg.MessageAttributes?.PoisonReason) {
          found = true;
          const reason = msg.MessageAttributes?.PoisonReason?.StringValue ?? 'N/A';
          console.log(`  Poison message found in DLQ. Reason: ${reason}`);
          break;
        }
      }
      if (found) break;
    }
    expect(found, 'Poison message not found in nc-triage-dlq within 30s').toBe(true);
    console.log(`  Poison → DLQ path proven (D-2: immediate explicit send) ✓`);
  }, 60_000);

  // ─── Test 10: Cold-start FIFO-router ────────────────────────────────────

  it('test 10: cold-start FIFO-router Lambda (direct invoke)', () => {
    const payload = JSON.stringify({
      targetQueue: 'CAPA_INTAKE_QUEUE_URL',
      detailType: 'CAPA.Opened',
      detail: {
        tenantId: 'cold-start-test', eventId: `cold-t10-${Date.now()}`,
        timestamp: new Date().toISOString(), actor: 'readback',
        module: 'M2', clauseRef: 'ISO 9001 10.2', standard: 'ISO9001', payload: {},
      },
    });

    const start = Date.now();
    awsNoJson(
      `lambda invoke --function-name "${routerArn}" --payload '${payload}' --cli-binary-format raw-in-base64-out /tmp/router-response.json`,
    );
    const duration = Date.now() - start;

    const response = readFileSync('/tmp/router-response.json', 'utf-8');
    expect(response).not.toContain('errorMessage');
    expect(duration).toBeLessThan(30_000);
    console.log(`  FIFO-router cold-start: ${duration}ms (< 30s) ✓`);
  });

  // ─── Test 11: Cold-start demo consumer ──────────────────────────────────

  it('test 11: cold-start demo consumer Lambda (direct invoke)', () => {
    const sqsPayload = JSON.stringify({
      Records: [{
        messageId: 'cold-test-msg',
        receiptHandle: 'fake-receipt',
        body: JSON.stringify({
          detailType: 'Audit.FindingRaised',
          detail: {
            tenantId: 'cold-start-test', eventId: `cold-t11-${Date.now()}`,
            timestamp: new Date().toISOString(), actor: 'readback',
            module: 'M3', clauseRef: 'ISO 9001 9.2', standard: 'ISO9001', payload: {},
          },
        }),
        attributes: { ApproximateReceiveCount: '1', SentTimestamp: `${Date.now()}`, SenderId: 'test', ApproximateFirstReceiveTimestamp: `${Date.now()}` },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: requireOutput(outputs, 'NcTriageQueueArn'),
        awsRegion: REGION,
      }],
    });

    const start = Date.now();
    awsNoJson(
      `lambda invoke --function-name "${demoConsumerArn}" --payload '${sqsPayload}' --cli-binary-format raw-in-base64-out /tmp/consumer-response.json`,
    );
    const duration = Date.now() - start;

    const response = readFileSync('/tmp/consumer-response.json', 'utf-8');
    const parsed = JSON.parse(response);
    expect(parsed.batchItemFailures).toHaveLength(0);
    expect(duration).toBeLessThan(60_000);
    console.log(`  Demo consumer cold-start: ${duration}ms (< 60s) ✓`);
  });

  // ─── Test 12: All 8 DLQ alarms exist ───────────────────────────────────

  it('test 12: all 8 DLQ alarms exist with treatMissingData=notBreaching', () => {
    const result = aws<{ MetricAlarms: Array<{ AlarmName: string; TreatMissingData: string; Namespace: string }> }>(
      `cloudwatch describe-alarms --alarm-name-prefix "CumplifyPipelineDevEven"`,
    );

    const eventingAlarms = result.MetricAlarms.filter(
      (a) => a.Namespace === 'AWS/SQS',
    );
    expect(eventingAlarms.length).toBeGreaterThanOrEqual(8);

    for (const alarm of eventingAlarms) {
      expect(alarm.TreatMissingData).toBe('notBreaching');
      console.log(`  Alarm: ${alarm.AlarmName} — treatMissingData=notBreaching ✓`);
    }
    console.log(`  ${eventingAlarms.length} DLQ alarms verified ✓`);
  });
});
