/**
 * Regression tests for parsePricingApiResponse against architect-supplied fixtures.
 * Fixtures are REAL GetProducts responses captured 2026-07-06.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePricingApiResponse } from '../src/pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

describe('parsePricingApiResponse (architect-supplied fixtures)', () => {
  it('nova-micro fixture parses to exactly $0.035 in / $0.14 out per M tokens', () => {
    const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'pricing-api-nova-micro.json'), 'utf-8'));
    const result = parsePricingApiResponse(fixture.PriceList);

    expect(result).not.toBeNull();
    expect(result!.inputPricePerMToken).toBeCloseTo(0.035, 6);
    expect(result!.outputPricePerMToken).toBeCloseTo(0.14, 6);
    expect(result!.unit).toBe('USD per 1M tokens');
  });

  it('glm-4.7-flash fixture parses to exactly $0.07 in / $0.40 out per M tokens', () => {
    const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'pricing-api-glm-4.7-flash.json'), 'utf-8'));
    const result = parsePricingApiResponse(fixture.PriceList);

    expect(result).not.toBeNull();
    expect(result!.inputPricePerMToken).toBeCloseTo(0.07, 6);
    expect(result!.outputPricePerMToken).toBeCloseTo(0.40, 6);
    expect(result!.unit).toBe('USD per 1M tokens');
  });

  it('hard-fails on unsupported unit (e.g., "1M tokens")', () => {
    // Synthetic fixture with unit "1M tokens" — should hard-fail
    const syntheticPriceList = [
      JSON.stringify({
        product: {
          attributes: {
            inferenceType: 'Input tokens',
            usagetype: 'USE1-SyntheticModel-input-tokens',
            regionCode: 'us-east-1',
          },
        },
        terms: {
          OnDemand: {
            'SKU.TERM': {
              priceDimensions: {
                'SKU.TERM.DIM': {
                  unit: '1M tokens',
                  pricePerUnit: { USD: '0.0350000000' },
                  description: 'synthetic',
                  beginRange: '0',
                  endRange: 'Inf',
                },
              },
            },
          },
        },
      }),
    ];

    expect(() => parsePricingApiResponse(syntheticPriceList)).toThrow(/Unsupported pricing unit/);
  });

  it('hard-fails on ambiguous pricing (two dims with different prices for same inferenceType)', () => {
    const ambiguousPriceList = [
      JSON.stringify({
        product: {
          attributes: {
            inferenceType: 'Input tokens',
            usagetype: 'USE1-Model-input-tokens-a',
            regionCode: 'us-east-1',
          },
        },
        terms: {
          OnDemand: {
            'SKU1.TERM': {
              priceDimensions: {
                'SKU1.TERM.DIM': {
                  unit: '1K tokens',
                  pricePerUnit: { USD: '0.0000350000' },
                  description: 'price A',
                  beginRange: '0',
                  endRange: 'Inf',
                },
              },
            },
          },
        },
      }),
      JSON.stringify({
        product: {
          attributes: {
            inferenceType: 'Input tokens',
            usagetype: 'USE1-Model-input-tokens-b',
            regionCode: 'us-east-1',
          },
        },
        terms: {
          OnDemand: {
            'SKU2.TERM': {
              priceDimensions: {
                'SKU2.TERM.DIM': {
                  unit: '1K tokens',
                  pricePerUnit: { USD: '0.0000700000' },
                  description: 'price B (different!)',
                  beginRange: '0',
                  endRange: 'Inf',
                },
              },
            },
          },
        },
      }),
    ];

    expect(() => parsePricingApiResponse(ambiguousPriceList)).toThrow(/Ambiguous input pricing/);
  });

  it('correctly excludes batch/cache/custom-model usagetypes from nova-micro fixture', () => {
    const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'pricing-api-nova-micro.json'), 'utf-8'));
    // The fixture contains batch, cache, custom-model entries — they must be excluded
    // If they leaked in, the prices would be different (batch is 50% of on-demand)
    const result = parsePricingApiResponse(fixture.PriceList);

    // On-demand standard prices (not batch/cache reduced prices)
    expect(result!.inputPricePerMToken).toBeCloseTo(0.035, 6); // Not 0.0175 (batch)
    expect(result!.outputPricePerMToken).toBeCloseTo(0.14, 6); // Not 0.07 (batch)
  });

  it('nova-2-lite fixture parses to exactly $0.33 in / $2.75 out per M (cross-region-global dims excluded, FINDING-E)', () => {
    const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'pricing-api-nova-2-lite.json'), 'utf-8'));
    // Fixture contains cross-region-global ($0.30/$2.50), batch, priority, custom-model
    // dims alongside plain in-region on-demand. We invoke via us.* geo profiles, so the
    // plain in-region dim is the billed rate — everything else must be excluded, and the
    // parse must NOT throw the ambiguity error that voided task-7 run 1.
    const result = parsePricingApiResponse(fixture.PriceList);

    expect(result).not.toBeNull();
    expect(result!.inputPricePerMToken).toBeCloseTo(0.33, 6);
    expect(result!.outputPricePerMToken).toBeCloseTo(2.75, 6);
  });

  it('handles duplicate dims with same price (agrees → takes the value)', () => {
    // Two "Input tokens" entries with identical prices (e.g., On-demand + custom-model-same-price)
    // After filtering, if only on-demand survives, this is just the normal case
    const fixture = JSON.parse(readFileSync(resolve(FIXTURES_DIR, 'pricing-api-nova-micro.json'), 'utf-8'));
    // Nova-micro has both "On-demand Inference" and "Model Customization" Input tokens at same price
    // The custom-model usagetype is excluded, so only one survives — no ambiguity
    expect(() => parsePricingApiResponse(fixture.PriceList)).not.toThrow();
  });
});
