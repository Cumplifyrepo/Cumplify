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
    auditTrail: true,
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

// ─── FIFO Mode Tests (REV-3, FIX-1, FIX-3) ────────────────────────────────────

import { createFifoHandler } from '../src/consumer.js';

describe('createFifoHandler', () => {
  it('CON-7a: on transient failure at message #2, reports #2..#5 as batchItemFailures', async () => {
    let callCount = 0;
    const handler = createFifoHandler({
      fifo: true,
      dlqUrl: DLQ_URL,
      handler: async () => {
        callCount++;
        if (callCount === 2) throw new Error('DynamoDB timeout');
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [
        makeSqsRecord(makeValidBody(), 'msg-1'),
        makeSqsRecord(makeValidBody(), 'msg-2'),
        makeSqsRecord(makeValidBody(), 'msg-3'),
        makeSqsRecord(makeValidBody(), 'msg-4'),
        makeSqsRecord(makeValidBody(), 'msg-5'),
      ],
    };
    const result = await handler(sqsEvent);

    // msg-2, msg-3, msg-4, msg-5 reported as failures (FIFO ordering)
    expect(result.batchItemFailures).toHaveLength(4);
    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual([
      'msg-2',
      'msg-3',
      'msg-4',
      'msg-5',
    ]);
    // Only msg-1 was processed successfully
    expect(callCount).toBe(2); // called for msg-1 (success) and msg-2 (failure)
  });

  it('CON-7b: poison send to FIFO DLQ includes MessageGroupId and MessageDeduplicationId', async () => {
    const handler = createFifoHandler({
      fifo: true,
      dlqUrl: DLQ_URL,
      handler: async () => {
        throw new PoisonMessageError('Item size exceeds 400KB limit');
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord(makeValidBody({ tenantId: 'tenant-fifo-test' }), 'msg-fifo-1')],
    };
    const result = await handler(sqsEvent);

    // Poison handled — not in batchItemFailures
    expect(result.batchItemFailures).toHaveLength(0);

    // DLQ send has FIFO params (FIX-3)
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.MessageGroupId).toBe('tenant-fifo-test');
    expect(input.MessageDeduplicationId).toBe('msg-fifo-1');
    expect(input.MessageAttributes?.PoisonReason?.StringValue).toBe(
      'Item size exceeds 400KB limit',
    );
  });

  it('FIX-3: poison send uses messageId as MessageGroupId when body is unparseable', async () => {
    const handler = createFifoHandler({
      fifo: true,
      dlqUrl: DLQ_URL,
      handler: async () => {},
    });

    // Malformed JSON body — parseAndValidate throws PoisonMessageError before handler
    const sqsEvent: SQSEvent = {
      Records: [makeSqsRecord('not json at all', 'msg-bad-json')],
    };
    const result = await handler(sqsEvent);

    expect(result.batchItemFailures).toHaveLength(0);
    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    // Falls back to messageId since body can't be parsed
    expect(input.MessageGroupId).toBe('msg-bad-json');
    expect(input.MessageDeduplicationId).toBe('msg-bad-json');
  });

  it('idempotentErrors: ReplayDetectedError is treated as success, batch continues', async () => {
    let callCount = 0;
    const handler = createFifoHandler({
      fifo: true,
      dlqUrl: DLQ_URL,
      handler: async () => {
        callCount++;
        if (callCount === 2) {
          const err = new Error('Replay detected for eventId xyz');
          err.name = 'ReplayDetectedError';
          throw err;
        }
      },
      idempotentErrors: ['ReplayDetectedError'],
    });

    const sqsEvent: SQSEvent = {
      Records: [
        makeSqsRecord(makeValidBody(), 'msg-1'),
        makeSqsRecord(makeValidBody(), 'msg-2'), // replay → success
        makeSqsRecord(makeValidBody(), 'msg-3'),
      ],
    };
    const result = await handler(sqsEvent);

    // All processed successfully (replay is not a failure)
    expect(result.batchItemFailures).toHaveLength(0);
    expect(callCount).toBe(3); // all three messages processed
    // No DLQ send
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
  });

  it('poison after transient: transient stops the batch before reaching poison', async () => {
    let callCount = 0;
    const handler = createFifoHandler({
      fifo: true,
      dlqUrl: DLQ_URL,
      handler: async () => {
        callCount++;
        if (callCount === 1) throw new Error('transient');
      },
    });

    const sqsEvent: SQSEvent = {
      Records: [
        makeSqsRecord(makeValidBody(), 'msg-1'), // transient → stop
        makeSqsRecord('invalid json', 'msg-2'), // never reached
      ],
    };
    const result = await handler(sqsEvent);

    // Both reported as failures (FIFO fail-forward-all)
    expect(result.batchItemFailures).toHaveLength(2);
    expect(result.batchItemFailures.map((f) => f.itemIdentifier)).toEqual(['msg-1', 'msg-2']);
    // No DLQ send (msg-2 never processed)
    expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
  });
});
