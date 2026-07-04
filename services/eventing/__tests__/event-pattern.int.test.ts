/**
 * Integration test: R-3 (AuditSinkRule) event pattern verification (FIX-7).
 *
 * Calls the live EventBridge TestEventPattern API to prove the R-3 mixed
 * pattern (suffix operators + constant string) works as expected.
 *
 * THIS FILE IS NAMED *.int.test.ts AND IS EXCLUDED FROM THE DEFAULT VITEST
 * RUN (vitest include only matches *.test.ts and *.property.test.ts).
 * It must be run explicitly with dev credentials:
 *   npx vitest run services/eventing/__tests__/event-pattern.int.test.ts
 *
 * If the mixed array is rejected by the API, the fallback pattern replaces
 * "AuditEvent.Appended" with {"suffix": ".Appended"} and re-validates.
 */

import { describe, it, expect } from 'vitest';
import {
  EventBridgeClient,
  TestEventPatternCommand,
} from '@aws-sdk/client-eventbridge';

const client = new EventBridgeClient({ region: 'us-east-1' });

// The R-3 pattern as defined in design §4 routing table
const R3_PATTERN = JSON.stringify({
  'detail-type': [
    { suffix: '.Approved' },
    { suffix: '.Closed' },
    { suffix: '.Raised' },
    { suffix: '.Evaluated' },
    'AuditEvent.Appended',
  ],
});

// Fallback if mixed array is rejected (FIX-7 design §4.3)
const R3_FALLBACK_PATTERN = JSON.stringify({
  'detail-type': [
    { suffix: '.Approved' },
    { suffix: '.Closed' },
    { suffix: '.Raised' },
    { suffix: '.Evaluated' },
    { suffix: '.Appended' },
  ],
});

function makeEvent(detailType: string): string {
  return JSON.stringify({
    version: '0',
    id: '12345678-1234-1234-1234-123456789012',
    source: 'cumplify.m1.document-studio',
    account: '697114252993',
    time: '2026-07-04T12:00:00Z',
    region: 'us-east-1',
    resources: [],
    'detail-type': detailType,
    detail: { tenantId: 'test-tenant', eventId: 'test-event' },
  });
}

async function testPattern(pattern: string, event: string): Promise<boolean> {
  const result = await client.send(
    new TestEventPatternCommand({
      EventPattern: pattern,
      Event: event,
    }),
  );
  return result.Result ?? false;
}

describe('R-3 AuditSinkRule event pattern (live API)', () => {
  let activePattern: string;
  let usingFallback = false;

  it('should validate the primary pattern (or activate fallback)', async () => {
    try {
      const result = await testPattern(R3_PATTERN, makeEvent('Document.Approved'));
      if (result) {
        activePattern = R3_PATTERN;
      } else {
        // Pattern accepted but didn't match — unexpected, fail
        throw new Error('Primary pattern accepted but did not match Document.Approved');
      }
    } catch (err: unknown) {
      const errMsg = (err as Error).message || '';
      // If the API rejects the mixed array, use fallback
      if (errMsg.includes('InvalidEventPatternException') || errMsg.includes('Invalid')) {
        console.warn(
          'R-3 primary pattern REJECTED by TestEventPattern API. Activating fallback ' +
            '(suffix .Appended instead of constant). Update design.md §4 and contracts/events.md.',
        );
        usingFallback = true;
        activePattern = R3_FALLBACK_PATTERN;
        // Validate fallback works
        const fallbackResult = await testPattern(R3_FALLBACK_PATTERN, makeEvent('Document.Approved'));
        expect(fallbackResult).toBe(true);
      } else {
        throw err;
      }
    }
    expect(activePattern).toBeDefined();
  });

  it('should match Document.Approved (suffix .Approved)', async () => {
    const result = await testPattern(activePattern!, makeEvent('Document.Approved'));
    expect(result).toBe(true);
  });

  it('should match CAPA.Closed (suffix .Closed)', async () => {
    const result = await testPattern(activePattern!, makeEvent('CAPA.Closed'));
    expect(result).toBe(true);
  });

  it('should match NC.Raised (suffix .Raised)', async () => {
    const result = await testPattern(activePattern!, makeEvent('NC.Raised'));
    expect(result).toBe(true);
  });

  it('should match Compliance.Evaluated (suffix .Evaluated)', async () => {
    const result = await testPattern(activePattern!, makeEvent('Compliance.Evaluated'));
    expect(result).toBe(true);
  });

  it('should match AuditEvent.Appended', async () => {
    const result = await testPattern(activePattern!, makeEvent('AuditEvent.Appended'));
    expect(result).toBe(true);
  });

  it('should NOT match Hazard.Identified', async () => {
    const result = await testPattern(activePattern!, makeEvent('Hazard.Identified'));
    expect(result).toBe(false);
  });

  it('should NOT match CAPA.Opened', async () => {
    const result = await testPattern(activePattern!, makeEvent('CAPA.Opened'));
    expect(result).toBe(false);
  });

  it('reports fallback status', () => {
    if (usingFallback) {
      console.warn(
        'FALLBACK ACTIVE: R-3 pattern uses {"suffix": ".Appended"} instead of ' +
          '"AuditEvent.Appended". Broadened match scope: any future *.Appended event ' +
          'will also route to audit-sink. Note in contracts/events.md required.',
      );
    } else {
      console.log('PRIMARY PATTERN CONFIRMED: mixed array (suffix + constant) accepted by API.');
    }
    // Always passes — informational
    expect(true).toBe(true);
  });
});
