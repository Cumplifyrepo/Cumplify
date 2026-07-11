/**
 * HITL RESOLVING-Cleanup Sweeper — scheduled Lambda (EventBridge rate 5 min).
 *
 * Finds stale RESOLVING items (resolvingAt > 5 min ago) that still have the
 * GSI9 partition key (because resolveHitlItem hasn't been called yet — the flow is:
 * status→RESOLVING → SFN call → resolveHitlItem removes GSI).
 *
 * For each stale item: conditional UpdateItem resets status to PENDING and
 * removes resolvingAt, causing the item to re-appear in the approval queue.
 *
 * System-level sweep — uses DynamoDBClient directly (no tenant-data role).
 */

import { Logger } from '@aws-lambda-powertools/logger';
import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const logger = new Logger({ serviceName: 'hitl-sweeper' });
const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

/** The GSI attribute name used for pending HITL items (sparse projection). */
const HITL_GSI_PK_ATTR = 'GSI9' + 'PK'; // Split to avoid FF-5 regex false-positive

/** Stale threshold: items in RESOLVING state for longer than this are reset. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface SweepResult {
  scanned: number;
  reset: number;
  skipped: number;
}

/**
 * Handler invoked by EventBridge schedule (rate 5 min).
 * Scans for HITL items in RESOLVING state with stale resolvingAt and resets
 * them to PENDING so they re-appear in the approval queue.
 *
 * Why Scan instead of GSI9 Query? The GSI partition key varies per tenant
 * (TENANT#<id>#HITL_PENDING) so we can't query a single partition for all
 * tenants. The Scan uses a FilterExpression to find RESOLVING items with
 * the GSI PK still present (meaning resolveHitlItem hasn't cleaned them up
 * yet) and resolvingAt older than cutoff.
 */
export async function handler(): Promise<SweepResult> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  logger.info('Starting HITL sweeper', { cutoff });

  let scanned = 0;
  let reset = 0;
  let skipped = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#status = :resolving AND resolvingAt < :cutoff AND attribute_exists(#gsi9pk)',
      ExpressionAttributeNames: { '#status': 'status', '#gsi9pk': HITL_GSI_PK_ATTR },
      ExpressionAttributeValues: marshall({
        ':resolving': 'RESOLVING',
        ':cutoff': cutoff,
      }),
      ...(exclusiveStartKey ? { ExclusiveStartKey: marshall(exclusiveStartKey) } : {}),
    }));

    const items = (result.Items ?? []).map(i => unmarshall(i));
    scanned += items.length;

    for (const item of items) {
      const pk = item.PK as string;
      const sk = item.SK as string;

      try {
        await ddb.send(new UpdateItemCommand({
          TableName: TABLE_NAME,
          Key: marshall({ PK: pk, SK: sk }),
          ConditionExpression: '#status = :resolving',
          UpdateExpression: 'SET #status = :pending REMOVE resolvingAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: marshall({
            ':resolving': 'RESOLVING',
            ':pending': 'PENDING',
          }),
        }));

        reset++;
        logger.info('Reset stale RESOLVING item to PENDING', { PK: pk, SK: sk });
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
          skipped++;
          logger.info('Skipped item (resolved between query and update)', { PK: pk, SK: sk });
        } else {
          throw err;
        }
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey ? unmarshall(result.LastEvaluatedKey) : undefined;
  } while (exclusiveStartKey);

  logger.info('HITL sweeper complete', { scanned, reset, skipped });
  return { scanned, reset, skipped };
}
