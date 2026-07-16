/**
 * Chain-Verifier Lambda handler.
 *
 * EventBridge daily schedule → walk each tenant's hash chain + compare
 * against sealed S3 objects. Emits AuditChainBroken on any break.
 *
 * REV-7: Tenant discovery via AUDITMETA partition (no Scan).
 * REV-7: Incremental S3 comparison with watermark.
 * REV-10: Uses shared hash formula from hash-chain.ts.
 */

import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { computePrevHash, computePayloadHash, GENESIS_HASH } from '../src/hash-chain.js';
import type { Context } from 'aws-lambda';
import type { VerifierTenantResult } from '../src/types.js';

const ddb = new DynamoDBClient({});
const s3 = new S3Client({});
const cw = new CloudWatchClient({});
const logger = new Logger({ serviceName: 'audit-trail-verifier' });

const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.AUDIT_ARCHIVE_BUCKET!;
const TIME_BUFFER_MS = 60_000; // Stop 60s before timeout

export interface VerifierEvent {
  tenantId?: string; // If set, verify only this tenant (for readback testing)
}

export async function handler(
  event: VerifierEvent,
  context: Context,
): Promise<VerifierTenantResult[]> {
  const results: VerifierTenantResult[] = [];

  // Discover tenants
  const tenantIds = event.tenantId ? [event.tenantId] : await discoverTenants();

  for (const tenantId of tenantIds) {
    // Check remaining time
    if (context.getRemainingTimeInMillis() < TIME_BUFFER_MS) {
      logger.warn('Approaching timeout — stopping tenant processing', {
        processedTenants: results.length,
        remainingTenants: tenantIds.length - results.length,
      });
      break;
    }

    const result = await verifyTenant(tenantId);
    results.push(result);

    if (!result.chainValid) {
      await emitChainBrokenMetric(tenantId);
    }
  }

  return results;
}

async function discoverTenants(): Promise<string[]> {
  const tenantIds: string[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': { S: 'AUDITMETA' },
          ':prefix': { S: 'TENANT#' },
        },
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of resp.Items ?? []) {
      const sk = item.SK?.S; // TENANT#<tenantId>
      if (sk) {
        tenantIds.push(sk.replace('TENANT#', ''));
      }
    }
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);

  return tenantIds;
}

async function verifyTenant(tenantId: string): Promise<VerifierTenantResult> {
  const pk = `TENANT#${tenantId}#AUDITLOG`;
  const result: VerifierTenantResult = {
    tenantId,
    itemsChecked: 0,
    chainValid: true,
    s3Mismatches: 0,
    brokenLinks: [],
  };

  // Get watermark for incremental S3 check
  const watermark = await getWatermark(tenantId);

  let lastKey: Record<string, any> | undefined;
  let predecessorPK: string | undefined;
  let predecessorSK: string | undefined;
  let predecessorPayloadHash: string | undefined;
  let lastVerifiedSK: string | undefined;

  do {
    const resp = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': { S: pk } },
        ScanIndexForward: true,
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const rawItem of resp.Items ?? []) {
      const item = unmarshall(rawItem);
      result.itemsChecked++;

      // 1. Verify payloadHash (REV-2: recompute from stored payload)
      const recomputedPayloadHash = computePayloadHash(item.payload as Record<string, unknown>);
      if (recomputedPayloadHash !== item.payloadHash) {
        result.chainValid = false;
        result.brokenLinks.push({
          eventId: item.eventId as string,
          expected: recomputedPayloadHash,
          actual: item.payloadHash as string,
          type: 'payloadHash',
        });
      }

      // 2. Verify prevHash chain
      const expectedPrevHash =
        predecessorPK && predecessorSK && predecessorPayloadHash
          ? computePrevHash(predecessorPK, predecessorSK, predecessorPayloadHash)
          : GENESIS_HASH;

      if (item.prevHash !== expectedPrevHash) {
        result.chainValid = false;
        result.brokenLinks.push({
          eventId: item.eventId as string,
          expected: expectedPrevHash,
          actual: item.prevHash as string,
          type: 'prevHash',
        });
      }

      // 3. Incremental S3 check (only for items beyond watermark)
      const currentSK = item.SK as string;
      if (!watermark || currentSK > watermark) {
        const s3Exists = await checkS3Object(tenantId, item.eventId as string, currentSK);
        if (!s3Exists) {
          result.s3Mismatches++;
        }
      }

      // Track predecessor for next iteration
      predecessorPK = item.PK as string;
      predecessorSK = item.SK as string;
      predecessorPayloadHash = item.payloadHash as string;
      lastVerifiedSK = currentSK;
    }

    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);

  // Update watermark
  if (lastVerifiedSK && result.chainValid) {
    await updateWatermark(tenantId, lastVerifiedSK);
  }

  logger.info('Tenant verification complete', {
    tenantId,
    itemsChecked: result.itemsChecked,
    chainValid: result.chainValid,
    s3Mismatches: result.s3Mismatches,
    brokenLinks: result.brokenLinks.length,
  });

  return result;
}

async function getWatermark(tenantId: string): Promise<string | undefined> {
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ PK: 'AUDITMETA', SK: `VERIFY_WATERMARK#${tenantId}` }),
      ProjectionExpression: 'lastVerifiedSK',
    }),
  );
  return resp.Item?.lastVerifiedSK?.S;
}

async function updateWatermark(tenantId: string, lastVerifiedSK: string): Promise<void> {
  await ddb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall({
        PK: 'AUDITMETA',
        SK: `VERIFY_WATERMARK#${tenantId}`,
        lastVerifiedSK,
        updatedAt: new Date().toISOString(),
      }),
    }),
  );
}

async function checkS3Object(tenantId: string, eventId: string, sk: string): Promise<boolean> {
  const isoTimestamp = sk.split('#')[1];
  const date = new Date(isoTimestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const key = `audit-trail/${tenantId}/${yyyy}/${mm}/${dd}/${eventId}.json`;

  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    logger.warn('S3 object missing for sealed audit event', { tenantId, eventId, key });
    return false;
  }
}

async function emitChainBrokenMetric(tenantId: string): Promise<void> {
  await cw.send(
    new PutMetricDataCommand({
      Namespace: 'Cumplify/AuditTrail',
      MetricData: [
        {
          MetricName: 'AuditChainBroken',
          Value: 1,
          Unit: 'Count',
          Dimensions: [{ Name: 'TenantId', Value: tenantId }],
        },
      ],
    }),
  );
  logger.error('Chain break detected — AuditChainBroken metric emitted', { tenantId });
}
