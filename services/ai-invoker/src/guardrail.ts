/**
 * Guardrail config builder (CDK-5B/D-5, spec-40 §4.4).
 * Attaches CfnGuardrail (PII anonymize/block + PROMPT_ATTACK) via Converse guardrailConfig.
 *
 * Two guardrail seats (BC-5, owner-approved 2026-07-14):
 * - agent guardrail (GUARDRAIL_*): anonymizes NAME/EMAIL/PHONE — every seat by default.
 * - docgen guardrail (DOCGEN_GUARDRAIL_*): NO anonymization (ACC-9 — the tenant's
 *   own names must survive into their Quality Manual); SSN/card BLOCK +
 *   PROMPT_ATTACK retained. ONLY the doc-composer seat routes here.
 */

import type { SeatId } from './types.js';

export interface GuardrailConfig {
  guardrailIdentifier: string;
  guardrailVersion: string;
}

/**
 * Build guardrailConfig for a seat from environment variables.
 * Returns undefined if the seat's guardrail is not configured (dev/test environments).
 */
export function buildGuardrailConfig(seat: SeatId): GuardrailConfig | undefined {
  const guardrailId =
    seat === 'doc-composer' ? process.env.DOCGEN_GUARDRAIL_ID : process.env.GUARDRAIL_ID;
  const guardrailVersion =
    (seat === 'doc-composer'
      ? process.env.DOCGEN_GUARDRAIL_VERSION
      : process.env.GUARDRAIL_VERSION) ?? 'DRAFT';

  if (!guardrailId) {
    return undefined;
  }

  return {
    guardrailIdentifier: guardrailId,
    guardrailVersion,
  };
}
