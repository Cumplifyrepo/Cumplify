/**
 * appendAuditEvent — core library function for the immutable audit trail.
 * Writes a hash-chained item to CumplifyCore via TransactWriteItems.
 *
 * FIX-1: Atomic chain-item + dedup-marker transaction prevents replay duplicates.
 * REV-1: SK uses append time (consumer clock) with monotonicity enforcement.
 * REV-2: Full event payload stored (trail stores what it hashes).
 * FIX-4: itemType='AUDITLOG' discriminator for stream filtering.
 */

import {
  DynamoDBClient,
  QueryCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { ulid } from 'ulid';
import { computePrevHash, computePayloadHash, GENESIS_HASH } from './hash-chain.js';
import type { AppendResult } from './types.js';

const ddb = new DynamoDBClient({});
const logger = new Logger({ serviceName: 'audit-trail-appender' });

const TABLE_NAME = process.env.TABLE_NAME!;
const MAX_ITEM_SIZE = 400 * 1024; // 400KB

export interface AppendInput {
  tenantId: string;
  eventId: string;
  timestamp: string;
  actor: string;
  module: string;
  clauseRef: string;
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001' | 'IMS'; // IMS = integrated-manual artifacts (spec-40 BC-6)
  payload: Record<string, unknown>;
}

export async function appendAuditEvent(
  input: AppendInput,
  detailType: string,
): Promise<AppendResult> {
  const { tenantId } = input;
  const pk = `TENANT#${tenantId}#AUDITLOG`;
  const eventId = input.eventId || ulid();

  // 1. Query latest item for prevHash + monotonicity
  const latestResp = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: pk } },
      ScanIndexForward: false,
      Limit: 1,
      ProjectionExpression: 'PK, SK, payloadHash',
    }),
  );

  let prevHash: string;
  let latestSK: string | undefined;
  const isFirstEvent = !latestResp.Items || latestResp.Items.length === 0;

  if (!isFirstEvent) {
    const prev = latestResp.Items![0];
    prevHash = computePrevHash(prev.PK!.S!, prev.SK!.S!, prev.payloadHash!.S!);
    latestSK = prev.SK!.S!;
  } else {
    prevHash = GENESIS_HASH;
  }

  // 2. Compute append timestamp with monotonicity enforcement (REV-1)
  let appendTs = new Date().toISOString();
  if (latestSK) {
    const latestTsPart = latestSK.split('#')[1]; // EVENT#<ts>#<ulid>
    if (appendTs <= latestTsPart) {
      const latestDate = new Date(latestTsPart);
      latestDate.setMilliseconds(latestDate.getMilliseconds() + 1);
      appendTs = latestDate.toISOString();
    }
  }

  const sk = `EVENT#${appendTs}#${eventId}`;

  // 3. Compute payload hash
  const payloadHash = computePayloadHash(input.payload);

  // 4. Build item
  const item: Record<string, unknown> = {
    PK: pk,
    SK: sk,
    itemType: 'AUDITLOG',
    eventType: detailType,
    actor: input.actor,
    module: input.module,
    clauseRef: input.clauseRef,
    standard: input.standard,
    eventTimestamp: input.timestamp,
    eventId,
    payload: input.payload,
    payloadHash,
    prevHash,
  };

  // ES-3 future-proofing: docVersionHash
  if (input.payload.docVersionHash) {
    item.docVersionHash = input.payload.docVersionHash;
  }

  // 5. Item size guard (REV-2)
  const serialized = JSON.stringify(marshall(item));
  if (Buffer.byteLength(serialized, 'utf-8') > MAX_ITEM_SIZE) {
    throw new ItemSizeExceededError(
      `Item size exceeds 400KB limit (${Buffer.byteLength(serialized, 'utf-8')} bytes)`,
    );
  }

  // 6. FIX-1: TransactWriteItems — atomic chain item + dedup marker
  const dedupPK = `TENANT#${tenantId}#AUDITDEDUP`;
  const dedupSK = `EVENT#${eventId}`;

  try {
    await ddb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE_NAME,
              Item: marshall(item, { removeUndefinedValues: true }),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: marshall({
                PK: dedupPK,
                SK: dedupSK,
                itemType: 'AUDITDEDUP',
                eventId,
                createdAt: new Date().toISOString(),
              }),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === 'TransactionCanceledException'
    ) {
      const reasons = (err as any).CancellationReasons ?? [];
      if (reasons[1]?.Code === 'ConditionalCheckFailed') {
        throw new ReplayDetectedError(`Replay detected for eventId ${eventId}`);
      }
      if (reasons[0]?.Code === 'ConditionalCheckFailed') {
        throw new ReplayDetectedError(`Chain item already exists for eventId ${eventId}`);
      }
      throw err;
    }
    throw err;
  }

  logger.info('Audit event appended', {
    tenantId,
    eventId,
    sk,
    prevHash: prevHash.substring(0, 8),
  });

  // 7. Register tenant in AUDITMETA (REV-7) — only on first event
  if (isFirstEvent) {
    try {
      await ddb.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: marshall({
                  PK: 'AUDITMETA',
                  SK: `TENANT#${tenantId}`,
                  registeredAt: new Date().toISOString(),
                }),
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      logger.info('Tenant registered in AUDITMETA', { tenantId });
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'TransactionCanceledException') {
        throw err;
      }
      // Already registered — race condition (safe)
    }
  }

  return { pk, sk, payloadHash, prevHash };
}

export class ItemSizeExceededError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ItemSizeExceededError';
  }
}

export class ReplayDetectedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ReplayDetectedError';
  }
}
