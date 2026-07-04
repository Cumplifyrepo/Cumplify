import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { publish } from '../src/publisher.js';
import type { CumplifyEvent } from '../src/types.js';

const ebMock = mockClient(EventBridgeClient);

const baseEvent: CumplifyEvent = {
  tenantId: 'tenant-123',
  eventId: '',
  timestamp: '2026-07-04T12:00:00Z',
  actor: 'CAPAGuru',
  module: 'M2',
  clauseRef: 'ISO 9001 10.2',
  standard: 'ISO9001',
  payload: { capaId: 'capa-001' },
};

beforeEach(() => {
  ebMock.reset();
});

describe('publish', () => {
  it('should publish an event and return the eventId', async () => {
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 0,
      Entries: [{ EventId: 'eb-event-id' }],
    });

    const eventId = await publish({
      busName: 'cumplify-events',
      source: 'cumplify.m2.capa',
      detailType: 'CAPA.Opened',
      event: { ...baseEvent, eventId: 'pre-set-id' },
    });

    expect(eventId).toBe('pre-set-id');
    const call = ebMock.commandCalls(PutEventsCommand)[0];
    const entry = call.args[0].input.Entries![0];
    expect(entry.EventBusName).toBe('cumplify-events');
    expect(entry.Source).toBe('cumplify.m2.capa');
    expect(entry.DetailType).toBe('CAPA.Opened');
    const detail = JSON.parse(entry.Detail!);
    expect(detail.tenantId).toBe('tenant-123');
    expect(detail.eventId).toBe('pre-set-id');
  });

  it('should auto-generate a ULID eventId when not provided', async () => {
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 0,
      Entries: [{ EventId: 'eb-event-id' }],
    });

    const eventId = await publish({
      busName: 'cumplify-events',
      source: 'cumplify.m2.capa',
      detailType: 'CAPA.Opened',
      event: { ...baseEvent, eventId: '' },
    });

    // ULID is 26 chars, uppercase alphanumeric
    expect(eventId).toMatch(/^[0-9A-Z]{26}$/);
    const call = ebMock.commandCalls(PutEventsCommand)[0];
    const detail = JSON.parse(call.args[0].input.Entries![0].Detail!);
    expect(detail.eventId).toBe(eventId);
  });

  it('should throw on FailedEntryCount > 0', async () => {
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalError', ErrorMessage: 'Something broke' }],
    });

    await expect(
      publish({
        busName: 'cumplify-events',
        source: 'cumplify.m2.capa',
        detailType: 'CAPA.Opened',
        event: baseEvent,
      }),
    ).rejects.toThrow('PutEvents failed: Something broke');
  });

  it('should include all ET-4 envelope fields in the Detail payload', async () => {
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 0,
      Entries: [{ EventId: 'eb-id' }],
    });

    await publish({
      busName: 'cumplify-events',
      source: 'cumplify.m3.audit-studio',
      detailType: 'Audit.FindingRaised',
      event: {
        tenantId: 't-456',
        eventId: 'evt-001',
        timestamp: '2026-07-04T13:00:00Z',
        actor: 'LeadAuditor',
        module: 'M3',
        clauseRef: 'ISO 9001 9.2',
        standard: 'ISO9001',
        payload: { findingId: 'f-1' },
      },
    });

    const call = ebMock.commandCalls(PutEventsCommand)[0];
    const detail = JSON.parse(call.args[0].input.Entries![0].Detail!);
    expect(detail).toMatchObject({
      tenantId: 't-456',
      eventId: 'evt-001',
      timestamp: '2026-07-04T13:00:00Z',
      actor: 'LeadAuditor',
      module: 'M3',
      clauseRef: 'ISO 9001 9.2',
      standard: 'ISO9001',
      payload: { findingId: 'f-1' },
    });
  });
});
