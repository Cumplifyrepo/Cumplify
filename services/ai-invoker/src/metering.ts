/**
 * Token → credit metering module.
 * Design §1.4 — weight derivation: wIn/wOut/wCache = pricePerMToken × 1000.
 * Calibrated so 1,000 credits ≈ $1.00 raw Bedrock cost.
 *
 * Meter key: TENANT#<tenantId>#METER / MONTH#<yyyymm> (D-5 corrected).
 */

import { DynamoDBClient, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Logger } from '@aws-lambda-powertools/logger';
import type { ModelWeight, TokenUsage } from './types.js';

const logger = new Logger({ serviceName: 'ai-invoker-metering' });

const ddb = new DynamoDBClient({});
const eb = new EventBridgeClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const BUS_NAME = process.env.BUS_NAME ?? 'cumplify-events';

/**
 * Compute credits consumed from token usage and model weights.
 * Formula (§1.4): credits = (input × wIn + cacheRead × wCache + output × wOut) / 1,000,000
 * If wCache is null (model doesn't support caching), fallback to wIn (safety guard —
 * cacheReadInputTokens will always be 0 for non-caching models).
 */
export function computeCredits(usage: TokenUsage, weights: ModelWeight): number {
  const wCache = weights.wCache ?? weights.wIn; // fallback for non-caching models
  const credits =
    (usage.inputTokens * weights.wIn +
      usage.cacheReadInputTokens * wCache +
      usage.outputTokens * weights.wOut) /
    1_000_000;
  return credits;
}

/**
 * Load model weights from DynamoDB (latest version for the model).
 * Reads MODELWEIGHT#<modelId>, SK descending limit 1.
 */
export async function loadWeights(modelId: string): Promise<ModelWeight> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `MODELWEIGHT#${modelId}` },
      },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );

  if (!result.Items || result.Items.length === 0) {
    throw new Error(`No MODELWEIGHT# entry found for model '${modelId}'`);
  }

  const item = result.Items[0];
  return {
    modelId,
    wIn: parseFloat(item.wIn?.N ?? '0'),
    wOut: parseFloat(item.wOut?.N ?? '0'),
    wCache: item.wCache?.N ? parseFloat(item.wCache.N) : null,
    effectiveFrom: item.effectiveFrom?.S ?? '',
    sourceCommit: item.sourceCommit?.S ?? '',
  };
}

/**
 * Atomically increment the tenant's monthly credit meter.
 * Key: TENANT#<tenantId>#METER / MONTH#<yyyymm>
 */
export async function incrementMeter(tenantId: string, credits: number): Promise<void> {
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const pk = `TENANT#${tenantId}#METER`;
  const sk = `MONTH#${yyyymm}`;

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: pk },
        SK: { S: sk },
      },
      UpdateExpression: 'ADD creditsUsed :credits SET lastUpdated = :ts',
      ExpressionAttributeValues: {
        ':credits': { N: credits.toFixed(6) },
        ':ts': { S: new Date().toISOString() },
      },
    }),
  );
}

/**
 * Emit telemetry.credits.consumed event to EventBridge.
 */
export async function emitCreditsTelemetry(opts: {
  tenantId: string;
  agent: string;
  module: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  creditsConsumed: number;
  modelId: string;
  /** Register seat that served the call — per-seat cost attribution (COND-4) */
  seat: string;
}): Promise<void> {
  try {
    await eb.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: BUS_NAME,
            Source: 'cumplify.ai-invoker',
            DetailType: 'telemetry.credits.consumed',
            Detail: JSON.stringify({
              tenantId: opts.tenantId,
              agent: opts.agent,
              module: opts.module,
              feature: opts.feature,
              inputTokens: opts.inputTokens,
              outputTokens: opts.outputTokens,
              cacheReadTokens: opts.cacheReadTokens,
              creditsConsumed: opts.creditsConsumed,
              modelId: opts.modelId,
              seat: opts.seat,
              timestamp: new Date().toISOString(),
            }),
          },
        ],
      }),
    );
  } catch (err) {
    // Telemetry failure is non-blocking — log and continue
    logger.warn('Failed to emit credits telemetry', { error: (err as Error).message });
  }
}
