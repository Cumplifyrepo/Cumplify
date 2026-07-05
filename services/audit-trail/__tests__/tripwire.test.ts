import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { handler } from '../handlers/tripwire.js';

const cwMock = mockClient(CloudWatchClient);

beforeEach(() => {
  cwMock.reset();
  cwMock.on(PutMetricDataCommand).resolves({});
});

function makeModifyEvent(itemType = 'AUDITLOG'): DynamoDBStreamEvent {
  return {
    Records: [
      {
        eventID: '1',
        eventName: 'MODIFY',
        eventVersion: '1.1',
        eventSource: 'aws:dynamodb',
        awsRegion: 'us-east-1',
        dynamodb: {
          Keys: {
            PK: { S: 'TENANT#tenant-tamper#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001' },
          },
          OldImage: {
            PK: { S: 'TENANT#tenant-tamper#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001' },
            itemType: { S: itemType },
            payloadHash: { S: 'original-hash' },
          },
          NewImage: {
            PK: { S: 'TENANT#tenant-tamper#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001' },
            itemType: { S: itemType },
            payloadHash: { S: 'tampered-hash' },
          },
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:123:table/CumplifyCore/stream/123',
      },
    ],
  };
}

function makeRemoveEvent(): DynamoDBStreamEvent {
  return {
    Records: [
      {
        eventID: '2',
        eventName: 'REMOVE',
        eventVersion: '1.1',
        eventSource: 'aws:dynamodb',
        awsRegion: 'us-east-1',
        dynamodb: {
          Keys: {
            PK: { S: 'TENANT#tenant-del#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#ulid1' },
          },
          OldImage: {
            PK: { S: 'TENANT#tenant-del#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#ulid1' },
            itemType: { S: 'AUDITLOG' },
            payloadHash: { S: 'some-hash' },
          },
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:123:table/CumplifyCore/stream/123',
      },
    ],
  };
}

describe('tripwire handler', () => {
  it('emits AuditTamperAttempt metric on MODIFY of AUDITLOG item', async () => {
    await handler(makeModifyEvent());

    const calls = cwMock.commandCalls(PutMetricDataCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Namespace).toBe('Cumplify/AuditTrail');
    expect(input.MetricData![0].MetricName).toBe('AuditTamperAttempt');
    expect(input.MetricData![0].Value).toBe(1);
    expect(input.MetricData![0].Dimensions![0]).toEqual({
      Name: 'TenantId',
      Value: 'tenant-tamper',
    });
  });

  it('emits AuditTamperAttempt metric on REMOVE of AUDITLOG item', async () => {
    await handler(makeRemoveEvent());

    const calls = cwMock.commandCalls(PutMetricDataCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.MetricData![0].Dimensions![0].Value).toBe('tenant-del');
  });

  it('skips non-AUDITLOG items (FIX-4 defense-in-depth)', async () => {
    await handler(makeModifyEvent('AUDITDEDUP'));

    expect(cwMock.commandCalls(PutMetricDataCommand)).toHaveLength(0);
  });

  it('skips records without Keys', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: '3',
          eventName: 'MODIFY',
          eventVersion: '1.1',
          eventSource: 'aws:dynamodb',
          awsRegion: 'us-east-1',
          dynamodb: {
            // No Keys
            StreamViewType: 'NEW_AND_OLD_IMAGES',
          },
          eventSourceARN: 'arn:aws:dynamodb:us-east-1:123:table/CumplifyCore/stream/123',
        },
      ],
    };
    await handler(event);

    expect(cwMock.commandCalls(PutMetricDataCommand)).toHaveLength(0);
  });
});
