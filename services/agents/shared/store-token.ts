/**
 * Store-Token Lambda — invoked by SFN WaitForApproval state.
 *
 * Task 8R-2: This is now the SOLE writer of the DDB HITL item.
 * It performs a native upsert (UpdateItem without condition) — creating the
 * full item with all fields + GSI9PK/GSI9SK + taskToken in one atomic write.
 * This eliminates the StartExecution-vs-PutItem race and removes the need for
 * any DDB permission on agent handler Lambdas.
 *
 * T-8d (BINDING): wires StoreTokenRole into SFN WaitForApproval.
 * Write scope: TENANT#<tenantId>#HITL items (LeadingKeys-compatible).
 *
 * TODO [REQUIRES-HUMAN]: HITL-10 ASL Amendment — The SFN state machine definition
 * (WaitForApproval Catch + HandleSendBack state) needs the following ASL changes:
 *   1. Pass sfnExecutionArn (via $$.Execution.Id context object) into store-token input
 *   2. Add a Catch clause on WaitForApproval state for "SENT_BACK" error → HandleSendBack state
 *   3. HandleSendBack state should invoke agent-resume logic or mark item for re-queue
 * No ASL file found in the repo — the state machine may be defined in CDK code or
 * deployed separately. This amendment must be applied by a human to the actual
 * SFN definition wherever it lives.
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
    createdAt: string;
    sfnExecutionArn?: string;
  };
}

/**
 * Create-or-update the DDB HITL item with all fields + task token.
 * Native upsert via UpdateItem (no ConditionExpression) — item is born with
 * its token, eliminating the race between SFN start and item creation.
 *
 * The frontend queries GSI9 (TENANT#<tenantId>#HITL_PENDING) to list pending
 * approvals, reads the taskToken, then calls SendTaskSuccess/SendTaskFailure.
 */
export async function handler(event: StoreTokenInput): Promise<{ stored: true }> {
  const { taskToken, input } = event;
  const { tenantId, hitlItemId, agentName, proposedAction, createdAt, sfnExecutionArn } = input;

  logger.info('Creating/updating HITL item with task token', {
    tenantId, hitlItemId, agentName, tool: proposedAction.tool,
  });

  const now = new Date().toISOString();

  await ddb.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `TENANT#${tenantId}#HITL`,
      SK: `PENDING#${hitlItemId}`,
    }),
    // Native upsert: SET creates the item if it doesn't exist, updates if it does.
    // No ConditionExpression — idempotent on re-delivery (SFN retry).
    UpdateExpression: [
      'SET itemType = :itemType',
      'agentName = :agentName',
      'proposedAction = :proposedAction',
      'createdAt = :createdAt',
      '#status = :status',
      'taskToken = :taskToken',
      'tokenStoredAt = :tokenStoredAt',
      // GSI9: sparse projection for frontend pending-approvals query (D-2)
      'GSI9PK = :gsi9pk',
      'GSI9SK = :gsi9sk',
      // HITL-10: store SFN execution ARN for tracing/audit (if_not_exists preserves on retry)
      'sfnExecutionArn = if_not_exists(sfnExecutionArn, :sfnArn)',
    ].join(', '),
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: marshall({
      ':itemType': 'HITL_PENDING',
      ':agentName': agentName,
      ':proposedAction': proposedAction,
      ':createdAt': createdAt,
      ':status': 'PENDING',
      ':taskToken': taskToken,
      ':tokenStoredAt': now,
      ':gsi9pk': `TENANT#${tenantId}#HITL_PENDING`,
      ':gsi9sk': createdAt,
      ':sfnArn': sfnExecutionArn ?? 'unknown',
    }),
  }));

  logger.info('HITL item created with task token', { tenantId, hitlItemId });
  return { stored: true };
}
