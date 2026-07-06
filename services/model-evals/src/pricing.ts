/**
 * Pricing module — fetches model pricing from AWS Pricing API with
 * snapshot fallback ONLY for models confirmed absent from the API (sonnet-4-6).
 *
 * C-3: Prices are NEVER hardcoded inline. They come from the live Pricing API
 * or, for explicitly-absent models, from price-snapshot.json with provenance.
 *
 * TRUTH INCIDENT #4 CORRECTION: No bare catch blocks. API miss for a model
 * that SHOULD be in the API = HARD FAILURE (not silent fallback).
 */

import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PriceEntry, PriceSnapshot } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = resolve(__dirname, '../data/price-snapshot.json');

/**
 * Model ID → Pricing API display name map.
 * Architect-verified against live API (2026-07-06, task-3-4-price-verification.log).
 * The Pricing API 'model' attribute holds display names, not model IDs.
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'us.amazon.nova-micro-v1:0': 'Nova Micro',
  'us.amazon.nova-lite-v1:0': 'Nova Lite',
  'us.amazon.nova-pro-v1:0': 'Nova Pro',
  'us.amazon.nova-2-lite-v1:0': 'Nova 2.0 Lite',
  'qwen.qwen3-next-80b-a3b': 'Qwen3 Next 80B A3B',
  'qwen.qwen3-32b-v1:0': 'Qwen3 32B',
  'zai.glm-5': 'GLM 5',
  'zai.glm-4.7': 'GLM 4.7',
  'zai.glm-4.7-flash': 'GLM 4.7 Flash',
  'deepseek.v3.2': 'DeepSeek v3.2',
  'minimax.minimax-m2.5': 'MiniMax M2.5',
  'moonshotai.kimi-k2.5': 'Kimi K2.5',
  'moonshot.kimi-k2-thinking': 'Kimi K2 Thinking',
};

/**
 * Models known to be ABSENT from the Pricing API.
 * Only these may fall back to the snapshot. All others MUST resolve via API.
 */
const SNAPSHOT_ONLY_MODELS = new Set([
  'us.anthropic.claude-sonnet-4-6',
]);

export interface PricingResult {
  prices: Record<string, PriceEntry>;
  sources: Record<string, 'live-api' | 'snapshot-priced'>;
}

/**
 * Fetch pricing for a list of model IDs.
 * - Models in SNAPSHOT_ONLY_MODELS → snapshot (with staleness check).
 * - All others → Pricing API (display-name lookup). API miss = HARD FAILURE.
 *
 * ENVIRONMENT NOTE: If no AWS credentials are available, the Pricing API call
 * will fail with a credential error. This is expected in environments without
 * AWS access — the task requires architect execution with live credentials.
 */
export async function fetchPricing(modelIds: string[]): Promise<PricingResult> {
  const prices: Record<string, PriceEntry> = {};
  const sources: Record<string, 'live-api' | 'snapshot-priced'> = {};

  // Partition: snapshot-only vs API-resolvable
  const snapshotModels = modelIds.filter((id) => SNAPSHOT_ONLY_MODELS.has(id));
  const apiModels = modelIds.filter((id) => !SNAPSHOT_ONLY_MODELS.has(id));

  // 1. Resolve snapshot-only models
  if (snapshotModels.length > 0) {
    const snapshot = loadSnapshot();
    checkStaleness(snapshot);
    for (const modelId of snapshotModels) {
      const entry = snapshot.models[modelId];
      if (!entry) {
        throw new Error(
          `Model ${modelId} is designated snapshot-only but not found in price-snapshot.json`,
        );
      }
      prices[modelId] = entry;
      sources[modelId] = 'snapshot-priced';
    }
  }

  // 2. Resolve API models — each MUST succeed or HARD FAIL
  if (apiModels.length > 0) {
    const apiPrices = await fetchFromPricingApi(apiModels);
    for (const modelId of apiModels) {
      if (!apiPrices[modelId]) {
        throw new PricingApiMissError(
          `HARD FAILURE: Model '${modelId}' (display name: '${MODEL_DISPLAY_NAMES[modelId] ?? 'UNKNOWN'}') ` +
            `not found in Pricing API. This model should be resolvable via the API. ` +
            `Possible causes: (1) no AWS credentials in this environment (requires architect execution), ` +
            `(2) display-name mapping is incorrect, (3) model genuinely absent from API (add to SNAPSHOT_ONLY_MODELS if confirmed).`,
        );
      }
      prices[modelId] = apiPrices[modelId];
      sources[modelId] = 'live-api';
    }
  }

  return { prices, sources };
}

/**
 * Load and validate the price snapshot file.
 */
export function loadSnapshot(path?: string): PriceSnapshot {
  const filePath = path ?? SNAPSHOT_PATH;
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as PriceSnapshot;
}

/**
 * Check if the snapshot is stale (older than stalenessLimitDays from today).
 * Throws with a clear error if stale.
 */
export function checkStaleness(snapshot: PriceSnapshot): void {
  const capturedDate = new Date(snapshot.capturedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - capturedDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > snapshot.stalenessLimitDays) {
    throw new StalePriceSnapshotError(
      `Price snapshot is stale: captured ${snapshot.capturedAt} (${diffDays} days ago), ` +
        `limit ${snapshot.stalenessLimitDays} days. Update price-snapshot.json before running.`,
    );
  }
}

export class StalePriceSnapshotError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'StalePriceSnapshotError';
  }
}

export class PricingApiMissError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PricingApiMissError';
  }
}

/**
 * Fetch pricing from AWS Pricing API using display-name lookup.
 * Filters: service=AmazonBedrock, regionCode=us-east-1, OnDemand terms,
 * Input/Output token dimensions (excludes batch/cache usagetypes).
 */
async function fetchFromPricingApi(modelIds: string[]): Promise<Record<string, PriceEntry>> {
  const client = new PricingClient({ region: 'us-east-1' });
  const result: Record<string, PriceEntry> = {};

  for (const modelId of modelIds) {
    const displayName = MODEL_DISPLAY_NAMES[modelId];
    if (!displayName) {
      throw new Error(
        `No Pricing API display-name mapping for model '${modelId}'. ` +
          `Add it to MODEL_DISPLAY_NAMES in pricing.ts (architect-verified value required).`,
      );
    }

    // Query Pricing API by display name
    const resp = await client.send(
      new GetProductsCommand({
        ServiceCode: 'AmazonBedrock',
        Filters: [
          { Type: 'TERM_MATCH', Field: 'model', Value: displayName },
          { Type: 'TERM_MATCH', Field: 'regionCode', Value: 'us-east-1' },
        ],
        MaxResults: 25,
      }),
    );

    if (!resp.PriceList || resp.PriceList.length === 0) {
      // No results — this will trigger the HARD FAILURE in the caller
      continue;
    }

    const entry = parsePricingApiResponse(resp.PriceList);
    if (entry) {
      result[modelId] = entry;
    }
  }

  return result;
}

/**
 * Parse Pricing API response: extract OnDemand Input/Output token prices.
 * Exported for unit testing against architect-supplied fixtures.
 *
 * UNIT NORMALIZATION (FINDING-D bug #1): unit is "1K tokens" — pricePerUnit is
 * per 1,000 tokens. Per-M = pricePerUnit × 1,000.
 *
 * DIMENSION SELECTION (FINDING-D bug #2): inferenceType must EXACTLY match
 * "Input tokens" or "Output tokens" (case-sensitive). Exclude usagetypes
 * containing: batch, flex, priority, cache, custom-model.
 *
 * If multiple surviving dims disagree on price → hard-fail (ambiguity).
 * If they agree (duplicates) → take the value.
 */
export function parsePricingApiResponse(priceList: string[]): PriceEntry | null {
  const SUPPORTED_UNITS = new Set(['1K tokens']);
  const EXCLUDE_USAGETYPE_PATTERNS = ['batch', 'flex', 'priority', 'cache', 'custom-model'];

  const inputPrices: number[] = [];
  const outputPrices: number[] = [];

  for (const item of priceList) {
    const parsed = JSON.parse(item);
    const attributes = parsed.product?.attributes ?? {};
    const inferenceType: string = attributes.inferenceType ?? '';
    const usagetype: string = (attributes.usagetype ?? '').toLowerCase();

    // Exact inferenceType match (case-sensitive)
    const isInput = inferenceType === 'Input tokens';
    const isOutput = inferenceType === 'Output tokens';
    if (!isInput && !isOutput) continue;

    // Exclude usagetypes containing excluded patterns
    if (EXCLUDE_USAGETYPE_PATTERNS.some((p) => usagetype.includes(p))) continue;

    const terms = parsed.terms?.OnDemand;
    if (!terms) continue;

    for (const term of Object.values(terms) as any[]) {
      for (const dimension of Object.values(term.priceDimensions ?? {}) as any[]) {
        const unit: string = dimension.unit ?? '';
        const pricePerUnit = parseFloat(dimension.pricePerUnit?.USD ?? '0');
        if (pricePerUnit === 0) continue;

        // Unit validation — HARD FAIL on unsupported units
        if (!SUPPORTED_UNITS.has(unit)) {
          throw new Error(
            `Unsupported pricing unit '${unit}' for dimension. ` +
              `Only supported: ${[...SUPPORTED_UNITS].join(', ')}. ` +
              `Add support for this unit or investigate the API response.`,
          );
        }

        // Normalize: "1K tokens" → per-M = pricePerUnit × 1,000
        const perMToken = pricePerUnit * 1_000;

        if (isInput) inputPrices.push(perMToken);
        if (isOutput) outputPrices.push(perMToken);
      }
    }
  }

  // Validate: no ambiguity (all surviving values must agree)
  const uniqueInputs = [...new Set(inputPrices.map((p) => p.toFixed(10)))];
  const uniqueOutputs = [...new Set(outputPrices.map((p) => p.toFixed(10)))];

  if (uniqueInputs.length > 1) {
    throw new Error(
      `Ambiguous input pricing: found ${uniqueInputs.length} different values ` +
        `(${uniqueInputs.join(', ')}). Cannot determine correct price.`,
    );
  }
  if (uniqueOutputs.length > 1) {
    throw new Error(
      `Ambiguous output pricing: found ${uniqueOutputs.length} different values ` +
        `(${uniqueOutputs.join(', ')}). Cannot determine correct price.`,
    );
  }

  const inputPrice = inputPrices[0] ?? 0;
  const outputPrice = outputPrices[0] ?? 0;

  if (inputPrice > 0 || outputPrice > 0) {
    return {
      inputPricePerMToken: inputPrice,
      outputPricePerMToken: outputPrice,
      unit: 'USD per 1M tokens',
    };
  }
  return null;
}
