import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { marshall } from '@aws-sdk/util-dynamodb';
import { handler } from '../handlers/verifier.js';
import { computePrevHash, computePayloadHash, GENESIS_HASH } from '../src/hash-chain.js';
import type { Context } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);
const cwMock = mockClient(CloudWatchClient);

process.env.TABLE_NAME = 'CumplifyCore';
process.env.AUDIT_ARCHIVE_BUCKET = 'test-audit-archive';

const mockContext: Context = {
  getRemainingTimeInMillis: () => 600_000, // 10 min remaining
  functionName: 'verifier',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123:function:verifier',
  memoryLimitInMB: '1024',
  awsRequestId: 'req-1',
  logGroupName: '/aws/lambda/verifier',
  logStreamName: 'stream-1',
  callbackWaitsForEmptyEventLoop: false,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  cwMock.reset();
  cwMock.on(PutMetricDataCommand).resolves({});
  s3Mock.on(HeadObjectCommand).resolves({});
  ddbMock.on(PutItemCommand).resolves({});
});

function makeChainItem(tenantId: string, index: number, prevItem?: any) {
  const pk = `TENANT#${tenantId}#AUDITLOG`;
  const ts = `2026-07-04T${String(10 + index).padStart(2, '0')}:00:00.000Z`;
  const eventId = `evt-${String(index).padStart(3, '0')}`;
  const sk = `EVENT#${ts}#${eventId}`;
  const payload = { before: null, after: { step: index } };
  const payloadHash = computePayloadHash(payload);

  let prevHash: string;
  if (prevItem) {
    prevHash = computePrevHash(prevItem.PK, prevItem.SK, prevItem.payloadHash);
  } else {
    prevHash = GENESIS_HASH;
  }

  return { PK: pk, SK: sk, itemType: 'AUDITLOG', eventId, payload, payloadHash, prevHash };
}

describe('verifier handler', () => {
  it('validates an untampered chain and returns chainValid=true', async () => {
    const item1 = makeChainItem('t1', 1);
    const item2 = makeChainItem('t1', 2, item1);

    // Watermark query → no watermark
    ddbMock.on(GetItemCommand).resolves({ Item: undefined });

    // AUDITMETA query not needed (single tenant via event)
    // Chain items query
    ddbMock.on(QueryCommand).resolves({
      Items: [marshall(item1), marshall(item2)],
    });

    const results = await handler({ tenantId: 't1' }, mockContext);

    expect(results).toHaveLength(1);
    expect(results[0].tenantId).toBe('t1');
    expect(results[0].chainValid).toBe(true);
    expect(results[0].itemsChecked).toBe(2);
    expect(results[0].brokenLinks).toHaveLength(0);
    // No metric emission for valid chain
    expect(cwMock.commandCalls(PutMetricDataCommand)).toHaveLength(0);
  });

  it('detects prevHash tampering and emits AuditChainBroken metric', async () => {
    const item1 = makeChainItem('t1', 1);
    const item2 = makeChainItem('t1', 2, item1);
    // Tamper item2's prevHash
    item2.prevHash = 'tampered-hash-value';

    ddbMock.on(GetItemCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({
      Items: [marshall(item1), marshall(item2)],
    });

    const results = await handler({ tenantId: 't1' }, mockContext);

    expect(results[0].chainValid).toBe(false);
    expect(results[0].brokenLinks).toHaveLength(1);
    expect(results[0].brokenLinks[0].type).toBe('prevHash');
    expect(results[0].brokenLinks[0].eventId).toBe('evt-002');

    // Metric emitted
    const metricCalls = cwMock.commandCalls(PutMetricDataCommand);
    expect(metricCalls).toHaveLength(1);
    expect(metricCalls[0].args[0].input.MetricData![0].MetricName).toBe('AuditChainBroken');
  });

  it('detects payloadHash tampering (REV-2: recompute from stored payload)', async () => {
    const item1 = makeChainItem('t1', 1);
    // Tamper item1's payloadHash (doesn't match stored payload)
    item1.payloadHash = 'wrong-payload-hash';

    ddbMock.on(GetItemCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({
      Items: [marshall(item1)],
    });

    const results = await handler({ tenantId: 't1' }, mockContext);

    expect(results[0].chainValid).toBe(false);
    expect(results[0].brokenLinks[0].type).toBe('payloadHash');
  });

  it('checks S3 objects and counts mismatches', async () => {
    const item1 = makeChainItem('t1', 1);

    ddbMock.on(GetItemCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({ Items: [marshall(item1)] });

    // S3 HeadObject fails → missing sealed object
    s3Mock.on(HeadObjectCommand).rejects(new Error('NotFound'));

    const results = await handler({ tenantId: 't1' }, mockContext);

    expect(results[0].s3Mismatches).toBe(1);
    // Chain is still valid (S3 mismatch doesn't break chain validity per se)
    expect(results[0].chainValid).toBe(true);
  });

  it('updates watermark after successful verification', async () => {
    const item1 = makeChainItem('t1', 1);

    ddbMock.on(GetItemCommand).resolves({ Item: undefined });
    ddbMock.on(QueryCommand).resolves({ Items: [marshall(item1)] });

    await handler({ tenantId: 't1' }, mockContext);

    // PutItem for watermark update
    const putCalls = ddbMock.commandCalls(PutItemCommand);
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    const lastPut = putCalls[putCalls.length - 1].args[0].input;
    const putItem = unmarshall(lastPut.Item!);
    expect(putItem.PK).toBe('AUDITMETA');
    expect(putItem.SK).toBe('VERIFY_WATERMARK#t1');
  });
});

// Helper to import unmarshall in test scope
import { unmarshall } from '@aws-sdk/util-dynamodb';
