/**
 * MODELWEIGHT# seeding Lambda — custom resource handler.
 * Uses createRequire to load the seed JSON (esbuild resolves and inlines it).
 *
 * Does NOT call live Pricing API at deploy time (T-2 correction).
 * MUST run before Task 9 (first deploy that expects weights to exist).
 *
 * T3E-F2: uses createRequire (not readFileSync) — esbuild bundles JSON inline.
 * T3E-F3: ConditionalCheckFailedException caught per-item (already seeded = skip).
 * T3E-F4: payload includes seedHash for re-trigger detection.
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createRequire } from 'node:module';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'weight-seeder' });
const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

interface WeightSeed {
  capturedAt: string;
  sourceCommit: string;
  models: Record<string, {
    wIn: number;
    wOut: number;
    wCache: number | null;
  }>;
}

// T3E-F2 FIX: createRequire + require() — esbuild resolves and inlines JSON
// at bundle time. No readFileSync ENOENT at runtime.
const require = createRequire(import.meta.url);
const seed: WeightSeed = require('../data/model-weights-seed.json');

export async function handler(event: { action: string; seedHash?: string }): Promise<{ status: string; seeded: number; skipped: number }> {
  if (event.action !== 'seed') {
    return { status: 'skipped', seeded: 0, skipped: 0 };
  }

  if (Object.keys(seed.models).length === 0) {
    logger.warn('No models in seed data — Task 2 has not landed model-weights-seed.json yet');
    return { status: 'no-data', seeded: 0, skipped: 0 };
  }

  logger.info('Seeding MODELWEIGHT# items', {
    modelCount: Object.keys(seed.models).length,
    seedHash: event.seedHash,
  });

  let seeded = 0;
  let skipped = 0;
  const version = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (const [modelId, weights] of Object.entries(seed.models)) {
    const pk = `MODELWEIGHT#${modelId}`;
    const sk = `VERSION#${version}`;

    try {
      await ddb.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall({
          PK: pk,
          SK: sk,
          modelId,
          wIn: weights.wIn,
          wOut: weights.wOut,
          ...(weights.wCache !== null ? { wCache: weights.wCache } : {}),
          effectiveFrom: seed.capturedAt,
          sourceCommit: seed.sourceCommit,
          seededAt: new Date().toISOString(),
        }, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(PK)',
      }));

      logger.info('Seeded weight', { modelId, pk, sk });
      seeded++;
    } catch (err: unknown) {
      // T3E-F3 FIX: ConditionalCheckFailedException = already seeded, skip
      if ((err as Error).name === 'ConditionalCheckFailedException') {
        logger.info('Weight already seeded, skipping', { modelId, pk, sk });
        skipped++;
      } else {
        throw err;
      }
    }
  }

  return { status: 'success', seeded, skipped };
}
