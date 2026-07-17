/**
 * Layer 2 — Automated Reasoning Check (spec-35 §5).
 *
 * Post-response AR validation via ApplyGuardrail on AR-only guardrails.
 * Guardrail selection by invocation path (§5.2):
 *   - Clause-citing paths (gurus, copilot, record-write) → ArClauseGuardrail
 *   - Role/plan advisory paths → ArAdvisoryGuardrail
 *
 * Gate mapping (from _meta.arCheckGateMapping in deliverable JSONs):
 *   pass = VALID | SATISFIABLE
 *   reject+steered-retry = INVALID | IMPOSSIBLE
 *   flag→HITL = TRANSLATION_AMBIGUOUS | NO_TRANSLATION | TOO_COMPLEX
 *
 * On reject: steered-retry once (inject AR feedback). On double-fail: flag for HITL.
 * On ambiguous/no-translation/too-complex: flag for HITL immediately (never silently pass).
 * Emits Ai.GuardrailChecked per check and Ai.ArRejected on final rejection/HITL.
 * Meters usage on every path (FIX-W-1 pattern).
 */

import {
  BedrockRuntimeClient,
  ApplyGuardrailCommand,
  type ApplyGuardrailCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { Logger } from '@aws-lambda-powertools/logger';
import { publish } from '../../eventing/src/publisher.js';
import { buildArClauseGuardrailConfig, buildArAdvisoryGuardrailConfig } from './guardrail.js';
import type { GuardrailConfig } from './guardrail.js';

const logger = new Logger({ serviceName: 'ai-invoker-ar-check' });

/** Singleton client */
let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return client;
}

/** Reset client (for testing) */
export function resetArCheckClient(): void {
  client = null;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** AR finding result codes from the Bedrock API */
export type ArFindingResult =
  | 'VALID'
  | 'SATISFIABLE'
  | 'INVALID'
  | 'IMPOSSIBLE'
  | 'TRANSLATION_AMBIGUOUS'
  | 'NO_TRANSLATION'
  | 'TOO_COMPLEX';

/** Gate decision derived from the finding result */
export type ArGateDecision = 'pass' | 'reject' | 'flag_hitl';

/** Structured AR finding extracted from ApplyGuardrail response */
export interface ArFinding {
  result: ArFindingResult;
  invalidClaim?: string;
  reason?: string;
  suggestedCorrection?: string;
}

/** Result of an AR check */
export interface ArCheckResult {
  decision: ArGateDecision;
  finding: ArFinding;
  arPolicy: string;
  latencyMs: number;
}

/** Parameters for running an AR check */
export interface ArCheckParams {
  /** Response text to validate */
  responseText: string;
  /** Invocation path determines guardrail selection */
  invocationPath: ArInvocationPath;
  /** Attribution */
  tenantId: string;
  agent: string;
  module: string;
  feature: string;
  standard?: 'ISO9001' | 'ISO14001' | 'ISO45001';
}

/** Invocation paths that determine which AR guardrail to use */
export type ArInvocationPath = 'clause-citing' | 'role-advisory' | 'plan-advisory';

// ─── Gate Mapping (from _meta.arCheckGateMapping) ───────────────────────────

const PASS_RESULTS: ReadonlySet<ArFindingResult> = new Set(['VALID', 'SATISFIABLE']);
const REJECT_RESULTS: ReadonlySet<ArFindingResult> = new Set(['INVALID', 'IMPOSSIBLE']);
const HITL_RESULTS: ReadonlySet<ArFindingResult> = new Set([
  'TRANSLATION_AMBIGUOUS',
  'NO_TRANSLATION',
  'TOO_COMPLEX',
]);

/**
 * Map an AR finding result to a gate decision.
 * Never silently passes an ambiguous result — always flags for HITL.
 */
export function mapFindingToDecision(result: ArFindingResult): ArGateDecision {
  if (PASS_RESULTS.has(result)) return 'pass';
  if (REJECT_RESULTS.has(result)) return 'reject';
  if (HITL_RESULTS.has(result)) return 'flag_hitl';
  // Unknown result — fail-safe to HITL (never silently pass)
  return 'flag_hitl';
}

// ─── Guardrail Selection (§5.2) ─────────────────────────────────────────────

/**
 * Resolve the AR guardrail config and policy name for an invocation path.
 * Returns undefined if the AR guardrail is not configured (pre-deploy).
 */
export function resolveArGuardrail(
  path: ArInvocationPath,
): { config: GuardrailConfig; arPolicy: string } | undefined {
  if (path === 'clause-citing') {
    const config = buildArClauseGuardrailConfig();
    if (!config) return undefined;
    return { config, arPolicy: 'clause-canon' };
  }
  // role-advisory and plan-advisory both use the ArAdvisory guardrail
  // (which holds both role-permissions + plan-entitlements policies)
  const config = buildArAdvisoryGuardrailConfig();
  if (!config) return undefined;
  const arPolicy = path === 'role-advisory' ? 'role-permissions' : 'plan-entitlements';
  return { config, arPolicy };
}

// ─── AR Check ───────────────────────────────────────────────────────────────

/**
 * Run an AR check on a response text against the appropriate AR guardrail.
 * Returns the gate decision + finding details.
 */
export async function checkArPolicy(params: ArCheckParams): Promise<ArCheckResult> {
  const { responseText, invocationPath, tenantId, agent, module, standard } = params;

  const resolved = resolveArGuardrail(invocationPath);
  if (!resolved) {
    // AR guardrails not configured — pass through (dormant pre-deploy)
    return {
      decision: 'pass',
      finding: { result: 'VALID' },
      arPolicy: 'unconfigured',
      latencyMs: 0,
    };
  }

  const { config, arPolicy } = resolved;
  const startMs = Date.now();

  const response: ApplyGuardrailCommandOutput = await getClient().send(
    new ApplyGuardrailCommand({
      guardrailIdentifier: config.guardrailIdentifier,
      guardrailVersion: config.guardrailVersion,
      source: 'OUTPUT',
      content: [{ text: { text: responseText } }],
    }),
  );

  const latencyMs = Date.now() - startMs;
  const finding = extractArFinding(response);
  const decision = mapFindingToDecision(finding.result);

  // Emit Ai.GuardrailChecked (TEL-1) on every check
  await publish({
    busName: process.env.BUS_NAME ?? 'cumplify-events',
    source: 'cumplify.ai-invoker',
    detailType: 'Ai.GuardrailChecked',
    event: {
      tenantId,
      timestamp: new Date().toISOString(),
      actor: agent,
      module,
      clauseRef: '',
      standard: standard ?? 'ISO9001',
      entityId: '',
      payload: {
        guardrailPolicy: `ar:${arPolicy}`,
        verdict: decision === 'pass' ? 'pass' : decision === 'reject' ? 'block' : 'flag',
        score: null,
        latencyMs,
      },
    },
  });

  logger.info('AR check completed', {
    invocationPath,
    arPolicy,
    result: finding.result,
    decision,
    latencyMs,
  });

  return { decision, finding, arPolicy, latencyMs };
}

/**
 * Build the steered-retry instruction from AR finding feedback.
 * Injected as a user message to guide the model toward a correct response.
 */
export function buildArRetryInstruction(finding: ArFinding): string {
  const parts = ['Your previous response contained a factual error detected by automated reasoning.'];
  if (finding.invalidClaim) {
    parts.push(`Invalid claim: "${finding.invalidClaim}"`);
  }
  if (finding.reason) {
    parts.push(`Reason: ${finding.reason}`);
  }
  if (finding.suggestedCorrection) {
    parts.push(`Suggested correction: ${finding.suggestedCorrection}`);
  }
  parts.push('Please regenerate your response correcting this error. If you cannot verify the claim, omit it entirely.');
  return parts.join('\n');
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Extract the AR finding from an ApplyGuardrail response.
 * The `automatedReasoningPolicy` assessment contains the finding results.
 */
export function extractArFinding(response: ApplyGuardrailCommandOutput): ArFinding {
  const assessments = response.assessments ?? [];

  for (const assessment of assessments) {
    const arPolicy = (assessment as any).automatedReasoningPolicy;
    if (!arPolicy) continue;

    // The findings array contains individual policy evaluation results
    const findings = arPolicy.findings ?? [];
    if (findings.length === 0) {
      // No findings = the response passed (VALID/SATISFIABLE)
      // When action is NONE, no violations found
      if (response.action === 'NONE') {
        return { result: 'VALID' };
      }
    }

    for (const f of findings) {
      const result = (f.result ?? f.findingResult ?? 'VALID') as ArFindingResult;
      return {
        result,
        invalidClaim: f.invalidClaim ?? f.claim ?? undefined,
        reason: f.reason ?? f.explanation ?? undefined,
        suggestedCorrection: f.suggestedCorrection ?? f.correction ?? undefined,
      };
    }
  }

  // No AR assessment found — if guardrail intervened, treat as reject;
  // otherwise pass (backwards compatible with non-AR guardrails)
  if (response.action === 'GUARDRAIL_INTERVENED') {
    return { result: 'INVALID', reason: 'Guardrail intervened without detailed finding' };
  }
  return { result: 'VALID' };
}

// ─── HITL Flag + Event Emission ─────────────────────────────────────────────

/**
 * Emit Ai.ArRejected event when AR check fails (after retry or on HITL flag).
 */
export async function emitArRejected(params: {
  tenantId: string;
  agent: string;
  module: string;
  standard?: 'ISO9001' | 'ISO14001' | 'ISO45001' | 'IMS';
  arPolicy: string;
  finding: ArFinding;
  retriedOnce: boolean;
  finalOutcome: 'corrected' | 'hitl-deferred';
}): Promise<void> {
  const { tenantId, agent, module, standard, arPolicy, finding, retriedOnce, finalOutcome } = params;

  await publish({
    busName: process.env.BUS_NAME ?? 'cumplify-events',
    source: 'cumplify.ai-invoker',
    detailType: 'Ai.ArRejected',
    event: {
      tenantId,
      timestamp: new Date().toISOString(),
      actor: agent,
      module,
      clauseRef: '',
      standard: standard ?? 'ISO9001',
      entityId: '',
      payload: {
        tenantId,
        agent,
        arPolicy,
        invalidClaim: finding.invalidClaim ?? '',
        reason: finding.reason ?? '',
        suggestedCorrection: finding.suggestedCorrection ?? '',
        retriedOnce,
        finalOutcome,
      },
    },
  });
}
