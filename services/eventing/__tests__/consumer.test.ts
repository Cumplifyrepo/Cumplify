import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { createHandler, PoisonMessageError } from '../src/consumer.js';
import type { CumplifyEvent } from '../src/types.js';

const sqsMock = mockClient(SQSClient);

const DLQ_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-dlq';

function makeSqsRecord(body: string, messageId = 'msg-001'): SQSRecord {
  return {
    messageId,
    receiptHandle: 'receipt-1',
    body,
    attributes: {} as SQSRecord['attributes'],
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
    awsRegion: 'us-east-1',
  };
}

function makeValidBody(overrides?: Partial<CumplifyEvent>): string {
  const event: CumplifyEvent = {
    tenantId: 'tenant-123',
    eventId: 'evt-001',
    timestamp: '2026-07-04T12:00:00Z',
    actor: 'LeadAuditor',
    module: 'M3',
    clauseRef: 'ISO 9001 9.2',
    standard: 'ISO9001',
    payload: { findingId: 'f-1' },
    ...overrides,
  };
  return JSON.stringify({ detailType: 'Audit.FindingRaised', detail: event });
}

beforeEach(() => {
  sqsMock.reset();
  sqsMock.on(SendMessageCommand).resolves({});
});

describe('createHandler', () => {
  it('should process a valid QueueMessage and call handler with detail + detailType', async () => {
    const received: { event: CumplifyEvent; detailType: string }[] = [];
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async (event, detailType) => {
        received.push({ event, detailType });
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord(makeValidBody())],
    };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    expect(received).toHaveLength(1);
    expect(received[0].detailType).toBe('Audit.FindingRaised');
    expect(received[0].event.tenantId).toBe('tenant-123');
    expect(received[0].event.eventId).toBe('evt-001');
  });

  it('should route malformed JSON to DLQ immediately (D-2)', async () => {
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async () => {},
    });

    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord('not valid json{{{')],
    };
    const result = await handler(sqsEvent);

    // Not in batchItemFailures (handled via explicit DLQ send)
    expect(result.batchItemFailures).toHaveLength(0);

    // Assert DLQ send was called
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.QueueUrl).toBe(DLQ_URL);
    expect(calls[0].args[0].input.MessageAttributes?.PoisonReason?.StringValue).toBe(
      'JSON parse failure',
    );
  });

  it('should route message with missing detailType to DLQ', async () => {
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async () => {},
    });

    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord(JSON.stringify({ detail: { tenantId: 't' } }))],
    };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.MessageAttributes?.PoisonReason?.StringValue).toBe(
      'Missing or invalid detailType',
    );
  });

  it('should route message with missing envelope field to DLQ', async () => {
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async () => {},
    });

    // Missing 'actor' field
    const body = JSON.stringify({
      detailType: 'CAPA.Opened',
      detail: {
        tenantId: 't-1',
        eventId: 'e-1',
        timestamp: '2026-07-04T00:00:00Z',
        // actor: missing
        module: 'M2',
        clauseRef: 'ISO 9001 10.2',
        standard: 'ISO9001',
        payload: {},
      },
    });

    const sqsEvent: SQSEvent = { Records: [makeSqsRecord(body)] };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls[0].args[0].input.MessageAttributes?.PoisonReason?.StringValue).toBe(
      'Missing envelope field: detail.actor',
    );
  });

  it('should report transient errors as batchItemFailures (SQS retry)', async () => {
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async () => {
        throw new Error('Timeout connecting to downstream');
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord(makeValidBody(), 'msg-transient')],
    };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-transient');
    // No DLQ send for transient errors
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
  });

  it('should handle a batch with mixed outcomes', async () => {
    let callCount = 0;
    const handler = createHandler({
      dlqUrl: DLQ_URL,
      handler: async () => {
        callCount++;
        if (callCount === 2) throw new Error('transient');
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [
        makeSqsRecord(makeValidBody(), 'msg-1'), // success
        makeSqsRecord(makeValidBody(), 'msg-2'), // transient error
        makeSqsRecord('invalid json', 'msg-3'), // poison
      ],
    };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-2');
    // Poison sent to DLQ
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.MessageAttributes?.OriginalMessageId?.StringValue).toBe('msg-3');
  });
});

describe('PoisonMessageError', () => {
  it('should be an instance of Error with correct name', () => {
    const err = new PoisonMessageError('test reason');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PoisonMessageError');
    expect(err.message).toBe('test reason');
  });
});
