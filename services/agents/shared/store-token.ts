/**
 * Store-Token Lambda — invoked by SFN WaitForApproval state.
 * Persists $$.Task.Token into the DDB HITL item keyed by hitlItemId.
 * Without this, the HITL gate is un-approvable (no token to send back).
 *
 * T-8d (BINDING): wires StoreTokenRole into SFN WaitForApproval.
 * Write scope: ONLY the taskToken field on TENANT#<tenantId>#HITL items.
 */

import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'store-token' });
const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

export interface StoreTokenInput {
  taskToken: string;
  input: {
    tenantId: string;
    hitlItemId: string;
    agentName: string;
    proposedAction: { tool: string; args: unknown };
  };
}

/**
 * Store the SFN task token in the DDB HITL item.
 * The frontend reads this token when the human approves, then calls
 * SendTaskSuccess/SendTaskFailure with it.
 */
export async function handler(event: StoreTokenInput): Promise<{ stored: true }> {
  const { taskToken, input } = event;
  const { tenantId, hitlItemId } = input;

  logger.info('Storing task token', { tenantId, hitlItemId, agentName: input.agentName });

  await ddb.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `TENANT#${tenantId}#HITL`,
      SK: `PENDING#${hitlItemId}`,
    }),
    UpdateExpression: 'SET taskToken = :token, tokenStoredAt = :ts',
    ExpressionAttributeValues: marshall({
      ':token': taskToken,
      ':ts': new Date().toISOString(),
    }),
    // Condition: item must exist (HITL gate was entered)
    ConditionExpression: 'attribute_exists(PK)',
  }));

  logger.info('Task token stored', { tenantId, hitlItemId });
  return { stored: true };
}
