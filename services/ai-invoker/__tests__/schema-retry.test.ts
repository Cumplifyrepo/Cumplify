/**
 * Unit tests for schema-retry module.
 * Verifies: valid passes; invalid detects errors; extractJson handles fences.
 */

import { describe, it, expect } from 'vitest';
import { validateSchema, extractJson, assertSchemaValid } from '../src/schema-retry.js';
import { InvokeError } from '../src/types.js';

describe('validateSchema', () => {
  const schema = {
    type: 'object',
    required: ['action', 'confidence'],
    properties: {
      action: { type: 'string' },
      confidence: { type: 'number' },
      reasoning: { type: 'string' },
    },
  };

  it('passes valid JSON matching schema', () => {
    const json = JSON.stringify({ action: 'approve', confidence: 0.95, reasoning: 'all good' });
    const result = validateSchema(json, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails on invalid JSON', () => {
    const result = validateSchema('not json at all', schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not valid JSON');
  });

  it('fails on missing required property', () => {
    const json = JSON.stringify({ action: 'approve' }); // missing confidence
    const result = validateSchema(json, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required property: 'confidence'");
  });

  it('fails on wrong property type', () => {
    const json = JSON.stringify({ action: 123, confidence: 0.9 }); // action should be string
    const result = validateSchema(json, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("expected type 'string'");
  });

  it('passes when optional properties are absent', () => {
    const json = JSON.stringify({ action: 'deny', confidence: 0.3 });
    const result = validateSchema(json, schema);
    expect(result.valid).toBe(true);
  });
});

describe('extractJson', () => {
  it('extracts from markdown code fence', () => {
    const text = 'Here is the result:\n```json\n{"action":"approve"}\n```\nDone.';
    expect(extractJson(text)).toBe('{"action":"approve"}');
  });

  it('extracts raw JSON object from prose', () => {
    const text = 'The output is {"action":"deny","confidence":0.1} as requested.';
    expect(extractJson(text)).toBe('{"action":"deny","confidence":0.1}');
  });

  it('returns text as-is when no JSON found', () => {
    const text = 'no json here';
    expect(extractJson(text)).toBe('no json here');
  });

  it('extracts JSON array', () => {
    const text = 'Result: [{"a":1},{"a":2}]';
    expect(extractJson(text)).toBe('[{"a":1},{"a":2}]');
  });
});

describe('assertSchemaValid', () => {
  const schema = { required: ['status'], properties: { status: { type: 'string' } } };

  it('returns parsed value on valid input', () => {
    const result = assertSchemaValid('{"status":"ok"}', schema, { seat: 'workhorse', modelId: 'test', attempt: 1 });
    expect(result).toEqual({ status: 'ok' });
  });

  it('throws SCHEMA_VALIDATION_ERROR on invalid input', () => {
    expect(() =>
      assertSchemaValid('{"wrong":"field"}', schema, { seat: 'workhorse', modelId: 'test', attempt: 1 }),
    ).toThrow(InvokeError);

    try {
      assertSchemaValid('{"wrong":"field"}', schema, { seat: 'workhorse', modelId: 'test', attempt: 1 });
    } catch (err) {
      expect((err as InvokeError).code).toBe('SCHEMA_VALIDATION_ERROR');
    }
  });
});
