/**
 * HITL gate — Step Functions waitForTaskToken integration.
 * Design §3 — agents-existing-8.
 *
 * When a mutating tool is detected, this module:
 * 1. Starts a Step Functions execution with the proposed action.
 * 2. Writes a HITL_PENDING item to DynamoDB (GSI PK: TENANT#<tenantId>#HITL_PENDING).
 * 3. Returns the execution ARN for tracking.
 *
 * The SFN execution enters WaitForApproval (waitForTaskToken).
 * Approval comes via SendTaskSuccess from the frontend (spec 9).
 */

import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { ulid } from 'ulid';
import type { ConversationMessage } from '../../ai-invoker/src/types.js';

const logger = new Logger({ serviceName: 'agents-hitl' });

const sfn = new SFNClient({});
const ddb = new DynamoDBClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const HITL_STATE_MACHINE_ARN = process.env.HITL_STATE_MACHINE_ARN!;

export interface HitlGateInput {
  tenantId: string;
  agentName: string;
  proposedAction: { tool: string; args: unknown };
  conversationState: ConversationMessage[];
}

export interface HitlResult {
  status: 'HITL_PENDING';
  executionArn: string;
  hitlItemId: string;
}

/**
 * Enter the HITL gate: start a Step Functions execution and write a DynamoDB
 * tracking item for the frontend approval queue.
 */
export async function enterHitlGate(input: HitlGateInput): Promise<HitlResult> {
  const hitlItemId = ulid();
  const executionName = `hitl-${input.agentName}-${hitlItemId}`;

  // 1. Start Step Functions execution (enters WaitForApproval state)
  const sfnInput = {
    tenantId: input.tenantId,
    agentName: input.agentName,
    proposedAction: input.proposedAction,
    hitlItemId,
    // Conversation context truncated to stay within SFN input size (256KB).
    // Keep last 10 messages; if still over 200KB, truncate further.
    conversationContext: truncateConversation(input.conversationState, 200_000),
  };

  const startResult = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: HITL_STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify(sfnInput),
    }),
  );

  const executionArn = startResult.executionArn!;

  // 2. Write HITL_PENDING item to DynamoDB
  // Base item PK: TENANT#<tenantId>#HITL / SK: PENDING#<hitlItemId>
  // GSI PK (D-2): TENANT#<tenantId>#HITL_PENDING (tenant-isolated, LeadingKeys-compatible)
  const now = new Date().toISOString();
  await ddb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(
        {
          PK: `TENANT#${input.tenantId}#HITL`,
          SK: `PENDING#${hitlItemId}`,
          itemType: 'HITL_PENDING',
          // GSI9 allocated for HITL-PENDING (D-2: tenant-isolated, LeadingKeys-compatible)
          // PK = TENANT#<tenantId>#HITL_PENDING, SK = createdAt (newest-first query)
          GSI9PK: `TENANT#${input.tenantId}#HITL_PENDING`,
          GSI9SK: now,
          agentName: input.agentName,
          proposedAction: input.proposedAction,
          createdAt: now,
          sfnExecutionArn: executionArn,
          status: 'PENDING',
          // TTL: 30 days after resolution (set on status change, not creation)
        },
        { removeUndefinedValues: true },
      ),
    }),
  );

  logger.info('HITL gate entered', {
    tenantId: input.tenantId,
    agentName: input.agentName,
    tool: input.proposedAction.tool,
    executionArn,
    hitlItemId,
  });

  return { status: 'HITL_PENDING', executionArn, hitlItemId };
}

/**
 * Mark a HITL item as resolved (APPROVED/REJECTED/TIMED_OUT).
 * Removes the GSI attribute (sparse GSI — resolved items disappear from pending query).
 * Sets TTL to 30 days from now.
 */
export async function resolveHitlItem(
  tenantId: string,
  hitlItemId: string,
  resolution: 'APPROVED' | 'REJECTED' | 'TIMED_OUT',
  approver?: string,
): Promise<void> {
  const ttlEpoch = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `TENANT#${tenantId}#HITL`,
        SK: `PENDING#${hitlItemId}`,
      }),
      UpdateExpression:
        'SET #status = :status, resolvedAt = :now, approver = :approver, #ttl = :ttl ' +
        'REMOVE GSI9PK, GSI9SK',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: marshall({
        ':status': resolution,
        ':now': new Date().toISOString(),
        ':approver': approver ?? 'system',
        ':ttl': ttlEpoch,
      }),
    }),
  );

  logger.info('HITL item resolved', { tenantId, hitlItemId, resolution, approver });
}

/**
 * Truncate conversation state to fit within a byte budget (R6-n1).
 * Takes the last N messages; if serialized size exceeds budget, drops oldest.
 */
function truncateConversation(messages: ConversationMessage[], maxBytes: number): ConversationMessage[] {
  let slice = messages.slice(-10);
  while (slice.length > 0) {
    const size = Buffer.byteLength(JSON.stringify(slice), 'utf-8');
    if (size <= maxBytes) return slice;
    slice = slice.slice(1); // Drop oldest
  }
  return [];
}
