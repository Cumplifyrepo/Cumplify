/**
 * Integration test: R-3 (AuditSinkRule) event pattern verification (OQ-5).
 *
 * Calls the live EventBridge TestEventPattern API to prove the R-3 pattern
 * { "detail": { "auditTrail": [true] } } works correctly.
 *
 * THIS FILE IS NAMED *.int.test.ts AND IS EXCLUDED FROM THE DEFAULT VITEST
 * RUN (vitest include only matches *.test.ts and *.property.test.ts).
 * It must be run explicitly with dev credentials:
 *   npx vitest run services/eventing/__tests__/event-pattern.int.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  EventBridgeClient,
  TestEventPatternCommand,
} from '@aws-sdk/client-eventbridge';

const client = new EventBridgeClient({ region: 'us-east-1' });

// The R-3 pattern as defined in design §13.2 (OQ-5 ratified)
const R3_PATTERN = JSON.stringify({
  detail: {
    auditTrail: [true],
  },
});

function makeEvent(detailType: string, auditTrail: boolean): string {
  return JSON.stringify({
    version: '0',
    id: '12345678-1234-1234-1234-123456789012',
    source: 'cumplify.m1.document-studio',
    account: '697114252993',
    time: '2026-07-04T12:00:00Z',
    region: 'us-east-1',
    resources: [],
    'detail-type': detailType,
    detail: {
      tenantId: 'test-tenant',
      eventId: 'test-event',
      timestamp: '2026-07-04T12:00:00Z',
      actor: 'test-actor',
      module: 'M1',
      clauseRef: 'ISO 9001 7.5',
      standard: 'ISO9001',
      auditTrail,
      payload: {},
    },
  });
}

async function testPattern(event: string): Promise<boolean> {
  const result = await client.send(
    new TestEventPatternCommand({
      EventPattern: R3_PATTERN,
      Event: event,
    }),
  );
  return result.Result ?? false;
}

describe('R-3 AuditSinkRule event pattern — auditTrail flag (live API)', () => {
  // Positive proofs: auditTrail=true events MUST match
  it('POSITIVE: Document.Approved (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('Document.Approved', true));
    expect(result).toBe(true);
  });

  it('POSITIVE: CAPA.RootCauseRecorded (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('CAPA.RootCauseRecorded', true));
    expect(result).toBe(true);
  });

  it('POSITIVE: Audit.Scheduled (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('Audit.Scheduled', true));
    expect(result).toBe(true);
  });

  it('POSITIVE: Record.Registered (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('Record.Registered', true));
    expect(result).toBe(true);
  });

  it('POSITIVE: Change.Planned (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('Change.Planned', true));
    expect(result).toBe(true);
  });

  it('POSITIVE: AuditEvent.Appended (auditTrail: true) matches R-3', async () => {
    const result = await testPattern(makeEvent('AuditEvent.Appended', true));
    expect(result).toBe(true);
  });

  // Negative proofs: auditTrail=false events MUST NOT match
  it('NEGATIVE: Readiness.Scored (auditTrail: false) does NOT match R-3', async () => {
    const result = await testPattern(makeEvent('Readiness.Scored', false));
    expect(result).toBe(false);
  });

  it('NEGATIVE: Calibration.Due (auditTrail: false) does NOT match R-3', async () => {
    const result = await testPattern(makeEvent('Calibration.Due', false));
    expect(result).toBe(false);
  });

  it('NEGATIVE: Audit.ChecklistGenerated (auditTrail: false) does NOT match R-3', async () => {
    const result = await testPattern(makeEvent('Audit.ChecklistGenerated', false));
    expect(result).toBe(false);
  });
});
