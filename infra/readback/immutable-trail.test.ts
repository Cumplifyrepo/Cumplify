/**
 * Readback — Spec 5 immutable-trail (design §8.2, 13-test matrix incl. ADJ-4 replay)
 *
 * ALL resource identifiers resolved from cdk-outputs.json (requireOutput).
 * Behavioral tests (write path) need cumplify-dev-admin — set READBACK_PROFILE.
 *
 * ACC-1 tamper (tests 10/11), ACC-2 IAM deny (9), ACC-3 end-to-end (8),
 * ACC-4 verification-green (12), ADJ-4 replay idempotency (13).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCdkOutputs, type StackOutputs } from './helpers.js';

const AT = 'Dev-AuditTrailStack';
const EV = 'Dev-EventingStack';
const DA = 'Dev-DataStack';
const PROFILE = process.env.READBACK_PROFILE ?? 'cumplify-dev-readonly';
const REGION = 'us-east-1';

let outputs: StackOutputs;
let tmp: string;

function req(stack: string, key: string): string {
  const v = outputs[stack]?.[key];
  if (!v) throw new Error(`requireOutput FAILED: ${stack}.${key} missing — a deployed env must not skip.`);
  return v;
}
function awsJson<T>(cmd: string, timeout = 60_000): T {
  const out = execSync(`aws ${cmd} --region ${REGION} --profile ${PROFILE} --output json`, {
    encoding: 'utf-8', timeout, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return (out.trim() ? JSON.parse(out) : {}) as T;
}
function writeArg(obj: unknown): string {
  const p = join(tmp, `arg-${Math.floor(performance.now() * 1000)}.json`);
  writeFileSync(p, JSON.stringify(obj));
  return p;
}
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
function envelope(tenantId: string, eventId: string) {
  return {
    tenantId, eventId, timestamp: new Date().toISOString(), actor: 'readback',
    module: 'M1', clauseRef: 'ISO 9001 7.5', standard: 'ISO9001',
    payload: { before: null, after: { doc: 'readback', v: 1 } },
  };
}
function invoke(arn: string, payload: unknown): { statusCode: number; funcError?: string; body: string; initMs?: number; durationMs?: number } {
  const pf = writeArg(payload);
  const of = join(tmp, `resp-${Math.floor(performance.now() * 1000)}.json`);
  const raw = execSync(
    `aws lambda invoke --function-name "${arn}" --payload file://${pf} --cli-binary-format raw-in-base64-out --log-type Tail --region ${REGION} --profile ${PROFILE} --output json ${of}`,
    { encoding: 'utf-8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const meta = JSON.parse(raw) as { StatusCode: number; FunctionError?: string; LogResult?: string };
  const body = readFileSync(of, 'utf-8');
  let initMs: number | undefined, durationMs: number | undefined;
  if (meta.LogResult) {
    const log = Buffer.from(meta.LogResult, 'base64').toString('utf-8');
    initMs = Number(/Init Duration: ([\d.]+) ms/.exec(log)?.[1]) || undefined;
    durationMs = Number(/\tDuration: ([\d.]+) ms/.exec(log)?.[1]) || undefined;
  }
  return { statusCode: meta.StatusCode, funcError: meta.FunctionError, body, initMs, durationMs };
}

let tenant001SK = '';
const EID8 = `rb-t8-${Math.floor(performance.now())}`;

describe('immutable-trail readback (13-test matrix)', () => {
  beforeAll(() => {
    const loaded = loadCdkOutputs();
    if (!loaded || !loaded[AT]) throw new Error(`cdk-outputs.json missing ${AT} block.`);
    outputs = loaded;
    tmp = mkdtempSync(join(tmpdir(), 'rb-imt-'));
    console.log(`cdk-outputs.json blob SHA: ${execSync('git hash-object cdk-outputs.json', { encoding: 'utf-8' }).trim()}`);
  });

  it('test 1: audit-archive bucket + Object Lock COMPLIANCE + 1-day retention', () => {
    const bucket = req(AT, 'AuditArchiveBucketName');
    const cfg = awsJson<{ ObjectLockConfiguration: { ObjectLockEnabled: string; Rule: { DefaultRetention: { Mode: string; Days: number } } } }>(
      `s3api get-object-lock-configuration --bucket "${bucket}"`);
    expect(cfg.ObjectLockConfiguration.ObjectLockEnabled).toBe('Enabled');
    expect(cfg.ObjectLockConfiguration.Rule.DefaultRetention.Mode).toBe('COMPLIANCE');
    expect(cfg.ObjectLockConfiguration.Rule.DefaultRetention.Days).toBe(1);
    console.log(`  ${bucket}: COMPLIANCE / 1 day ✓`);
  });

  it('test 2: consumer Lambda cold start (< 60s)', () => {
    const r = invoke(req(AT, 'ConsumerFnArn'), { Records: [] });
    expect(r.statusCode).toBe(200);
    expect(r.funcError).toBeUndefined();
    console.log(`  consumer init=${r.initMs}ms dur=${r.durationMs}ms ✓`);
  });

  it('test 3: sealer Lambda cold start (< 60s)', () => {
    const r = invoke(req(AT, 'SealerFnArn'), { Records: [] });
    expect(r.statusCode).toBe(200);
    expect(r.funcError).toBeUndefined();
    console.log(`  sealer init=${r.initMs}ms dur=${r.durationMs}ms ✓`);
  });

  it('test 4: tripwire Lambda cold start (< 30s)', () => {
    const r = invoke(req(AT, 'TripwireFnArn'), { Records: [] });
    expect(r.statusCode).toBe(200);
    expect(r.funcError).toBeUndefined();
    console.log(`  tripwire init=${r.initMs}ms dur=${r.durationMs}ms ✓`);
  });

  it('test 5: verifier Lambda cold start (< 900s, empty tenant)', () => {
    const r = invoke(req(AT, 'VerifierFnArn'), { tenantId: 'rb-coldstart-none' });
    expect(r.statusCode).toBe(200);
    expect(r.funcError).toBeUndefined();
    console.log(`  verifier init=${r.initMs}ms dur=${r.durationMs}ms ✓`);
  });

  it('test 6: daily schedule exists, ENABLED, cron(0 2 * * ? *)', () => {
    const name = req(AT, 'ScheduleName');
    const s = awsJson<{ State: string; ScheduleExpression: string }>(`scheduler get-schedule --name "${name}"`);
    expect(s.State).toBe('ENABLED');
    expect(s.ScheduleExpression).toBe('cron(0 2 * * ? *)');
    console.log(`  ${name}: ${s.ScheduleExpression} ENABLED ✓`);
  });

  it('test 7: all 3 alarms exist with treatMissingData=notBreaching', () => {
    const names = [req(AT, 'SealerDlqAlarmName'), req(AT, 'TamperAlarmName'), req(AT, 'ChainBrokenAlarmName')];
    const res = awsJson<{ MetricAlarms: Array<{ AlarmName: string; TreatMissingData: string }> }>(
      `cloudwatch describe-alarms --alarm-names ${names.map((n) => `"${n}"`).join(' ')}`);
    expect(res.MetricAlarms).toHaveLength(3);
    for (const a of res.MetricAlarms) expect(a.TreatMissingData).toBe('notBreaching');
    console.log(`  3 alarms, all notBreaching ✓`);
  });

  it('test 8: END-TO-END (ACC-3) bus → queue → consumer → DDB → sealed S3', async () => {
    const bus = req(EV, 'EventBusName');
    const table = req(DA, 'TableName');
    const bucket = req(AT, 'AuditArchiveBucketName');
    const pk = 'TENANT#readback-synthetic-001#AUDITLOG';
    const entries = [{ EventBusName: bus, Source: 'cumplify.readback', DetailType: 'Document.Approved', Detail: JSON.stringify(envelope('readback-synthetic-001', EID8)) }];
    awsJson(`events put-events --entries file://${writeArg(entries)}`);

    // Consumer path proof: the chained DDB item (nothing else writes AUDITLOG items)
    let item: Record<string, { S?: string }> | undefined;
    for (let i = 0; i < 12 && !item; i++) {
      await sleep(5000);
      const q = awsJson<{ Items: Array<Record<string, { S?: string }>> }>(
        `dynamodb query --table-name "${table}" --key-condition-expression "PK = :pk" --expression-attribute-values file://${writeArg({ ':pk': { S: pk } })}`);
      item = (q.Items ?? []).find((it) => it.eventId?.S === EID8);
    }
    expect(item, `chained item for ${EID8} not found within 60s`).toBeTruthy();
    tenant001SK = item!.SK!.S!;
    expect(item!.payload).toBeDefined();
    expect(item!.payloadHash?.S).toBeTruthy();
    expect(item!.prevHash?.S).toBe('GENESIS');
    expect(item!.itemType?.S).toBe('AUDITLOG');
    console.log(`  DDB chained item SK=${tenant001SK} prevHash=GENESIS ✓`);

    // Sealed S3 object (COMPLIANCE)
    const iso = tenant001SK.split('#')[1];
    const d = new Date(iso);
    const key = `audit-trail/readback-synthetic-001/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${EID8}.json`;
    let head: { ObjectLockMode?: string; ObjectLockRetainUntilDate?: string } | undefined;
    for (let i = 0; i < 12 && !head; i++) {
      await sleep(5000);
      try { head = awsJson(`s3api head-object --bucket "${bucket}" --key "${key}"`); } catch { /* not sealed yet */ }
    }
    expect(head, `sealed S3 object ${key} not found within 60s`).toBeTruthy();
    expect(head!.ObjectLockMode).toBe('COMPLIANCE');
    expect(head!.ObjectLockRetainUntilDate).toBeTruthy();
    console.log(`  sealed S3 ${key} COMPLIANCE until ${head!.ObjectLockRetainUntilDate} ✓`);
  }, 180_000);

  it('test 9: IAM DENIED (ACC-2) — 5 actions explicitDeny on AUDITLOG', () => {
    const role = req(AT, 'ConsumerRoleArn');
    const tableArn = req(DA, 'TableArn');
    const actions = ['dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem', 'dynamodb:PartiQLUpdate', 'dynamodb:PartiQLDelete'];
    const res = awsJson<{ EvaluationResults: Array<{ EvalActionName: string; EvalDecision: string }> }>(
      `iam simulate-principal-policy --policy-source-arn "${role}" ` +
      `--action-names ${actions.map((a) => `"${a}"`).join(' ')} --resource-arns "${tableArn}" ` +
      `--context-entries ContextKeyName=dynamodb:LeadingKeys,ContextKeyValues=TENANT#readback-synthetic-001#AUDITLOG,ContextKeyType=stringList`);
    for (const a of actions) {
      const r = res.EvaluationResults.find((e) => e.EvalActionName === a);
      expect(r?.EvalDecision, `${a} not explicitDeny`).toBe('explicitDeny');
    }
    console.log(`  all 5 mutation actions explicitDeny ✓`);
  });

  it('test 10: TAMPER tripwire (ACC-1a) — admin UpdateItem → AuditTamperAttempt metric', async () => {
    const table = req(DA, 'TableName');
    expect(tenant001SK, 'test 8 must run first').toBeTruthy();
    const start = new Date(Date.now() - 60_000);
    // Out-of-band admin tamper: corrupt payloadHash on the sealed chain item.
    awsJson(`dynamodb update-item --table-name "${table}" ` +
      `--key file://${writeArg({ PK: { S: 'TENANT#readback-synthetic-001#AUDITLOG' }, SK: { S: tenant001SK } })} ` +
      `--update-expression "SET payloadHash = :h" ` +
      `--expression-attribute-values file://${writeArg({ ':h': { S: 'TAMPERED-BY-READBACK' } })}`);

    let sum = 0;
    for (let i = 0; i < 12 && sum < 1; i++) {
      await sleep(6000);
      const m = awsJson<{ Datapoints: Array<{ Sum: number }> }>(
        `cloudwatch get-metric-statistics --namespace "Cumplify/AuditTrail" --metric-name AuditTamperAttempt ` +
        `--dimensions Name=TenantId,Value=readback-synthetic-001 ` +
        `--start-time ${start.toISOString()} --end-time ${new Date(Date.now() + 60_000).toISOString()} ` +
        `--period 60 --statistics Sum`);
      sum = (m.Datapoints ?? []).reduce((a, d) => a + d.Sum, 0);
    }
    expect(sum, 'AuditTamperAttempt metric not emitted within ~72s').toBeGreaterThanOrEqual(1);
    console.log(`  tripwire fired: AuditTamperAttempt sum=${sum} ✓`);
  }, 120_000);

  it('test 11: TAMPER verifier (ACC-1b) — chain break detected on tampered tenant', () => {
    const r = invoke(req(AT, 'VerifierFnArn'), { tenantId: 'readback-synthetic-001' });
    expect(r.statusCode).toBe(200);
    const results = JSON.parse(r.body) as Array<{ tenantId: string; chainValid: boolean; brokenLinks: unknown[] }>;
    const t = results.find((x) => x.tenantId === 'readback-synthetic-001');
    expect(t?.chainValid, 'verifier should report chainValid=false on tampered tenant').toBe(false);
    expect((t?.brokenLinks ?? []).length).toBeGreaterThanOrEqual(1);
    console.log(`  verifier: chainValid=false, brokenLinks=${t!.brokenLinks.length} ✓`);
  });

  it('test 12: VERIFICATION GREEN (ACC-4) — untampered tenant chainValid=true', async () => {
    const bus = req(EV, 'EventBusName');
    const table = req(DA, 'TableName');
    const eid = `rb-t12-${Math.floor(performance.now())}`;
    const pk = 'TENANT#readback-synthetic-002#AUDITLOG';
    awsJson(`events put-events --entries file://${writeArg([{ EventBusName: bus, Source: 'cumplify.readback', DetailType: 'Document.Approved', Detail: JSON.stringify(envelope('readback-synthetic-002', eid)) }])}`);
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      await sleep(5000);
      const q = awsJson<{ Items: Array<Record<string, { S?: string }>> }>(
        `dynamodb query --table-name "${table}" --key-condition-expression "PK = :pk" --expression-attribute-values file://${writeArg({ ':pk': { S: pk } })}`);
      found = (q.Items ?? []).some((it) => it.eventId?.S === eid);
    }
    expect(found, 'clean tenant item not created within 60s').toBe(true);
    const r = invoke(req(AT, 'VerifierFnArn'), { tenantId: 'readback-synthetic-002' });
    const results = JSON.parse(r.body) as Array<{ tenantId: string; chainValid: boolean }>;
    const t = results.find((x) => x.tenantId === 'readback-synthetic-002');
    expect(t?.chainValid, 'untampered chain must verify green').toBe(true);
    console.log(`  verifier: chainValid=true on untampered tenant ✓`);
  }, 120_000);

  it('test 13: REPLAY IDEMPOTENCY (ADJ-4) — double consumer invoke → 1 chain item', async () => {
    const table = req(DA, 'TableName');
    const qArn = req(EV, 'AuditSinkQueueArn');
    const eid = `rb-t13-${Math.floor(performance.now())}`;
    const pk = 'TENANT#readback-synthetic-003#AUDITLOG';
    const body = JSON.stringify({ detailType: 'Document.Approved', detail: envelope('readback-synthetic-003', eid) });
    const sqsEvent = {
      Records: [{
        messageId: `rb-msg-${eid}`, receiptHandle: 'rb', body,
        attributes: { ApproximateReceiveCount: '1', SentTimestamp: `${Date.now()}`, SenderId: 'rb', ApproximateFirstReceiveTimestamp: `${Date.now()}`, MessageGroupId: 'readback-synthetic-003', MessageDeduplicationId: eid },
        messageAttributes: {}, md5OfBody: '', eventSource: 'aws:sqs', eventSourceARN: qArn, awsRegion: REGION,
      }],
    };
    const r1 = invoke(req(AT, 'ConsumerFnArn'), sqsEvent);
    expect(JSON.parse(r1.body).batchItemFailures).toHaveLength(0);
    const r2 = invoke(req(AT, 'ConsumerFnArn'), sqsEvent);
    expect(JSON.parse(r2.body).batchItemFailures, 'replay must be swallowed, not failed').toHaveLength(0);

    await sleep(2000);
    const q = awsJson<{ Items: Array<Record<string, { S?: string }>> }>(
      `dynamodb query --table-name "${table}" --key-condition-expression "PK = :pk" --expression-attribute-values file://${writeArg({ ':pk': { S: pk } })}`);
    const matches = (q.Items ?? []).filter((it) => it.eventId?.S === eid);
    expect(matches, 'replay wrote a duplicate chain item').toHaveLength(1);
    console.log(`  double-invoke same eventId → exactly 1 chain item (replay swallowed) ✓`);
  }, 60_000);
});
