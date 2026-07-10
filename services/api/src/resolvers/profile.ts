/**
 * Profile resolver — user locale preferences stored in DynamoDB.
 * Uses tenant-scoped DDB client (getTenantDdbClient) for isolation.
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { extractContext, getTenantDdbClient, TABLE_NAME } from './shared.js';

const logger = new Logger({ serviceName: 'resolver-profile' });

const VALID_LOCALES = ['en', 'es', 'pt'] as const;

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

export async function handler(event: AppSyncEvent): Promise<unknown> {
  const ctx = extractContext(event);
  const { tenantId, sub } = ctx;
  logger.appendKeys({ tenantId, requestField: event.info.fieldName });

  switch (event.info.fieldName) {
    case 'getProfile': return getProfile(tenantId, sub);
    case 'updateProfile': return updateProfile(event, tenantId, sub);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function getProfile(tenantId: string, sub: string) {
  const ddb = await getTenantDdbClient(tenantId);
  const result = await ddb.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `TENANT#${tenantId}#PROFILE`,
      SK: `USER#${sub}`,
    }),
  }));

  if (!result.Item) {
    return { userId: sub, locale: 'en', updatedAt: null };
  }

  const item = unmarshall(result.Item);
  return { userId: sub, locale: item.locale, updatedAt: item.updatedAt };
}

async function updateProfile(event: AppSyncEvent, tenantId: string, sub: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const locale = input.locale as string;

  if (!VALID_LOCALES.includes(locale as typeof VALID_LOCALES[number])) {
    throw new Error(`Invalid locale "${locale}". Must be one of: ${VALID_LOCALES.join(', ')}`);
  }

  const updatedAt = new Date().toISOString();
  const ddb = await getTenantDdbClient(tenantId);

  await ddb.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall({
      PK: `TENANT#${tenantId}#PROFILE`,
      SK: `USER#${sub}`,
      locale,
      updatedAt,
    }),
  }));

  return { userId: sub, locale, updatedAt };
}
