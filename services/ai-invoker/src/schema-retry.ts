/**
 * JSON schema validation + one-retry guard (SERVE-10).
 * Workhorse tier only. If the response fails schema validation, retry ONCE.
 * If the retry also fails, return SCHEMA_VALIDATION_ERROR.
 *
 * Design §1.2 step 6.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { InvokeError } from './types.js';

const logger = new Logger({ serviceName: 'ai-invoker-schema-retry' });

/** JSON-Schema-style type name for a parsed value */
function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Recursive structural validation. Covers exactly the keywords the in-house
 * output contracts use: type, required, properties, items, minItems,
 * minLength, additionalProperties:false. NOT full JSON Schema — AJV stays
 * deliberately out of the Lambda bundle; add keywords here WITH tests when
 * a contract needs them.
 */
function validateNode(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  if (schema.type) {
    const actual = typeOf(value);
    const expected = schema.type as string;
    if (actual !== expected && !(expected === 'integer' && actual === 'number')) {
      errors.push(`Property '${path || '(root)'}' expected type '${expected}', got '${actual}'`);
      return; // deeper checks are meaningless on the wrong type
    }
  }

  if (typeOf(value) === 'object') {
    const obj = value as Record<string, unknown>;
    const prefix = path ? `${path}.` : '';
    for (const key of (schema.required as string[]) ?? []) {
      if (!(key in obj)) errors.push(`Missing required property: '${prefix}${key}'`);
    }
    const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj) validateNode(obj[key], propSchema, `${prefix}${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in properties)) errors.push(`Unexpected property: '${prefix}${key}'`);
      }
    }
  } else if (typeOf(value) === 'array') {
    const arr = value as unknown[];
    if (typeof schema.minItems === 'number' && arr.length < schema.minItems) {
      errors.push(`Property '${path || '(root)'}' expected at least ${schema.minItems} items, got ${arr.length}`);
    }
    if (schema.items) {
      arr.forEach((item, i) =>
        validateNode(item, schema.items as Record<string, unknown>, `${path}[${i}]`, errors));
    }
  } else if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`Property '${path || '(root)'}' expected minLength ${schema.minLength}, got ${value.length}`);
    }
  }
}

/**
 * Validate a JSON response string against a declared schema.
 * Recursive structural check (see validateNode) — deepened for spec-40 Task 4:
 * the doc-composer contract is nested (factRefs per sentence), and the
 * previous top-level-only check silently passed malformed sentences through
 * to the deterministic checker.
 */
export function validateSchema(
  responseText: string,
  schema: Record<string, unknown>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Step 1: must be valid JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    errors.push('Response is not valid JSON');
    return { valid: false, errors };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    errors.push('Response is not a JSON object');
    return { valid: false, errors };
  }

  // Step 2: recursive structural validation
  validateNode(parsed, schema, '', errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Extract JSON from a response that may contain markdown fences or preamble text.
 */
export function extractJson(text: string): string {
  // Try to find JSON in markdown code block
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find raw JSON object/array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();

  // Return as-is (may fail JSON.parse — that's caught by validateSchema)
  return text.trim();
}

/**
 * Validate response and throw if invalid after schema-retry exhausted.
 * Returns the parsed JSON if valid.
 */
export function assertSchemaValid(
  responseText: string,
  schema: Record<string, unknown>,
  context: { seat: string; modelId: string; attempt: number },
): unknown {
  const extracted = extractJson(responseText);
  const result = validateSchema(extracted, schema);

  if (!result.valid) {
    logger.warn('Schema validation failed', {
      ...context,
      errors: result.errors,
    });
    throw new InvokeError(
      'SCHEMA_VALIDATION_ERROR',
      `Schema validation failed (attempt ${context.attempt}): ${result.errors.join('; ')}`,
    );
  }

  return JSON.parse(extracted);
}
