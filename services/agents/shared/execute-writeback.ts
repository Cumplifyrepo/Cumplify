/**
 * ExecuteWriteback Lambda — invoked by Step Functions AFTER human approval.
 * The ONLY code path with RDS write permissions (via app_role, T4-F1).
 *
 * T-8a (BINDING): set_config('app.tenant_id', :tid, true) as the FIRST
 * statement of EVERY transaction (C-2/RLS scoping on the app_role path).
 *
 * T-8b (BINDING): this Lambda is invocable ONLY by the HITL state-machine role
 * (resource-based policy restricts invocation source).
 */

import {
  RDSDataClient,
  BeginTransactionCommand,
  ExecuteStatementCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'execute-writeback' });
const rds = new RDSDataClient({});
const eb = new EventBridgeClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.APP_ROLE_SECRET_ARN!; // T4-F1: app_role, NOT master
const DB_NAME = process.env.DB_NAME ?? 'cumplify';
const BUS_NAME = process.env.BUS_NAME ?? 'cumplify-events';

export interface WritebackInput {
  tenantId: string;
  agentName: string;
  proposedAction: { tool: string; args: Record<string, unknown> };
  approvalResult: {
    approved: boolean;
    approver: string;
    role: string;
    timestamp: string;
  };
  hitlItemId: string;
}

export async function handler(event: { Payload: WritebackInput }): Promise<{ status: string; auditEventId?: string }> {
  const input = event.Payload;
  const { tenantId, agentName, proposedAction, approvalResult } = input;

  if (!approvalResult.approved) {
    logger.info('Writeback rejected by human', { tenantId, agentName, hitlItemId: input.hitlItemId });
    return { status: 'REJECTED' };
  }

  logger.info('Executing approved writeback', {
    tenantId, agentName, tool: proposedAction.tool, approver: approvalResult.approver,
  });

  // Begin transaction
  const txnResult = await rds.send(new BeginTransactionCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DB_NAME,
  }));
  const transactionId = txnResult.transactionId!;

  try {
    // T-8a (BINDING, C-2): set_config FIRST — RLS scoping on the app_role path.
    // This MUST be the first statement in every transaction. Without it, RLS
    // would apply with an empty tenant context → queries return nothing or
    // bypass isolation (depending on policy). This is the RLS enforcement point.
    await rds.send(new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DB_NAME,
      transactionId,
      sql: "SELECT set_config('app.tenant_id', :tid, true)",
      parameters: [{ name: 'tid', value: { stringValue: tenantId } }],
    }));

    // Dispatch the tool-specific write (delegated to tool registry)
    const writeResult = await dispatchToolWrite(proposedAction, tenantId, transactionId);

    // Commit
    await rds.send(new CommitTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      transactionId,
    }));

    // Emit audit event (post-commit, via EventBridge → audit-sink → sealed trail)
    const actor = `agent:${agentName}+human:${approvalResult.approver}`;
    const auditEventId = await emitWritebackAuditEvent({
      tenantId, actor, agentName, proposedAction, writeResult,
    });

    logger.info('Writeback committed + audit emitted', {
      tenantId, agentName, tool: proposedAction.tool, auditEventId,
    });

    return { status: 'COMMITTED', auditEventId };
  } catch (err) {
    await rds.send(new RollbackTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      transactionId,
    })).catch(() => {}); // Best-effort rollback
    logger.error('Writeback failed, rolled back', { tenantId, error: (err as Error).message });
    throw err;
  }
}

/**
 * Dispatch the tool-specific SQL write.
 * Each tool maps to a specific INSERT/UPDATE on the appropriate RDS table.
 * Tool registry expanded per agent in Task 8 agent modules.
 */
async function dispatchToolWrite(
  action: { tool: string; args: Record<string, unknown> },
  tenantId: string,
  transactionId: string,
): Promise<Record<string, unknown>> {
  // Tool dispatch — each tool implements its specific SQL
  // This is the extensibility point: agent modules register their tools here.
  switch (action.tool) {
    case 'capa-open':
      return executeCapaOpen(action.args, tenantId, transactionId);
    case 'doc-publish':
      return executeDocPublish(action.args, tenantId, transactionId);
    case 'audit-finding-write':
      return executeAuditFindingWrite(action.args, tenantId, transactionId);
    case 'audit-checklist-gen':
      return executeChecklistGen(action.args, tenantId, transactionId);
    case 'ct-governance-write':
      return executeGovernanceWrite(action.args, tenantId, transactionId);
    default:
      throw new Error(`Unknown writeback tool: '${action.tool}'`);
  }
}

// ─── Tool-specific write implementations ────────────────────────────────────

async function executeCapaOpen(args: Record<string, unknown>, _tenantId: string, transactionId: string): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m2.corrective_actions (tenant_id, nc_id, action_desc, owner_id, status, created_by)
          VALUES (current_setting('app.tenant_id'), :ncId::uuid, :actionDesc, :ownerId, 'open', :actor)
          RETURNING *`,
    parameters: [
      { name: 'ncId', value: { stringValue: args.ncId as string } },
      { name: 'actionDesc', value: { stringValue: args.actionDesc as string } },
      { name: 'ownerId', value: { stringValue: args.suggestedOwnerId as string } },
      { name: 'actor', value: { stringValue: 'agent:CAPAGuru' } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeDocPublish(args: Record<string, unknown>, _tenantId: string, transactionId: string): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `UPDATE m1.documents SET status = 'approved', updated_at = NOW()
          WHERE id = :docId::uuid AND tenant_id = current_setting('app.tenant_id')
          RETURNING *`,
    parameters: [{ name: 'docId', value: { stringValue: args.docId as string } }],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeAuditFindingWrite(args: Record<string, unknown>, _tenantId: string, transactionId: string): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m3.audit_findings (tenant_id, audit_id, finding_type, clause_ref, description, created_by)
          VALUES (current_setting('app.tenant_id'), :auditId::uuid, :findingType, :clauseRef, :description, :actor)
          RETURNING *`,
    parameters: [
      { name: 'auditId', value: { stringValue: args.auditId as string } },
      { name: 'findingType', value: { stringValue: args.findingType as string } },
      { name: 'clauseRef', value: { stringValue: args.clauseRef as string } },
      { name: 'description', value: { stringValue: args.description as string } },
      { name: 'actor', value: { stringValue: 'agent:LeadAuditor' } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeChecklistGen(args: Record<string, unknown>, _tenantId: string, transactionId: string): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m3.audit_checklists (tenant_id, audit_id, clause_ref, question, expected_evidence)
          VALUES (current_setting('app.tenant_id'), :auditId::uuid, :clauseRef, :question, :evidence)
          RETURNING *`,
    parameters: [
      { name: 'auditId', value: { stringValue: args.auditId as string } },
      { name: 'clauseRef', value: { stringValue: args.clauseRef as string } },
      { name: 'question', value: { stringValue: args.question as string } },
      { name: 'evidence', value: { stringValue: args.expectedEvidence as string } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeGovernanceWrite(args: Record<string, unknown>, _tenantId: string, transactionId: string): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m1.roles_responsibilities (tenant_id, standard, role_name, responsibilities, authority, assigned_to)
          VALUES (current_setting('app.tenant_id'), :standard, :roleName, :responsibilities, :authority, :assignedTo)
          RETURNING *`,
    parameters: [
      { name: 'standard', value: { stringValue: args.standard as string } },
      { name: 'roleName', value: { stringValue: args.roleName as string } },
      { name: 'responsibilities', value: { stringValue: args.responsibilities as string } },
      { name: 'authority', value: { stringValue: args.authority as string } },
      { name: 'assignedTo', value: { stringValue: args.assignedTo as string } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function emitWritebackAuditEvent(opts: {
  tenantId: string;
  actor: string;
  agentName: string;
  proposedAction: { tool: string; args: Record<string, unknown> };
  writeResult: Record<string, unknown>;
}): Promise<string> {
  const eventId = `writeback-${Date.now()}`;
  await eb.send(new PutEventsCommand({
    Entries: [{
      EventBusName: BUS_NAME,
      Source: `cumplify.agent.${opts.agentName.toLowerCase()}`,
      DetailType: `Agent.WritebackCommitted`,
      Detail: JSON.stringify({
        tenantId: opts.tenantId,
        eventId,
        timestamp: new Date().toISOString(),
        actor: opts.actor,
        module: opts.agentName,
        clauseRef: 'agent-writeback',
        standard: 'ISO9001',
        auditTrail: true, // Routes to audit-sink FIFO → sealed trail
        payload: {
          before: null,
          after: { tool: opts.proposedAction.tool, result: opts.writeResult },
        },
      }),
    }],
  }));
  return eventId;
}
