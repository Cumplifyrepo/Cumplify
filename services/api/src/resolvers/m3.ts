/**
 * M3 Audit Studio resolver.
 * RDS system-of-record via Data API (app_role).
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany } from './shared.js';
import { mapEnum, FINDING_TYPE_MAP } from './enum-mappings.js';

const logger = new Logger({ serviceName: 'resolver-m3' });

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
    case 'createAuditProgramme': return createAuditProgramme(event, tenantId, sub);
    case 'scheduleAudit': return scheduleAudit(event, tenantId, sub);
    case 'recordFinding': return recordFinding(event, tenantId, sub);
    case 'completeAudit': return completeAudit(event, tenantId, sub);
    case 'getAudit': return getAudit(event, tenantId);
    case 'getAuditReadiness': return getAuditReadiness(event, tenantId);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function createAuditProgramme(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m3.audit_programmes (tenant_id, standard, year, frequency_plan, status, created_by)
       VALUES (:tenantId, :standard, :year, :frequencyPlan, 'active', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'year', value: { longValue: input.year as number } },
        { name: 'frequencyPlan', value: input.frequencyPlan ? { stringValue: input.frequencyPlan as string } : { isNull: true } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M3',
      clauseRef: 'ISO 9001 9.2', standard: 'ISO9001',
      detailType: 'Audit.ProgrammeCreated', source: 'cumplify.m3.audit-studio',
      payload: { input },
    });
    logger.info('Audit programme created', { tenantId });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function scheduleAudit(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m3.audits (tenant_id, programme_id, standard, scope, lead_auditor_id, planned_date, status, created_by)
       VALUES (:tenantId, :programmeId::uuid, :standard, :scope, :leadAuditor, :plannedDate::timestamptz, 'planned', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'programmeId', value: { stringValue: input.programmeId as string } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'scope', value: { stringValue: input.scope as string } },
        { name: 'leadAuditor', value: { stringValue: input.leadAuditorId as string } },
        { name: 'plannedDate', value: { stringValue: input.plannedDate as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M3',
      clauseRef: 'ISO 9001 9.2', standard: 'ISO9001',
      detailType: 'Audit.Scheduled', source: 'cumplify.m3.audit-studio',
      payload: { programmeId: input.programmeId, scheduledDate: input.scheduledDate },
    });
    logger.info('Audit scheduled', { tenantId });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function recordFinding(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const findingType = mapEnum(FINDING_TYPE_MAP, input.findingType as string, 'findingType');
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m3.audit_findings (tenant_id, audit_id, checklist_id, finding_type, clause_ref, description, evidence_ref, created_by)
       VALUES (:tenantId, :auditId::uuid, :checklistId, :findingType, :clauseRef, :description, :evidenceRef, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'auditId', value: { stringValue: input.auditId as string } },
        { name: 'checklistId', value: input.checklistId ? { stringValue: input.checklistId as string } : { isNull: true } },
        { name: 'findingType', value: { stringValue: findingType } },
        { name: 'clauseRef', value: { stringValue: input.clauseRef as string } },
        { name: 'description', value: { stringValue: input.description as string } },
        { name: 'evidenceRef', value: input.evidenceRef ? { stringValue: input.evidenceRef as string } : { isNull: true } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M3',
      clauseRef: 'ISO 9001 9.2', standard: 'ISO9001',
      detailType: 'Audit.FindingRaised', source: 'cumplify.m3.audit-studio',
      payload: { auditId: input.auditId, findingType: input.findingType, severity: input.severity },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function completeAudit(event: AppSyncEvent, tenantId: string, actor: string) {
  const id = event.arguments.id as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m3.audits SET status = 'completed', actual_date = NOW(), updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [{ name: 'id', value: { stringValue: id } }],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M3',
      clauseRef: 'ISO 9001 9.2', standard: 'ISO9001',
      detailType: 'Audit.Completed', source: 'cumplify.m3.audit-studio',
      payload: { auditId: id },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getAudit(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m3.audits WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: event.arguments.id as string } }],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getAuditReadiness(event: AppSyncEvent, tenantId: string) {
  const standard = event.arguments.standard as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m3.audit_readiness_scores WHERE standard = :standard ORDER BY clause_ref ASC`,
      [{ name: 'standard', value: { stringValue: standard } }],
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}
