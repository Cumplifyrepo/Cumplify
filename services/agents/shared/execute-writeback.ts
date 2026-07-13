/**
 * ExecuteWriteback Lambda — invoked by Step Functions AFTER human approval.
 * The ONLY code path with RDS write permissions (via app_role, T4-F1).
 *
 * T-8a (BINDING): set_config('app.tenant_id', :tid, true) as the FIRST
 * statement of EVERY transaction (C-2/RLS scoping on the app_role path).
 *
 * T-8b (BINDING): this Lambda is invocable ONLY by the HITL state-machine role
 * (identity grant via grantInvoke — no resource-based policy).
 *
 * C-3 (Task 8R): SQL fixed against live migration schemas:
 *   - capa-open: includes due_date (NOT NULL in 003)
 *   - audit-checklist-gen: includes created_by (NOT NULL in 004)
 *   - audit-finding-write: maps finding_type hyphens→underscores at dispatch
 *   - ct-governance-write: BLOCKED-ON-DESIGN (no m1.roles_responsibilities table)
 *   - dispatch covers ALL HITL tools declared by handlers
 *
 * M-1 (Task 8R): BeginTransaction wrapped in Aurora resume-retry.
 * M-2 (Task 8R): created_by persists full actor (agent:<name>+human:<sub>).
 *
 * H-3 (Task 8R): uses publishAuditEvent from eventing publisher (ULID, registry).
 */

import {
  RDSDataClient,
  BeginTransactionCommand,
  ExecuteStatementCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} from '@aws-sdk/client-rds-data';
import { Logger } from '@aws-lambda-powertools/logger';
import { publish } from '../../eventing/src/publisher.js';
import { ulid } from 'ulid';

const logger = new Logger({ serviceName: 'execute-writeback' });
const rds = new RDSDataClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.APP_ROLE_SECRET_ARN!; // T4-F1: app_role, NOT master
const DB_NAME = process.env.DB_NAME ?? 'postgres'; // C-3e: must match api-core
const BUS_NAME = process.env.BUS_NAME ?? 'cumplify-events';

export interface WritebackInput {
  tenantId: string;
  agentName: string;
  proposedAction: { tool: string; args: Record<string, unknown> };
  /**
   * SendTaskSuccess output from the approval Lambda — the owner-signed
   * frontend-app design §2.3 step 7a contract:
   * { decision:'APPROVE', approverSub, editedPayload?, justification? }.
   * (BUG-15: this module previously expected {approved, approver, role,
   * timestamp} — a shape only Task 11's hand-crafted CLI callback ever sent —
   * so every real human APPROVE was silently treated as rejected.)
   */
  approvalResult: {
    decision: 'APPROVE' | 'SEND_BACK';
    approverSub: string;
    justification?: string;
    editedPayload?: Record<string, unknown>;
  };
  hitlItemId: string;
}

// ─── Aurora resume-retry (M-1, ACC-1 pattern) ────────────────────────────────
// First call after 0-ACU auto-pause throws DatabaseResumingException.
const MAX_RESUME_RETRIES = 3;
const RESUME_DELAY_MS = 15_000;

async function withResumeRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RESUME_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      const name = (err as { name?: string }).name ?? '';
      const isDatabaseResuming =
        msg.includes('Communications link failure') ||
        msg.includes('DatabaseResumingException') ||
        name === 'DatabaseResumingException' ||
        msg.includes('Timed out');

      if (isDatabaseResuming && attempt < MAX_RESUME_RETRIES) {
        logger.warn('Aurora resuming from auto-pause — retrying', { attempt });
        await new Promise(resolve => setTimeout(resolve, RESUME_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

// ─── Finding type mapping (C-3d) ────────────────────────────────────────────
// The model prompt uses hyphenated values (major-nc, minor-nc) but the DB
// CHECK constraint requires underscored values (major_nc, minor_nc).
// Map at the dispatch layer — do NOT re-prompt the model.
const FINDING_TYPE_MAP: Record<string, string> = {
  'major-nc': 'major_nc',
  'minor-nc': 'minor_nc',
  'observation': 'observation',
  'ofi': 'ofi',
};

function mapFindingType(raw: string): string {
  const mapped = FINDING_TYPE_MAP[raw];
  if (!mapped) {
    throw new Error(`Invalid finding_type: '${raw}'. Expected: ${Object.keys(FINDING_TYPE_MAP).join(', ')}`);
  }
  return mapped;
}

export async function handler(event: WritebackInput | { Payload: WritebackInput }): Promise<{ status: string; auditEventId?: string }> {
  // Task-11 hotfix: the SFN lambda:invoke integration with `'Payload.$': '$'`
  // delivers the STATE as the event — there is no {Payload:...} wrapper on
  // input (the wrapper exists only in state OUTPUT). Accept both shapes.
  const input: WritebackInput = 'Payload' in event ? event.Payload : event;
  const { tenantId, agentName, proposedAction, approvalResult } = input;

  if (approvalResult.decision !== 'APPROVE') {
    logger.info('Writeback rejected by human', { tenantId, agentName, hitlItemId: input.hitlItemId });
    return { status: 'REJECTED' };
  }

  // M-2: full actor identity for provenance (persists into DB rows + audit)
  const actor = `agent:${agentName}+human:${approvalResult.approverSub}`;

  // Approve-with-edits: the approver's editedPayload overrides the agent's
  // proposed args field-by-field (design §2.3 — edits ride the task token,
  // never the DDB item).
  const effectiveAction = approvalResult.editedPayload
    ? { ...proposedAction, args: { ...proposedAction.args, ...approvalResult.editedPayload } }
    : proposedAction;

  logger.info('Executing approved writeback', {
    tenantId, agentName, tool: effectiveAction.tool, approver: approvalResult.approverSub,
    edited: Boolean(approvalResult.editedPayload),
  });

  // M-1: Begin transaction with Aurora resume-retry
  const txnResult = await withResumeRetry(() => rds.send(new BeginTransactionCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DB_NAME,
  })));
  const transactionId = txnResult.transactionId!;

  try {
    // T-8a (BINDING, C-2): set_config FIRST — RLS scoping on the app_role path.
    await rds.send(new ExecuteStatementCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      database: DB_NAME,
      transactionId,
      sql: "SELECT set_config('app.tenant_id', :tid, true)",
      parameters: [{ name: 'tid', value: { stringValue: tenantId } }],
    }));

    // Dispatch the tool-specific write
    const writeResult = await dispatchToolWrite(effectiveAction, tenantId, transactionId, actor);

    // Commit
    await rds.send(new CommitTransactionCommand({
      resourceArn: CLUSTER_ARN,
      secretArn: SECRET_ARN,
      transactionId,
    }));

    // H-3: Emit audit event via publishAuditEvent (registered, ULID, correct standard)
    const standard = resolveStandard(effectiveAction);
    const auditEventId = await emitWritebackAuditEvent({
      tenantId, actor, agentName, proposedAction: effectiveAction, writeResult, standard,
    });

    logger.info('Writeback committed + audit emitted', {
      tenantId, agentName, tool: effectiveAction.tool, auditEventId,
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
 * Resolve the ISO standard from the proposed action context.
 * H-3: never hardcode 'ISO9001' — derive from tool args or agent context.
 * Normalizes model output (e.g., "ISO 9001:2015", "iso 14001") to enum values.
 */
function resolveStandard(proposedAction: { tool: string; args: Record<string, unknown> }): 'ISO9001' | 'ISO14001' | 'ISO45001' {
  const raw = proposedAction.args.standard as string | undefined;
  if (raw) {
    const normalized = normalizeStandard(raw);
    if (normalized) return normalized;
  }
  // Default per tool's owning module
  const toolModuleMap: Record<string, 'ISO9001' | 'ISO14001' | 'ISO45001'> = {
    'capa-open': 'ISO9001',
    'capa-verify-effectiveness': 'ISO9001',
    'doc-publish': 'ISO9001',
    'doc-version-control': 'ISO9001',
    'audit-finding-write': 'ISO9001',
    'audit-checklist-gen': 'ISO9001',
    'records-retention-schedule': 'ISO9001',
  };
  return toolModuleMap[proposedAction.tool] ?? 'ISO9001';
}

/**
 * Normalize free-text standard references to canonical enum values.
 * Handles: "ISO 9001:2015", "ISO9001", "iso 14001", "ISO 45001:2018", etc.
 */
function normalizeStandard(raw: string): 'ISO9001' | 'ISO14001' | 'ISO45001' | null {
  const stripped = raw.replace(/[\s:-]/g, '').toUpperCase();
  if (stripped.includes('45001')) return 'ISO45001';
  if (stripped.includes('14001')) return 'ISO14001';
  if (stripped.includes('9001')) return 'ISO9001';
  return null;
}

/**
 * Dispatch the tool-specific SQL write.
 * C-3 (Task 8R): covers ALL HITL-gated tools declared by handlers.
 * ct-governance-write is BLOCKED-ON-DESIGN — throws with a clear message.
 */
async function dispatchToolWrite(
  action: { tool: string; args: Record<string, unknown> },
  tenantId: string,
  transactionId: string,
  actor: string,
): Promise<Record<string, unknown>> {
  switch (action.tool) {
    case 'capa-open':
      return executeCapaOpen(action.args, tenantId, transactionId, actor);
    case 'capa-verify-effectiveness':
      return executeCapaVerifyEffectiveness(action.args, tenantId, transactionId, actor);
    case 'doc-publish':
      return executeDocPublish(action.args, tenantId, transactionId);
    case 'doc-version-control':
      return executeDocVersionControl(action.args, tenantId, transactionId, actor);
    case 'audit-finding-write':
      return executeAuditFindingWrite(action.args, tenantId, transactionId, actor);
    case 'audit-checklist-gen':
      return executeChecklistGen(action.args, tenantId, transactionId, actor);
    case 'records-retention-schedule':
      return executeRecordsRetentionSchedule(action.args, tenantId, transactionId, actor);
    case 'ct-governance-write':
      // C-3c: BLOCKED-ON-DESIGN — m1.roles_responsibilities does not exist in any migration.
      // Pending architect design ruling on the correct corpus target table.
      throw new Error(
        `Tool 'ct-governance-write' is BLOCKED-ON-DESIGN: target table m1.roles_responsibilities ` +
        `does not exist in migrations. Requires architect design ruling before implementation.`,
      );
    default:
      throw new Error(`Unknown writeback tool: '${action.tool}'`);
  }
}

// ─── Tool-specific write implementations ────────────────────────────────────

async function executeCapaOpen(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  // C-3a: includes due_date (NOT NULL, no default in 003_m2_capa.sql:41)
  // M-2: created_by = full actor (agent:<name>+human:<sub>)
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m2.corrective_actions (tenant_id, nc_id, action_desc, owner_id, due_date, status, created_by)
          VALUES (current_setting('app.tenant_id'), :ncId::uuid, :actionDesc, :ownerId, :dueDate::timestamptz, 'open', :actor)
          RETURNING id, status, due_date`,
    parameters: [
      { name: 'ncId', value: { stringValue: args.ncId as string } },
      { name: 'actionDesc', value: { stringValue: args.actionDesc as string } },
      { name: 'ownerId', value: { stringValue: args.suggestedOwnerId as string } },
      { name: 'dueDate', value: { stringValue: args.dueDate as string } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeCapaVerifyEffectiveness(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m2.capa_effectiveness_checks (tenant_id, corrective_action_id, verification_method, verified_by, verified_at, effective, created_by)
          VALUES (current_setting('app.tenant_id'), :capaId::uuid, :verificationMethod, :verifiedBy, NOW(), :effective::boolean, :actor)
          RETURNING id, effective`,
    parameters: [
      { name: 'capaId', value: { stringValue: args.capaId as string } },
      { name: 'verificationMethod', value: { stringValue: args.verificationMethod as string } },
      { name: 'verifiedBy', value: { stringValue: actor } },
      { name: 'effective', value: { stringValue: String(args.effective) } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeDocPublish(
  args: Record<string, unknown>, _tenantId: string, transactionId: string,
): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `UPDATE m1.documents SET status = 'approved', updated_at = NOW()
          WHERE id = :docId::uuid AND tenant_id = current_setting('app.tenant_id')
          RETURNING id, status`,
    parameters: [{ name: 'docId', value: { stringValue: args.docId as string } }],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeDocVersionControl(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m1.document_versions (tenant_id, document_id, version_no, content_ref, change_summary, author_id, created_by)
          VALUES (current_setting('app.tenant_id'), :docId::uuid, :versionNo::integer, :contentRef, :changeSummary, :authorId, :actor)
          RETURNING id, version_no`,
    parameters: [
      { name: 'docId', value: { stringValue: args.docId as string } },
      { name: 'versionNo', value: { stringValue: String(args.newVersion ?? '1') } },
      { name: 'contentRef', value: { stringValue: (args.contentRef as string) ?? '' } },
      { name: 'changeSummary', value: { stringValue: args.changeDescription as string } },
      { name: 'authorId', value: { stringValue: actor } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeAuditFindingWrite(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  // C-3d: map finding_type hyphens→underscores at dispatch layer (not by re-prompting model)
  const findingType = mapFindingType(args.findingType as string);
  // M-2: created_by = full actor
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m3.audit_findings (tenant_id, audit_id, finding_type, clause_ref, description, created_by)
          VALUES (current_setting('app.tenant_id'), :auditId::uuid, :findingType, :clauseRef, :description, :actor)
          RETURNING id, finding_type`,
    parameters: [
      { name: 'auditId', value: { stringValue: args.auditId as string } },
      { name: 'findingType', value: { stringValue: findingType } },
      { name: 'clauseRef', value: { stringValue: (args.clauseRef ?? args.clause) as string } },
      { name: 'description', value: { stringValue: args.description as string } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeChecklistGen(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  // C-3b: includes created_by (NOT NULL in 004_m3_audit_studio.sql:41)
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m3.audit_checklists (tenant_id, audit_id, clause_ref, question, expected_evidence, created_by)
          VALUES (current_setting('app.tenant_id'), :auditId::uuid, :clauseRef, :question, :evidence, :actor)
          RETURNING id`,
    parameters: [
      { name: 'auditId', value: { stringValue: args.auditId as string } },
      { name: 'clauseRef', value: { stringValue: args.clauseRef as string } },
      { name: 'question', value: { stringValue: args.question as string } },
      { name: 'evidence', value: { stringValue: (args.expectedEvidence ?? args.checklistItems ?? '') as string } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

async function executeRecordsRetentionSchedule(
  args: Record<string, unknown>, _tenantId: string, transactionId: string, actor: string,
): Promise<Record<string, unknown>> {
  // records-retention-schedule modifies retention policy metadata in m4
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN, secretArn: SECRET_ARN, database: DB_NAME, transactionId,
    sql: `INSERT INTO m4.retention_policies (tenant_id, record_category, retention_period, justification, created_by)
          VALUES (current_setting('app.tenant_id'), :category, :retentionPeriod, :justification, :actor)
          ON CONFLICT (tenant_id, record_category) DO UPDATE SET
            retention_period = EXCLUDED.retention_period,
            justification = EXCLUDED.justification,
            updated_at = NOW()
          RETURNING record_category, retention_period`,
    parameters: [
      { name: 'category', value: { stringValue: args.category as string } },
      { name: 'retentionPeriod', value: { stringValue: args.retentionPeriod as string } },
      { name: 'justification', value: { stringValue: args.justification as string } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  }));
  return { records: result.records?.length ?? 0 };
}

/**
 * H-3 (Task 8R): Emit audit event via the registered publisher.
 * Uses publishAuditEvent pattern: ULID eventId, registered detailType,
 * standard from proposedAction context, full actor identity.
 */
async function emitWritebackAuditEvent(opts: {
  tenantId: string;
  actor: string;
  agentName: string;
  proposedAction: { tool: string; args: Record<string, unknown> };
  writeResult: Record<string, unknown>;
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
}): Promise<string> {
  const eventId = ulid(); // H-3: ULID — avoids FIFO dedup collision risk from timestamp-based IDs
  const moduleMap: Record<string, string> = {
    'capa-open': 'M2', 'capa-verify-effectiveness': 'M2',
    'doc-publish': 'M1', 'doc-version-control': 'M1',
    'audit-finding-write': 'M3', 'audit-checklist-gen': 'M3',
    'records-retention-schedule': 'M4', 'ct-governance-write': 'cross-standard',
  };
  const module = moduleMap[opts.proposedAction.tool] ?? opts.agentName;

  await publish({
    busName: BUS_NAME,
    source: `cumplify.agent.${opts.agentName.toLowerCase()}`,
    detailType: 'Agent.WritebackCommitted',
    event: {
      tenantId: opts.tenantId,
      eventId,
      timestamp: new Date().toISOString(),
      actor: opts.actor,
      module,
      clauseRef: 'agent-writeback',
      standard: opts.standard,
      payload: {
        before: null,
        after: { tool: opts.proposedAction.tool, result: opts.writeResult },
      },
    },
  });

  return eventId;
}
