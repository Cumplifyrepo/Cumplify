/**
 * HITL Approval resolver — processes Approve / Send-back decisions.
 * Design §2.3: claims-derived tenantId/approver, server-side taskToken fetch,
 * conditional UpdateItem guard (AM-1: resolvingAt), SFN SendTaskSuccess/Failure,
 * resolveHitlItem bookkeeping, audit event publication.
 *
 * BC-8: taskToken never leaves the server.
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { SFNClient, SendTaskSuccessCommand, SendTaskFailureCommand } from '@aws-sdk/client-sfn';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { extractContext, getTenantDdbClient, publishAuditEvent, TABLE_NAME } from './shared.js';
import { canApprove } from '../permissions/role-matrix.js';
import { resolveHitlItem } from '../../../agents/shared/hitl.js';

const logger = new Logger({ serviceName: 'resolver-hitl-approval' });
const sfnClient = new SFNClient({});

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

interface ApprovalInput {
  hitlItemId: string;
  decision: 'APPROVE' | 'SEND_BACK';
  justification?: string;
  editedPayload?: Record<string, unknown>;
}

interface HitlApprovalResult {
  success: boolean;
  hitlItemId: string;
  decision: string;
  resolvedAt: string;
}

export async function handler(event: AppSyncEvent): Promise<HitlApprovalResult> {
  // Step 1: Extract context — tenantId, sub (approverSub), role
  const ctx = extractContext(event);
  const { tenantId, sub: approverSub, role } = ctx;
  logger.appendKeys({ tenantId, approverSub, requestField: event.info.fieldName });

  const input = event.arguments.input as ApprovalInput;
  const { hitlItemId, decision, justification, editedPayload } = input;

  logger.info('Processing HITL approval', { hitlItemId, decision });

  // Step 3: Fetch the HITL item (need item data before role validation)
  const ddb = await getTenantDdbClient(tenantId);

  const getResult = await ddb.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({
      PK: `TENANT#${tenantId}#HITL`,
      SK: `PENDING#${hitlItemId}`,
    }),
  }));

  if (!getResult.Item) {
    throw new ApprovalError(404, `HITL item not found: ${hitlItemId}`);
  }

  const item = unmarshall(getResult.Item);

  // Step 5: Extract taskToken + sfnExecutionArn
  const taskToken = item.taskToken as string;
  const sfnExecutionArn = (item.sfnExecutionArn as string) ?? undefined;

  // Step 6: Extract module from item
  const module = (item.module as string) ??
    (item.proposedAction as Record<string, unknown>)?.tool?.toString().split('-')[0] ??
    'unknown';

  // Step 7: Validate role — canApprove(role, module)
  if (!canApprove(role, module)) {
    logger.warn('Role lacks approval permission', { role, module, hitlItemId });
    throw new ApprovalError(403, `Role '${role}' cannot approve items in module '${module}'`);
  }

  // Step 4: Conditional UpdateItem — status to RESOLVING (AM-1 guard)
  const now = new Date().toISOString();
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({
        PK: `TENANT#${tenantId}#HITL`,
        SK: `PENDING#${hitlItemId}`,
      }),
      ConditionExpression: 'attribute_exists(PK) AND #status = :pending',
      UpdateExpression: 'SET #status = :resolving, resolvingAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: marshall({
        ':pending': 'PENDING',
        ':resolving': 'RESOLVING',
        ':now': now,
      }),
    }));
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new ApprovalError(409, `HITL item already resolved or being processed: ${hitlItemId}`);
    }
    throw err;
  }

  // Step 8: Branch on decision — send to SFN
  try {
    if (decision === 'APPROVE') {
      await sfnClient.send(new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({
          decision: 'APPROVE',
          approverSub,
          ...(editedPayload ? { editedPayload } : {}),
          ...(justification ? { justification } : {}),
        }),
      }));
    } else {
      // SEND_BACK
      await sfnClient.send(new SendTaskFailureCommand({
        taskToken,
        error: 'SENT_BACK',
        cause: justification ?? 'No reason provided',
      }));
    }
  } catch (err: unknown) {
    const errName = (err as { name?: string }).name ?? '';
    if (errName === 'TaskDoesNotExist' || errName === 'TaskTimedOut') {
      // Rollback: item remains in RESOLVING but SFN expired — mark as timed out
      throw new ApprovalError(410, `SFN task expired or does not exist for HITL item: ${hitlItemId}`);
    }
    throw err;
  }

  // Step 9: resolveHitlItem bookkeeping (removes GSI9, sets TTL)
  const resolution = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  await resolveHitlItem(tenantId, hitlItemId, resolution, approverSub);

  // Step 10: Publish audit event
  const detailType = decision === 'APPROVE' ? 'Hitl.Approved' : 'Hitl.SentBack';
  const standard = (item.standard as 'ISO9001' | 'ISO14001' | 'ISO45001') ?? 'ISO9001';
  const clauseRef = (item.proposedAction as Record<string, unknown>)?.tool?.toString() ?? 'unknown';

  await publishAuditEvent({
    tenantId,
    actor: approverSub,
    module,
    clauseRef,
    standard,
    detailType,
    source: 'cumplify.hitl.approval',
    payload: {
      hitlItemId,
      decision,
      justification: justification ?? null,
      editedPayload: editedPayload ?? null,
      sfnExecutionArn: sfnExecutionArn ?? null,
    },
  });

  logger.info('HITL approval complete', { hitlItemId, decision, resolution });

  // Step 11: Return HitlApprovalResult
  return {
    success: true,
    hitlItemId,
    decision,
    resolvedAt: now,
  };
}

/**
 * Typed error with HTTP-like status code for AppSync error mapping.
 */
class ApprovalError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.statusCode = statusCode;
  }
}
