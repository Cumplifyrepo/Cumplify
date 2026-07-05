/**
 * Tamper-Tripwire Lambda handler.
 *
 * DynamoDB Streams ESM (MODIFY/REMOVE + OldImage.itemType='AUDITLOG') →
 * CloudWatch AuditTamperAttempt metric.
 *
 * AMEND-1: DynamoDB Streams userIdentity is populated ONLY for TTL-expired
 * deletions. Regular UpdateItem/DeleteItem carry NO caller identity.
 * Caller attribution requires CloudTrail data-event correlation (out of scope).
 *
 * AMEND-2: This is a SEPARATE Lambda from the sealer with its own minimal role
 * (cloudwatch:PutMetricData + logs only). Observe-and-alert only.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { createHash } from 'node:crypto';
import { Logger } from '@aws-lambda-powertools/logger';

const cw = new CloudWatchClient({});
const logger = new Logger({ serviceName: 'audit-trail-tripwire' });

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  for (const record of event.Records) {
    await processRecord(record);
  }
}

async function processRecord(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.Keys) return;

  const pk = record.dynamodb.Keys.PK?.S;
  const sk = record.dynamodb.Keys.SK?.S;

  if (!pk) return;

  // Defense-in-depth: check OldImage itemType (FIX-4)
  const oldItemType = record.dynamodb.OldImage?.itemType?.S;
  if (oldItemType !== 'AUDITLOG') {
    logger.debug('Skipping non-AUDITLOG event', { pk, oldItemType });
    return;
  }

  const tenantId = pk.replace('TENANT#', '').replace('#AUDITLOG', '');

  // Compute image digests (not full content — could be large)
  const oldImageDigest = record.dynamodb.OldImage
    ? createHash('sha256')
        .update(JSON.stringify(record.dynamodb.OldImage))
        .digest('hex')
        .substring(0, 16)
    : 'NONE';
  const newImageDigest = record.dynamodb.NewImage
    ? createHash('sha256')
        .update(JSON.stringify(record.dynamodb.NewImage))
        .digest('hex')
        .substring(0, 16)
    : 'NONE';

  // AMEND-1: No userIdentity available for regular mutations
  logger.critical('AUDIT TAMPER ATTEMPT DETECTED', {
    pk,
    sk,
    eventName: record.eventName,
    oldImageDigest,
    newImageDigest,
    tenantId,
    note: 'Caller identity not available in stream record — correlate with CloudTrail data events',
  });

  // Emit CloudWatch metric
  await cw.send(
    new PutMetricDataCommand({
      Namespace: 'Cumplify/AuditTrail',
      MetricData: [
        {
          MetricName: 'AuditTamperAttempt',
          Value: 1,
          Unit: 'Count',
          Dimensions: [{ Name: 'TenantId', Value: tenantId }],
        },
      ],
    }),
  );
}
