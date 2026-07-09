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

/**
 * Validate a JSON response string against a declared schema.
 * Uses a lightweight structural check (type/required fields).
 * For production, this should use AJV or similar — currently checks
 * that the response is valid JSON and matches top-level required keys.
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

  // Step 2: check required properties if declared in schema
  const required = (schema.required as string[]) ?? [];
  const obj = parsed as Record<string, unknown>;
  for (const key of required) {
    if (!(key in obj)) {
      errors.push(`Missing required property: '${key}'`);
    }
  }

  // Step 3: check top-level property types if properties declared
  const properties = (schema.properties as Record<string, { type?: string }>) ?? {};
  for (const [key, propSchema] of Object.entries(properties)) {
    if (key in obj && propSchema.type) {
      const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];
      if (actualType !== propSchema.type && !(propSchema.type === 'integer' && typeof obj[key] === 'number')) {
        errors.push(`Property '${key}' expected type '${propSchema.type}', got '${actualType}'`);
      }
    }
  }

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
