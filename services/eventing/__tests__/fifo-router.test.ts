import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsMock = mockClient(SQSClient);

// Set env vars BEFORE importing handler
vi.stubEnv('CAPA_INTAKE_QUEUE_URL', 'https://sqs.us-east-1.amazonaws.com/123/capa-intake.fifo');
vi.stubEnv('AUDIT_SINK_QUEUE_URL', 'https://sqs.us-east-1.amazonaws.com/123/audit-sink.fifo');
vi.stubEnv('POWERTOOLS_SERVICE_NAME', 'fifo-router');

// Dynamic import after env setup
const { handler } = await import('../handlers/fifo-router.js');

beforeEach(() => {
  sqsMock.reset();
  sqsMock.on(SendMessageCommand).resolves({});
});

describe('fifo-router handler', () => {
  it('should route to capa-intake FIFO with correct MessageGroupId and DeduplicationId', async () => {
    await handler({
      targetQueue: 'CAPA_INTAKE_QUEUE_URL',
      detailType: 'CAPA.Opened',
      detail: {
        tenantId: 'tenant-abc',
        eventId: 'evt-123',
        timestamp: '2026-07-04T12:00:00Z',
        actor: 'CAPAGuru',
        module: 'M2',
        clauseRef: 'ISO 9001 10.2',
        standard: 'ISO9001',
        auditTrail: true,
        payload: {},
      },
    });

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);

    const input = calls[0].args[0].input;
    expect(input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123/capa-intake.fifo');
    expect(input.MessageGroupId).toBe('tenant-abc');
    expect(input.MessageDeduplicationId).toBe('evt-123');

    // FIX-1: MessageBody is canonical {detailType, detail}
    const body = JSON.parse(input.MessageBody!);
    expect(body.detailType).toBe('CAPA.Opened');
    expect(body.detail.tenantId).toBe('tenant-abc');
    expect(body.detail.eventId).toBe('evt-123');
  });

  it('should route to audit-sink FIFO', async () => {
    await handler({
      targetQueue: 'AUDIT_SINK_QUEUE_URL',
      detailType: 'Document.Approved',
      detail: {
        tenantId: 'tenant-xyz',
        eventId: 'evt-456',
        timestamp: '2026-07-04T13:00:00Z',
        actor: 'DocStudio',
        module: 'M1',
        clauseRef: 'ISO 9001 7.5',
        standard: 'ISO9001',
        auditTrail: true,
        payload: {},
      },
    });

    const calls = sqsMock.commandCalls(SendMessageCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.QueueUrl).toBe(
      'https://sqs.us-east-1.amazonaws.com/123/audit-sink.fifo',
    );
    expect(calls[0].args[0].input.MessageGroupId).toBe('tenant-xyz');
  });

  it('should throw on unknown targetQueue key', async () => {
    await expect(
      handler({
        targetQueue: 'UNKNOWN_QUEUE_URL',
        detailType: 'Test.Event',
        detail: {
          tenantId: 'tenant-1',
          eventId: 'evt-1',
        },
      }),
    ).rejects.toThrow('Unknown or unconfigured targetQueue key: UNKNOWN_QUEUE_URL');
  });
});
