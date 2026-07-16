import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIT_TRAIL_REGISTRY } from '../src/audit-trail-registry.js';

/**
 * Parity test: asserts AUDIT_TRAIL_REGISTRY keys match contracts/events.md
 * trail designation section exactly. Fails build on mismatch.
 */
describe('AUDIT_TRAIL_REGISTRY parity with contracts/events.md', () => {
  const eventsMarkdown = readFileSync(resolve(__dirname, '../../../contracts/events.md'), 'utf-8');

  it('every registry key appears in contracts/events.md trail designation tables', () => {
    const registryKeys = Object.keys(AUDIT_TRAIL_REGISTRY);
    const missingFromDoc: string[] = [];

    for (const key of registryKeys) {
      // Check the key appears in a trail designation table row
      if (!eventsMarkdown.includes(`\`${key}\``)) {
        missingFromDoc.push(key);
      }
    }

    expect(missingFromDoc).toEqual([]);
  });

  it('every trail designation row in contracts/events.md has a registry entry', () => {
    // Extract detailType values from trail designation table rows
    // Pattern: | `EventName` | true/false | ... |
    const trailDesignationPattern = /\| `([A-Za-z]+\.[A-Za-z]+)` \| (true|false) \|/g;
    const docEntries: { detailType: string; auditTrail: boolean }[] = [];
    let match;

    while ((match = trailDesignationPattern.exec(eventsMarkdown)) !== null) {
      docEntries.push({
        detailType: match[1],
        auditTrail: match[2] === 'true',
      });
    }

    // Every doc entry must exist in registry
    const missingFromRegistry: string[] = [];
    for (const entry of docEntries) {
      if (AUDIT_TRAIL_REGISTRY[entry.detailType] === undefined) {
        missingFromRegistry.push(entry.detailType);
      }
    }

    expect(missingFromRegistry).toEqual([]);
  });

  it('auditTrail values match between registry and contracts/events.md', () => {
    const trailDesignationPattern = /\| `([A-Za-z]+\.[A-Za-z]+)` \| (true|false) \|/g;
    const mismatches: string[] = [];
    let match;

    while ((match = trailDesignationPattern.exec(eventsMarkdown)) !== null) {
      const detailType = match[1];
      const docValue = match[2] === 'true';
      const registryValue = AUDIT_TRAIL_REGISTRY[detailType];

      if (registryValue !== undefined && registryValue !== docValue) {
        mismatches.push(`${detailType}: registry=${registryValue}, doc=${docValue}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('rejects unregistered detailType at publish time', async () => {
    // Import the actual publish function to verify the throw behavior
    // (mocked EventBridge — we only test the guard, not the API call)
    const { publish } = await import('../src/publisher.js');

    await expect(
      publish({
        busName: 'test-bus',
        source: 'test',
        detailType: 'Nonexistent.Event',
        event: {
          tenantId: 'test-tenant',
          timestamp: new Date().toISOString(),
          actor: 'test',
          module: 'M1',
          clauseRef: 'test',
          standard: 'ISO9001',
          payload: {},
        },
      }),
    ).rejects.toThrow('Unregistered detailType');
  });
});
