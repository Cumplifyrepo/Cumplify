/**
 * Guardrail config builder (CDK-5B/D-5).
 * Attaches CfnGuardrail (PII anonymize/block + PROMPT_ATTACK) via Converse guardrailConfig.
 *
 * Design §8.2.
 */

export interface GuardrailConfig {
  guardrailIdentifier: string;
  guardrailVersion: string;
}

/**
 * Build guardrailConfig from environment variables.
 * Returns undefined if guardrail is not configured (dev/test environments).
 */
export function buildGuardrailConfig(): GuardrailConfig | undefined {
  const guardrailId = process.env.GUARDRAIL_ID;
  const guardrailVersion = process.env.GUARDRAIL_VERSION ?? 'DRAFT';

  if (!guardrailId) {
    return undefined;
  }

  return {
    guardrailIdentifier: guardrailId,
    guardrailVersion,
  };
}
