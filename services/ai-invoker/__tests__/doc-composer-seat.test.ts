/**
 * doc-composer seat pins (spec-40 Task 4, design §4.4).
 *
 * - Register: the seat resolves to Nova Pro, PROVISIONAL, doc-composer tier,
 *   caching supported (Nova).
 * - Weights: the seat's model has a MODELWEIGHT# seed row — shared with
 *   workhorse by modelId; if the model ever changes WITHOUT a matching seed
 *   entry, invoke() would throw at loadWeights, so this pin fails first.
 * - Output contract: schema-retry accepts the documented shape and rejects
 *   the malformed variants the deterministic checker must never see.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegister, resolveModel } from '../src/register-resolver.js';
import { assertSchemaValid } from '../src/schema-retry.js';
import { DOC_COMPOSER_OUTPUT_SCHEMA } from '../src/doc-composer-schema.js';
import { SEAT_DEFAULTS, InvokeError } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('doc-composer register entry', () => {
  it('resolves to Nova Pro, PROVISIONAL, tier doc-composer, caching on', () => {
    const entry = resolveModel('doc-composer', loadRegister());
    expect(entry.modelId).toBe('us.amazon.nova-pro-v1:0');
    expect(entry.status).toBe('PROVISIONAL');
    expect(entry.tier).toBe('doc-composer');
    expect(entry.cachingSupported).toBe(true);
  });

  it('seat defaults exist: low temperature, full-section token budget', () => {
    expect(SEAT_DEFAULTS['doc-composer']).toEqual({ temperature: 0.2, maxTokens: 4096 });
  });

  it("the seat's model has a MODELWEIGHT# seed row (metering cannot silently lack weights)", () => {
    const seed = JSON.parse(readFileSync(
      resolve(__dirname, '../data/model-weights-seed.json'), 'utf-8',
    )) as { models: Record<string, unknown> };
    const entry = resolveModel('doc-composer', loadRegister());
    expect(seed.models[entry.modelId], `no weight seed for ${entry.modelId}`).toBeDefined();
  });
});

describe('doc-composer output schema via schema-retry', () => {
  const ctx = { seat: 'doc-composer' as const, modelId: 'us.amazon.nova-pro-v1:0', attempt: 1 };

  it('accepts the documented shape', () => {
    const good = JSON.stringify({
      sentences: [
        { text: 'Acme Corp maintains its quality policy at both sites.', factRefs: ['F1', 'F3'] },
      ],
    });
    expect(() => assertSchemaValid(good, DOC_COMPOSER_OUTPUT_SCHEMA, ctx)).not.toThrow();
  });

  it.each([
    ['sentence missing factRefs', { sentences: [{ text: 'Unattributed claim.' }] }],
    ['empty factRefs array', { sentences: [{ text: 'Weakly attributed.', factRefs: [] }] }],
    ['empty sentences array', { sentences: [] }],
    ['missing sentences key', { paragraphs: [] }],
    ['extra property on sentence', { sentences: [{ text: 'x', factRefs: ['F1'], confidence: 0.9 }] }],
  ])('rejects %s with SCHEMA_VALIDATION_ERROR', (_label, payload) => {
    try {
      assertSchemaValid(JSON.stringify(payload), DOC_COMPOSER_OUTPUT_SCHEMA, ctx);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvokeError);
      expect((err as InvokeError).code).toBe('SCHEMA_VALIDATION_ERROR');
    }
  });
});
