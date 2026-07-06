/**
 * Pricing module — fetches model pricing from AWS Pricing API with
 * snapshot fallback for models not covered (e.g., Claude 4.x).
 *
 * C-3: Prices are NEVER hardcoded inline. They live in exactly one
 * auditable data artifact with provenance (price-snapshot.json).
 */

import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PriceEntry, PriceSnapshot } from './types.js';

const SNAPSHOT_PATH = resolve(import.meta.dirname ?? '.', '../data/price-snapshot.json');

export interface PricingResult {
  prices: Record<string, PriceEntry>;
  sources: Record<string, 'live-api' | 'snapshot-priced'>;
}

/**
 * Fetch pricing for a list of model IDs.
 * Primary: AWS Pricing API. Fallback: price-snapshot.json for missing models.
 * Throws if snapshot is stale (> stalenessLimitDays).
 */
export async function fetchPricing(modelIds: string[]): Promise<PricingResult> {
  const prices: Record<string, PriceEntry> = {};
  const sources: Record<string, 'live-api' | 'snapshot-priced'> = {};

  // 1. Try Pricing API for all models
  const apiPrices = await fetchFromPricingApi(modelIds);
  for (const [modelId, entry] of Object.entries(apiPrices)) {
    prices[modelId] = entry;
    sources[modelId] = 'live-api';
  }

  // 2. Fallback to snapshot for models not found in API
  const missing = modelIds.filter((id) => !prices[id]);
  if (missing.length > 0) {
    const snapshot = loadSnapshot();
    checkStaleness(snapshot);
    for (const modelId of missing) {
      const entry = snapshot.models[modelId];
      if (entry) {
        prices[modelId] = entry;
        sources[modelId] = 'snapshot-priced';
      } else {
        throw new Error(
          `No pricing found for model ${modelId} — not in Pricing API and not in price-snapshot.json`,
        );
      }
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

/**
 * Fetch pricing from AWS Pricing API for Bedrock models.
 * Returns entries found; missing models are simply absent from the result.
 */
async function fetchFromPricingApi(modelIds: string[]): Promise<Record<string, PriceEntry>> {
  const client = new PricingClient({ region: 'us-east-1' });
  const result: Record<string, PriceEntry> = {};

  for (const modelId of modelIds) {
    try {
      const resp = await client.send(
        new GetProductsCommand({
          ServiceCode: 'AmazonBedrock',
          Filters: [
            { Type: 'TERM_MATCH', Field: 'model', Value: modelId },
          ],
          MaxResults: 10,
        }),
      );

      if (resp.PriceList && resp.PriceList.length > 0) {
        const entry = parsePricingApiResponse(resp.PriceList, modelId);
        if (entry) {
          result[modelId] = entry;
        }
      }
    } catch {
      // Model not found in Pricing API — will fall back to snapshot
    }
  }

  return result;
}

/**
 * Parse the Pricing API response to extract input/output token prices.
 */
function parsePricingApiResponse(priceList: string[], _modelId: string): PriceEntry | null {
  // Pricing API returns JSON strings; parse and extract per-token pricing
  for (const item of priceList) {
    try {
      const parsed = JSON.parse(item);
      const terms = parsed.terms?.OnDemand;
      if (!terms) continue;

      let inputPrice = 0;
      let outputPrice = 0;

      for (const term of Object.values(terms) as any[]) {
        for (const dimension of Object.values(term.priceDimensions ?? {}) as any[]) {
          const desc = (dimension.description ?? '').toLowerCase();
          const pricePerUnit = parseFloat(dimension.pricePerUnit?.USD ?? '0');

          if (desc.includes('input') || desc.includes('prompt')) {
            inputPrice = pricePerUnit * 1_000_000; // Convert per-token to per-M-token
          } else if (desc.includes('output') || desc.includes('completion')) {
            outputPrice = pricePerUnit * 1_000_000;
          }
        }
      }

      if (inputPrice > 0 || outputPrice > 0) {
        return {
          inputPricePerMToken: inputPrice,
          outputPricePerMToken: outputPrice,
          unit: 'USD per 1M tokens',
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}
