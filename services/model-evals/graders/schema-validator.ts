/**
 * Schema-validation grader — structured output compliance.
 * Checks that the model response is valid JSON and contains required fields.
 * FINDING-J: strips ANSWER: line prefix and ```json fences before parsing.
 */

import { parseAnswerLine } from './answer-parser.js';

/**
 * Score a response against an expected schema (required fields check).
 * Returns 1.0 if all required fields present and JSON-parseable, 0.0 otherwise.
 * Partial credit: (fields_present / total_required_fields).
 */
export function scoreSchemaValidation(
  response: string,
  expectedSchema: Record<string, unknown>,
): number {
  // Try ANSWER: line first, then fall back to full response
  const answerParsed = parseAnswerLine(response);
  const textToSearch = answerParsed.found ? answerParsed.answer : response;

  // Try to extract JSON from the text (code blocks or raw)
  const jsonStr = extractJson(textToSearch);
  if (!jsonStr) return 0;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return 0;
  }

  if (typeof parsed !== 'object' || parsed === null) return 0;

  // Check required fields from the JSON Schema's `required` array. The schema is a
  // real JSON Schema object ({type, required, properties}) — its ENVELOPE keys are
  // not field names. (Gate hotfix: Object.keys(expectedSchema) graded models on
  // whether they emitted fields literally named "required"/"properties".)
  const required = (expectedSchema as { required?: unknown }).required;
  const requiredFields = Array.isArray(required) ? (required as string[]) : [];
  if (requiredFields.length === 0) return 1.0; // No schema requirements = pass

  let fieldsPresent = 0;
  for (const field of requiredFields) {
    if (field in parsed) {
      fieldsPresent++;
    }
  }

  return fieldsPresent / requiredFields.length;
}

/**
 * Extract JSON content from a response that may contain markdown code fences.
 */
function extractJson(response: string): string | null {
  // Try direct parse first
  const trimmed = response.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  // Try extracting from markdown code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  return null;
}
