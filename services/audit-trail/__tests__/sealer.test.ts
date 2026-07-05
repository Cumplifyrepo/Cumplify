import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { handler } from '../handlers/sealer.js';

const s3Mock = mockClient(S3Client);

process.env.AUDIT_ARCHIVE_BUCKET = 'test-audit-archive';
process.env.RETENTION_DAYS = '1';

beforeEach(() => {
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
});

function makeStreamEvent(overrides?: Partial<Record<string, any>>): DynamoDBStreamEvent {
  return {
    Records: [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventVersion: '1.1',
        eventSource: 'aws:dynamodb',
        awsRegion: 'us-east-1',
        dynamodb: {
          Keys: {
            PK: { S: 'TENANT#t1#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001' },
          },
          NewImage: {
            PK: { S: 'TENANT#t1#AUDITLOG' },
            SK: { S: 'EVENT#2026-07-04T12:00:00.000Z#01J000000000000000000001' },
            itemType: { S: 'AUDITLOG' },
            eventId: { S: '01J000000000000000000001' },
            eventType: { S: 'CAPA.Closed' },
            actor: { S: 'user-1' },
            module: { S: 'M2' },
            clauseRef: { S: 'ISO 9001 10.2' },
            standard: { S: 'ISO9001' },
            payloadHash: { S: 'abc123' },
            prevHash: { S: 'GENESIS' },
            payload: { M: { before: { NULL: true }, after: { M: { status: { S: 'closed' } } } } },
            ...overrides,
          },
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
        eventSourceARN: 'arn:aws:dynamodb:us-east-1:123:table/CumplifyCore/stream/123',
      },
    ],
  };
}

describe('sealer handler', () => {
  it('writes sealed object to S3 with correct key format', async () => {
    await handler(makeStreamEvent());

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Key).toBe('audit-trail/t1/2026/07/04/01J000000000000000000001.json');
    expect(input.Bucket).toBe('test-audit-archive');
  });

  it('sets Object Lock COMPLIANCE mode and retention', async () => {
    await handler(makeStreamEvent());

    const calls = s3Mock.commandCalls(PutObjectCommand);
    const input = calls[0].args[0].input;
    expect(input.ObjectLockMode).toBe('COMPLIANCE');
    // Retention = now + 1 day
    expect(input.ObjectLockRetainUntilDate).toBeInstanceOf(Date);
    const retainDate = input.ObjectLockRetainUntilDate as Date;
    const now = new Date();
    // Should be roughly 1 day from now (within a few seconds)
    const diffMs = retainDate.getTime() - now.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    expect(diffMs).toBeGreaterThan(oneDayMs - 10000);
    expect(diffMs).toBeLessThan(oneDayMs + 10000);
  });

  it('sets ChecksumAlgorithm to SHA256 (FIX-6)', async () => {
    await handler(makeStreamEvent());

    const calls = s3Mock.commandCalls(PutObjectCommand);
    const input = calls[0].args[0].input;
    expect(input.ChecksumAlgorithm).toBe('SHA256');
  });

  it('skips non-AUDITLOG items (FIX-4 defense-in-depth)', async () => {
    const event = makeStreamEvent({ itemType: { S: 'AUDITDEDUP' } });
    await handler(event);

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('skips non-INSERT events', async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          ...makeStreamEvent().Records[0],
          eventName: 'MODIFY',
        },
      ],
    };
    await handler(event);

    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('computes retention from RETENTION_DAYS env var', async () => {
    process.env.RETENTION_DAYS = '2555';
    await handler(makeStreamEvent());

    const calls = s3Mock.commandCalls(PutObjectCommand);
    const retainDate = calls[0].args[0].input.ObjectLockRetainUntilDate as Date;
    const now = new Date();
    const diffDays = Math.round((retainDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(2555);

    process.env.RETENTION_DAYS = '1'; // reset
  });
});
