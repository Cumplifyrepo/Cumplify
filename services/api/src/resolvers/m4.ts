/**
 * M4 Records Management resolver.
 * RDS system-of-record via Data API (app_role).
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany } from './shared.js';

const logger = new Logger({ serviceName: 'resolver-m4' });

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
    case 'registerRecord': return registerRecord(event, tenantId, sub);
    case 'recordCalibration': return recordCalibration(event, tenantId, sub);
    case 'createRetentionPolicy': return createRetentionPolicy(event, tenantId, sub);
    case 'getRecord': return getRecord(event, tenantId);
    case 'listCalibrationsDue': return listCalibrationsDue(event, tenantId);
    case 'getAuditTrail': return getAuditTrail(event, tenantId);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function registerRecord(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m4.records (tenant_id, standard, record_type, title, description, storage_location, retention_period_days, owner_id, status, created_by)
       VALUES (:tenantId, :standard, :recordType, :title, :description, :storageLoc, :retention, :actor, 'active', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'recordType', value: { stringValue: input.recordType as string } },
        { name: 'title', value: { stringValue: input.title as string } },
        { name: 'description', value: { stringValue: (input.description as string) ?? '' } },
        { name: 'storageLoc', value: { stringValue: (input.storageLocation as string) ?? '' } },
        { name: 'retention', value: { longValue: (input.retentionPeriodDays as number) ?? 2555 } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M4',
      clauseRef: 'ISO 9001 7.5.3', standard: 'ISO9001',
      detailType: 'Record.Registered', source: 'cumplify.m4.records',
      payload: { input },
    });
    logger.info('Record registered', { tenantId });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function recordCalibration(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m4.calibrations (tenant_id, equipment_id, calibration_date, next_due_date, result, certificate_ref, performed_by, created_by)
       VALUES (:tenantId, :equipmentId::uuid, :calibDate::timestamptz, :nextDue::timestamptz, :result, :certRef, :actor, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'equipmentId', value: { stringValue: input.equipmentId as string } },
        { name: 'calibDate', value: { stringValue: input.calibrationDate as string } },
        { name: 'nextDue', value: { stringValue: input.nextDueDate as string } },
        { name: 'result', value: { stringValue: (input.result as string) ?? 'pass' } },
        { name: 'certRef', value: { stringValue: (input.certificateRef as string) ?? '' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M4',
      clauseRef: 'ISO 9001 7.1.5.2', standard: 'ISO9001',
      detailType: 'Calibration.Recorded', source: 'cumplify.m4.records',
      payload: { equipmentId: input.equipmentId, result: input.result },
    });
    logger.info('Calibration recorded', { tenantId });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function createRetentionPolicy(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m4.retention_policies (tenant_id, record_type, retention_period_days, disposition_action, applies_to_standard, created_by)
       VALUES (:tenantId, :recordType, :retentionDays, :disposition, :standard, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'recordType', value: { stringValue: input.recordType as string } },
        { name: 'retentionDays', value: { longValue: input.retentionPeriodDays as number } },
        { name: 'disposition', value: { stringValue: (input.dispositionAction as string) ?? 'archive' } },
        { name: 'standard', value: { stringValue: (input.standard as string) ?? 'ISO9001' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M4',
      clauseRef: 'ISO 9001 7.5.3', standard: 'ISO9001',
      detailType: 'Record.RetentionPolicySet', source: 'cumplify.m4.records',
      payload: { recordType: input.recordType, retentionDays: input.retentionPeriodDays },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getRecord(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m4.records WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: event.arguments.id as string } }],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listCalibrationsDue(_event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT c.*, e.name as equipment_name FROM m4.calibrations c
       JOIN m4.equipment e ON e.id = c.equipment_id
       WHERE c.next_due_date <= (NOW() + INTERVAL '30 days')
       ORDER BY c.next_due_date ASC`,
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getAuditTrail(event: AppSyncEvent, tenantId: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m4.audit_trail
       WHERE entity_type = :entityType AND entity_id = :entityId::uuid
       ORDER BY event_time DESC`,
      [
        { name: 'entityType', value: { stringValue: input.entityType as string } },
        { name: 'entityId', value: { stringValue: input.entityId as string } },
      ],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}
