/**
 * M4 Records Management resolver.
 * RDS system-of-record via Data API (app_role).
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany, getTenantDdbClient, TABLE_NAME } from './shared.js';

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
      `INSERT INTO m4.records (tenant_id, standard, record_type, source_module, retention_class, s3_object_ref, created_by)
       VALUES (:tenantId, :standard, :recordType, :sourceModule, :retentionClass, :s3ObjectRef, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'recordType', value: { stringValue: input.recordType as string } },
        { name: 'sourceModule', value: { stringValue: input.sourceModule as string } },
        { name: 'retentionClass', value: input.retentionClass ? { stringValue: input.retentionClass as string } : { isNull: true } },
        { name: 's3ObjectRef', value: input.s3ObjectRef ? { stringValue: input.s3ObjectRef as string } : { isNull: true } },
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
  // NOTE (architect 2026-07-14): measuring_resource_id is FK-constrained to
  // m4.measuring_resources(id) (migrations/005:33-43), and there is currently
  // NO mutation anywhere in the schema to create a measuring_resources row.
  // This call will throw a foreign-key violation until either a
  // registerMeasuringResource mutation is added, or resources are seeded
  // out-of-band. Flagged, not coded around (BLOCKED-ON-OWNER-2).
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m4.calibration_records (tenant_id, measuring_resource_id, calibrated_at, next_due, standard_used, traceability_ref, result, created_by)
       VALUES (:tenantId, :measuringResourceId::uuid, NOW(), :nextDue::timestamptz, :standardUsed, :traceabilityRef, :result, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'measuringResourceId', value: { stringValue: input.measuringResourceId as string } },
        { name: 'nextDue', value: { stringValue: input.nextDue as string } },
        { name: 'standardUsed', value: { stringValue: input.standardUsed as string } },
        { name: 'traceabilityRef', value: input.traceabilityRef ? { stringValue: input.traceabilityRef as string } : { isNull: true } },
        { name: 'result', value: { stringValue: input.result as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M4',
      clauseRef: 'ISO 9001 7.1.5.2', standard: 'ISO9001',
      detailType: 'Calibration.Recorded', source: 'cumplify.m4.records',
      payload: { measuringResourceId: input.measuringResourceId, result: input.result },
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
      `INSERT INTO m4.retention_policies (tenant_id, record_type, retention_years, disposition_rule, created_by)
       VALUES (:tenantId, :recordType, :retentionYears, :dispositionRule, :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'recordType', value: { stringValue: input.recordType as string } },
        { name: 'retentionYears', value: { longValue: input.retentionYears as number } },
        { name: 'dispositionRule', value: { stringValue: input.dispositionRule as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M4',
      clauseRef: 'ISO 9001 7.5.3', standard: 'ISO9001',
      detailType: 'Record.RetentionPolicySet', source: 'cumplify.m4.records',
      payload: { recordType: input.recordType, retentionYears: input.retentionYears },
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

async function listCalibrationsDue(event: AppSyncEvent, tenantId: string) {
  const windowDays = event.arguments.windowDays as number;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m4.calibration_records
       WHERE next_due <= (NOW() + make_interval(days => :windowDays::int))
       ORDER BY next_due ASC`,
      [{ name: 'windowDays', value: { longValue: windowDays } }],
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

/**
 * getAuditTrail — reads the real audit ledger (services/audit-trail,
 * DynamoDB CumplifyCore, PK=TENANT#<id>#AUDITLOG) via the tenant-data role.
 * The ledger has no entityId attribute (events are appended per-tenant,
 * chronologically hash-chained — see services/audit-trail/src/appender.ts) —
 * there is no GSI to look up "events for entity X" directly. Interim
 * approach: query the tenant's partition (most recent first, capped) and
 * match entityId against the serialized payload, since every publisher puts
 * the relevant row id somewhere in payload under an inconsistent key name
 * (policyId, riskId, versionId, ncId, ...). A normalized entityId attribute
 * + GSI is the correct long-term fix but touches every publishAuditEvent
 * call site — flagged for a follow-up, not attempted here.
 */
async function getAuditTrail(event: AppSyncEvent, tenantId: string) {
  const entityId = event.arguments.entityId as string;
  const ddb = await getTenantDdbClient(tenantId);
  const pk = `TENANT#${tenantId}#AUDITLOG`;
  const matches: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  let pages = 0;

  do {
    const resp = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: pk } },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey as never,
    }));
    for (const raw of resp.Items ?? []) {
      const item = unmarshall(raw);
      if (JSON.stringify(item.payload ?? {}).includes(entityId)) {
        matches.push({
          tenantId,
          eventId: item.eventId,
          eventType: item.eventType,
          actor: item.actor,
          module: item.module,
          clauseRef: item.clauseRef,
          standard: item.standard,
          timestamp: item.eventTimestamp,
          payloadHash: item.payloadHash,
          prevHash: item.prevHash ?? null,
          payload: item.payload ?? null,
        });
      }
    }
    lastKey = resp.LastEvaluatedKey as Record<string, unknown> | undefined;
    pages += 1;
  } while (lastKey && pages < 10);

  return matches;
}
