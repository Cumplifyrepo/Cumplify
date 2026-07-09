/**
 * MODELWEIGHT# seeding Lambda — custom resource handler.
 * Reads services/ai-invoker/data/model-weights-seed.json (committed by Task 2,
 * architect-witnessed + provenanced) and writes DynamoDB MODELWEIGHT# items.
 *
 * Does NOT call live Pricing API at deploy time (T-2 correction).
 * MUST run before Task 9 (first deploy that expects weights to exist).
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger } from '@aws-lambda-powertools/logger';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, '../data/model-weights-seed.json');

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

export async function handler(event: { action: string }): Promise<{ status: string; seeded: number }> {
  if (event.action !== 'seed') {
    return { status: 'skipped', seeded: 0 };
  }

  logger.info('Loading model-weights-seed.json');
  const content = readFileSync(SEED_PATH, 'utf-8');
  const seed: WeightSeed = JSON.parse(content);

  let seeded = 0;
  const version = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  for (const [modelId, weights] of Object.entries(seed.models)) {
    const pk = `MODELWEIGHT#${modelId}`;
    const sk = `VERSION#${version}`;

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
      ConditionExpression: 'attribute_not_exists(PK)', // Idempotent
    }));

    logger.info('Seeded weight', { modelId, pk, sk, wIn: weights.wIn, wOut: weights.wOut });
    seeded++;
  }

  return { status: 'success', seeded };
}
