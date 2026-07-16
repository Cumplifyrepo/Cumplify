/**
 * AI Invoker — Lambda entry point + public invoke() API.
 * The ONE DOOR through which every Bedrock model call passes (steering 12).
 *
 * Design §2.2 (F-1): Lambda entry dispatches on op discriminator:
 *   {op:'embed'} → embed.ts; absent op = invoke path (back-compat).
 * Design §1.2: invoke() orchestrates Register resolution, credit pre-check,
 * Converse, schema-retry (Workhorse), metering, and telemetry.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { resolveModel } from './register-resolver.js';
import { converse } from './converse.js';
import { computeCredits, loadWeights, incrementMeter, emitCreditsTelemetry } from './metering.js';
import { checkCreditBalance } from './credit-precheck.js';
import { assertSchemaValid } from './schema-retry.js';
import { buildGuardrailConfig } from './guardrail.js';
import { embed } from './embed.js';
import { InvokeError, SEAT_DEFAULTS } from './types.js';
import type { InvokeRequest, InvokeResponse, TokenUsage, EmbedOp, EmbedResult } from './types.js';

const logger = new Logger({ serviceName: 'ai-invoker' });

export type { InvokeRequest, InvokeResponse } from './types.js';
export type { EmbedRequest, EmbedResult, EmbedOp } from './types.js';
export type { GuardrailEvidenceData, GuardrailCitation } from './types.js';
export { InvokeError } from './types.js';
export type { SeatId, CompiledRegister, ModelWeight } from './types.js';
export { DOC_COMPOSER_OUTPUT_SCHEMA } from './doc-composer-schema.js';
export type { DocComposerOutput } from './doc-composer-schema.js';

/**
 * Lambda entry point — dispatches on op discriminator (spec-35 §2.2, F-1).
 * - {op:'embed', ...} → embed path (EMB-1..5)
 * - absent op / {op:'invoke', ...} → existing invoke path (back-compat)
 */
export async function handler(event: InvokeRequest | EmbedOp): Promise<InvokeResponse | EmbedResult> {
  if ('op' in event && event.op === 'embed') {
    return embed(event);
  }
  return invoke(event as InvokeRequest);
}

/**
 * Invoke a model through the one-door serving path.
 * Steps 1-8 per design §1.2.
 */
export async function invoke(request: InvokeRequest): Promise<InvokeResponse> {
  const { seat, tenantId, agent, module, feature } = request;

  // Step 1: Register resolution (SERVE-2, SERVE-5, SERVE-6)
  const seatEntry = resolveModel(seat);
  const { modelId, tier, cachingSupported } = seatEntry;

  logger.info('Invoking model', { seat, modelId, tenantId, agent });

  // Step 2: Credit pre-check (SERVE-9)
  await checkCreditBalance(tenantId, request.creditExempt ?? false);

  // Load model weights for metering
  const weights = await loadWeights(modelId);

  // Resolve defaults
  const defaults = SEAT_DEFAULTS[tier];
  const temperature = request.temperature ?? defaults.temperature;
  const maxTokens = request.maxTokens ?? defaults.maxTokens;

  // Step 3+4: Build params and call Converse (with optional schema-retry)
  // Seat-routed (spec-35 §1.2): doc-composer→DocGen, record-write→RecordWrite, else→Agent
  const guardrailConfig = buildGuardrailConfig(seat, feature);
  const converseParams = {
    modelId,
    messages: request.messages,
    system: request.system,
    tools: request.tools,
    temperature,
    maxTokens,
    requestMetadata: { tenantId, agent, module, feature },
    guardrailConfig,
    cachingEnabled: cachingSupported,
  };

  let result = await converse(converseParams);
  let usage = result.usage;

  // Step 6: Schema-validate + one-retry (SERVE-10 + COND-3: Workhorse AND Editor-AI)
  // Gate on outputSchema presence (tier-agnostic) — any seat declaring a schema gets the guard.
  if (request.outputSchema) {
    try {
      assertSchemaValid(result.text, request.outputSchema, {
        seat,
        modelId,
        attempt: 1,
      });
    } catch (err) {
      if (err instanceof InvokeError && err.code === 'SCHEMA_VALIDATION_ERROR') {
        // One retry — append corrective turn (nit: helps model self-correct)
        logger.info('Schema validation failed, retrying once', { seat, modelId });
        const retryMessages = [
          ...request.messages,
          { role: 'assistant' as const, content: [{ text: result.text }] },
          {
            role: 'user' as const,
            content: [
              {
                text: 'Your previous output failed JSON schema validation. Please return valid JSON matching the required schema.',
              },
            ],
          },
        ];
        const retryParams = { ...converseParams, messages: retryMessages };
        result = await converse(retryParams);
        usage = addUsage(usage, result.usage);

        try {
          assertSchemaValid(result.text, request.outputSchema, {
            seat,
            modelId,
            attempt: 2,
          });
        } catch (retryErr) {
          // F-1 FIX: meter consumed usage BEFORE propagating the error
          const credits = computeCredits(usage, weights);
          await incrementMeter(tenantId, credits);
          await emitCreditsTelemetry({
            tenantId,
            agent,
            module,
            feature,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cacheReadTokens: usage.cacheReadInputTokens,
            creditsConsumed: credits,
            modelId,
            seat,
          });
          throw retryErr;
        }
      } else {
        throw err;
      }
    }
  }

  // Step 7: Meter tokens → credits (SERVE-3)
  const credits = computeCredits(usage, weights);
  await incrementMeter(tenantId, credits);

  // Emit telemetry (non-blocking)
  await emitCreditsTelemetry({
    tenantId,
    agent,
    module,
    feature,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadInputTokens,
    creditsConsumed: credits,
    modelId,
    seat,
  });

  logger.info('Invocation complete', {
    seat,
    modelId,
    tenantId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    credits: credits.toFixed(4),
  });

  // Step 8: Return response
  return {
    text: result.text,
    toolUseBlocks: result.toolUseBlocks,
    stopReason: result.stopReason,
    usage,
    credits,
    modelId,
    seat,
  };
}

/** Accumulate token usage across retries */
function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheWriteInputTokens: a.cacheWriteInputTokens + b.cacheWriteInputTokens,
  };
}
