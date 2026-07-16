/**
 * WORM Sealer Lambda handler — REQUIRES-HUMAN.
 *
 * DynamoDB Streams ESM (INSERT + itemType='AUDITLOG') → S3 Object Lock COMPLIANCE.
 * FIX-6: ChecksumAlgorithm:'SHA256' on PutObject (S3 requires checksum with Object Lock).
 * FIX-4: Defense-in-depth itemType guard.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

const s3 = new S3Client({});
const logger = new Logger({ serviceName: 'audit-trail-sealer' });

function getBucketName(): string {
  return process.env.AUDIT_ARCHIVE_BUCKET!;
}

function getRetentionDays(): number {
  return parseInt(process.env.RETENTION_DAYS!, 10);
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  for (const record of event.Records) {
    await sealRecord(record);
  }
}

async function sealRecord(record: DynamoDBRecord): Promise<void> {
  if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) {
    return; // Filter should prevent this, but defend in depth
  }

  const item = unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>);
  const pk = item.PK as string;

  // Defense-in-depth: itemType guard (FIX-4)
  if (item.itemType !== 'AUDITLOG') {
    logger.debug('Skipping non-AUDITLOG item', { pk, itemType: item.itemType });
    return;
  }

  const tenantId = pk.replace('TENANT#', '').replace('#AUDITLOG', '');
  const eventId = item.eventId as string;
  const sk = item.SK as string;

  // Extract date from SK: EVENT#<ISO8601>#<ulid>
  const isoTimestamp = sk.split('#')[1];
  const date = new Date(isoTimestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');

  const key = `audit-trail/${tenantId}/${yyyy}/${mm}/${dd}/${eventId}.json`;
  const body = JSON.stringify(item, null, 2);

  const retainUntilDate = new Date();
  retainUntilDate.setDate(retainUntilDate.getDate() + getRetentionDays());

  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: retainUntilDate,
      ChecksumAlgorithm: 'SHA256', // FIX-6: required for Object Lock PutObject
    }),
  );

  logger.info('Sealed audit event', {
    tenantId,
    eventId,
    key,
    retainUntilDate: retainUntilDate.toISOString(),
  });
}
