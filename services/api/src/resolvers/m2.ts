/**
 * M2 CAPA (Corrective & Preventive Action) resolver.
 * RDS system-of-record via Data API (app_role).
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany } from './shared.js';
import { mapEnum, NC_SOURCE_MAP, NC_TYPE_MAP, SEVERITY_MAP, DISPOSITION_MAP } from './enum-mappings.js';

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
    case 'listNonconformities': return listNonconformities(event, tenantId);
    case 'listOpenCAPAs': return listOpenCAPAs(event, tenantId);
    case 'listCorrectiveActions': return listCorrectiveActions(event, tenantId);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function raiseNonconformity(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const source = mapEnum(NC_SOURCE_MAP, input.source as string, 'source');
  const ncType = mapEnum(NC_TYPE_MAP, input.ncType as string, 'ncType');
  const severity = mapEnum(SEVERITY_MAP, input.severity as string, 'severity');
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m2.nonconformities (tenant_id, standard, source, nc_type, description, clause_ref, severity, status, raised_by, raised_at, created_by)
       VALUES (:tenantId, :standard, :source, :ncType, :description, :clauseRef, :severity, 'open', :actor, NOW(), :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'source', value: { stringValue: source } },
        { name: 'ncType', value: { stringValue: ncType } },
        { name: 'description', value: { stringValue: input.description as string } },
        { name: 'clauseRef', value: { stringValue: input.clauseRef as string } },
        { name: 'severity', value: { stringValue: severity } },
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
    return marshalOne(result);
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
    return marshalOne(result);
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
    return marshalOne(result);
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
    return marshalOne(result);
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
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function disposeNonconformingOutput(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const disposition = mapEnum(DISPOSITION_MAP, input.disposition as string, 'disposition');
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m2.nonconforming_outputs (tenant_id, nc_id, disposition, authorized_by, created_by)
       VALUES (:tenantId, :ncId::uuid, :disposition, :actor, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'ncId', value: { stringValue: input.ncId as string } },
        { name: 'disposition', value: { stringValue: disposition } },
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
    return marshalOne(result);
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
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listOpenCAPAs(event: AppSyncEvent, tenantId: string) {
  // FIXED 2026-07-13 (architect): previous SQL referenced nc.title (column
  // does not exist) and joined on ca.nonconformity_id (column is nc_id) —
  // the query errored on every live call. Filters (standard, severity) are
  // declared in the schema and honored here; both live on the NC row.
  const clauses: string[] = [`ca.status IN ('open', 'in_progress')`];
  const params: Array<{ name: string; value: { stringValue: string } }> = [];
  const standard = event.arguments.standard as string | undefined;
  const severity = event.arguments.severity as string | undefined;
  if (standard) {
    clauses.push('nc.standard = :standard');
    params.push({ name: 'standard', value: { stringValue: standard } });
  }
  if (severity) {
    clauses.push('nc.severity = :severity');
    params.push({ name: 'severity', value: { stringValue: mapEnum(SEVERITY_MAP, severity, 'severity') } });
  }
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT ca.* FROM m2.corrective_actions ca
       JOIN m2.nonconformities nc ON nc.id = ca.nc_id
       WHERE ${clauses.join(' AND ')} ORDER BY ca.due_date ASC`,
      params,
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listNonconformities(event: AppSyncEvent, tenantId: string) {
  const clauses: string[] = [];
  const params: Array<{ name: string; value: { stringValue: string } }> = [];
  const standard = event.arguments.standard as string | undefined;
  const severity = event.arguments.severity as string | undefined;
  if (standard) {
    clauses.push('standard = :standard');
    params.push({ name: 'standard', value: { stringValue: standard } });
  }
  if (severity) {
    clauses.push('severity = :severity');
    params.push({ name: 'severity', value: { stringValue: mapEnum(SEVERITY_MAP, severity, 'severity') } });
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m2.nonconformities ${where} ORDER BY raised_at DESC`,
      params,
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listCorrectiveActions(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m2.corrective_actions WHERE nc_id = :ncId::uuid ORDER BY created_at ASC`,
      [{ name: 'ncId', value: { stringValue: event.arguments.ncId as string } }],
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}
