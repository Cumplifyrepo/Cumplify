/**
 * M2 CAPA (Corrective & Preventive Action) resolver.
 * RDS system-of-record via Data API (app_role).
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent } from './shared.js';

const logger = new Logger({ serviceName: 'resolver-m2' });

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
    case 'raiseNonconformity': return raiseNonconformity(event, tenantId, sub);
    case 'recordRootCause': return recordRootCause(event, tenantId, sub);
    case 'createCorrectiveAction': return createCorrectiveAction(event, tenantId, sub);
    case 'closeCapa': return closeCapa(event, tenantId, sub);
    case 'verifyEffectiveness': return verifyEffectiveness(event, tenantId, sub);
    case 'disposeNonconformingOutput': return disposeNonconformingOutput(event, tenantId, sub);
    case 'getNonconformity': return getNonconformity(event, tenantId);
    case 'listOpenCAPAs': return listOpenCAPAs(event, tenantId);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function raiseNonconformity(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m2.nonconformities (tenant_id, standard, title, description, source, severity, detected_by, status, created_by)
       VALUES (:tenantId, :standard, :title, :description, :source, :severity, :actor, 'open', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'title', value: { stringValue: input.title as string } },
        { name: 'description', value: { stringValue: input.description as string } },
        { name: 'source', value: { stringValue: (input.source as string) ?? 'manual' } },
        { name: 'severity', value: { stringValue: (input.severity as string) ?? 'minor' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 10.2', standard: 'ISO9001',
      detailType: 'NC.Raised', source: 'cumplify.m2.capa',
      payload: { input },
    });
    logger.info('Nonconformity raised', { tenantId });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function recordRootCause(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m2.nonconformities SET root_cause = :rootCause, root_cause_method = :method, updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [
        { name: 'id', value: { stringValue: input.nonconformityId as string } },
        { name: 'rootCause', value: { stringValue: input.rootCause as string } },
        { name: 'method', value: { stringValue: (input.method as string) ?? '5-why' } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 10.2', standard: 'ISO9001',
      detailType: 'CAPA.RootCauseRecorded', source: 'cumplify.m2.capa',
      payload: { nonconformityId: input.nonconformityId, rootCause: input.rootCause },
    });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function createCorrectiveAction(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m2.corrective_actions (tenant_id, nonconformity_id, action_desc, owner_id, due_date, status, created_by)
       VALUES (:tenantId, :ncId::uuid, :actionDesc, :ownerId, :dueDate::timestamptz, 'open', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'ncId', value: { stringValue: input.nonconformityId as string } },
        { name: 'actionDesc', value: { stringValue: input.actionDesc as string } },
        { name: 'ownerId', value: { stringValue: (input.ownerId as string) ?? actor } },
        { name: 'dueDate', value: { stringValue: input.dueDate as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 10.2', standard: 'ISO9001',
      detailType: 'CAPA.Opened', source: 'cumplify.m2.capa',
      payload: { nonconformityId: input.nonconformityId, input },
    });
    logger.info('Corrective action created', { tenantId });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function closeCapa(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m2.corrective_actions SET status = 'closed', closed_at = NOW(), closed_by = :actor, updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [
        { name: 'id', value: { stringValue: input.capaId as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 10.2', standard: 'ISO9001',
      detailType: 'CAPA.Closed', source: 'cumplify.m2.capa',
      payload: { capaId: input.capaId },
    });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function verifyEffectiveness(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m2.corrective_actions SET effectiveness_verified = true, effectiveness_notes = :notes, verified_by = :actor, verified_at = NOW(), updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [
        { name: 'id', value: { stringValue: input.capaId as string } },
        { name: 'notes', value: { stringValue: (input.notes as string) ?? '' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 10.2', standard: 'ISO9001',
      detailType: 'CAPA.EffectivenessVerified', source: 'cumplify.m2.capa',
      payload: { capaId: input.capaId, notes: input.notes },
    });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function disposeNonconformingOutput(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m2.nonconforming_output_dispositions (tenant_id, nonconformity_id, disposition, justification, disposed_by, created_by)
       VALUES (:tenantId, :ncId::uuid, :disposition, :justification, :actor, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'ncId', value: { stringValue: input.nonconformityId as string } },
        { name: 'disposition', value: { stringValue: input.disposition as string } },
        { name: 'justification', value: { stringValue: (input.justification as string) ?? '' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M2',
      clauseRef: 'ISO 9001 8.7', standard: 'ISO9001',
      detailType: 'CAPA.OutputDisposed', source: 'cumplify.m2.capa',
      payload: { nonconformityId: input.nonconformityId, disposition: input.disposition },
    });
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function getNonconformity(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m2.nonconformities WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: event.arguments.id as string } }],
    );
    await txn.commit();
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}

async function listOpenCAPAs(_event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT ca.*, nc.title as nc_title FROM m2.corrective_actions ca
       JOIN m2.nonconformities nc ON nc.id = ca.nonconformity_id
       WHERE ca.status = 'open' ORDER BY ca.due_date ASC`,
    );
    await txn.commit();
    return result;
  } catch (err) { await txn.rollback(); throw err; }
}
