/**
 * M5 Risk Management resolver.
 * Exercises BOTH isolation paths: RDS (system-of-record) + DDB (metadata).
 * risk_register_view accessed via get_risk_register_view() ONLY (never direct SELECT).
 *
 * C-2 INVARIANT: set_config('app.tenant_id', :tenantId, true) is ALWAYS the
 * FIRST statement in every BeginTransaction. Never false. Never bare ExecuteStatement.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import {
  extractContext,
  beginTenantTransaction,
  publishAuditEvent,
  marshalOne,
  marshalMany,
} from './shared.js';
import { mapEnum, RISK_CATEGORY_MAP } from './enum-mappings.js';

const logger = new Logger({ serviceName: 'resolver-m5' });

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

export async function handler(event: AppSyncEvent): Promise<unknown> {
  const ctx = extractContext(event);
  const { tenantId, sub } = ctx;
  logger.appendKeys({ tenantId, requestField: event.info.fieldName });

  const fieldName = event.info.fieldName;

  switch (fieldName) {
    case 'createRisk':
      return createRisk(event, tenantId, sub);
    case 'addRiskTreatment':
      return addRiskTreatment(event, tenantId, sub);
    case 'createChangePlan':
      return createChangePlan(event, tenantId, sub);
    case 'getRisk':
      return getRisk(event, tenantId);
    case 'getCrossRegisterRiskView':
      return getCrossRegisterRiskView(tenantId);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}

async function createRisk(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const category = mapEnum(RISK_CATEGORY_MAP, input.category as string, 'category');
  const ownerId = (input.ownerId as string) ?? actor; // NOT NULL — fall back to actor
  const txn = await beginTenantTransaction(tenantId);

  try {
    const result = await txn.execute(
      `INSERT INTO m5.risks (tenant_id, standard, category, description, likelihood, severity, treatment, owner_id, status, created_by)
       VALUES (:tenantId, :standard, :category, :description, :likelihood, :severity, :treatment, :ownerId, 'open', :actor)
       RETURNING id, tenant_id, standard, category, description, likelihood, severity, risk_rating, treatment, owner_id, status, created_at`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } }, // verbatim ISO9001/14001/45001
        { name: 'category', value: { stringValue: category } }, // mapped to lowercase
        { name: 'description', value: { stringValue: input.description as string } },
        { name: 'likelihood', value: { longValue: input.likelihood as number } },
        { name: 'severity', value: { longValue: input.severity as number } },
        { name: 'treatment', value: { stringValue: (input.treatment as string) ?? '' } },
        { name: 'ownerId', value: { stringValue: ownerId } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();

    const risk = marshalOne(result);

    // Publish audit event with REAL id from INSERT result (BUG-B fix)
    await publishAuditEvent({
      tenantId, actor, module: 'M5',
      clauseRef: 'ISO 9001 6.1', standard: 'ISO9001',
      detailType: 'Risk.Created', source: 'cumplify.m5.risk',
      payload: { riskId: risk?.id, category, description: input.description },
    });

    logger.info('Risk created', { tenantId, riskId: risk?.id });
    return risk;
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

async function addRiskTreatment(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);

  try {
    const result = await txn.execute(
      `INSERT INTO m5.risk_treatments (tenant_id, risk_id, action_desc, owner_id, due_date, status, created_by)
       VALUES (:tenantId, :riskId::uuid, :actionDesc, :ownerId, :dueDate::timestamptz, 'open', :actor)
       RETURNING id, risk_id, tenant_id, action_desc, owner_id, due_date, status, created_at`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'riskId', value: { stringValue: input.riskId as string } },
        { name: 'actionDesc', value: { stringValue: input.actionDesc as string } },
        { name: 'ownerId', value: { stringValue: input.ownerId as string } },
        { name: 'dueDate', value: { stringValue: input.dueDate as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();

    await publishAuditEvent({
      tenantId, actor, module: 'M5',
      clauseRef: 'ISO 9001 6.1', standard: 'ISO9001',
      detailType: 'Risk.TreatmentAdded', source: 'cumplify.m5.risk',
      payload: { riskId: input.riskId, input },
    });

    return marshalOne(result);
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

async function createChangePlan(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);

  try {
    const result = await txn.execute(
      `INSERT INTO m5.change_plans (tenant_id, standard, change_desc, impact_assessment, approval_status, created_by)
       VALUES (:tenantId, :standard, :changeDesc, :impact, 'draft', :actor)
       RETURNING id, tenant_id, standard, change_desc, impact_assessment, approval_status, created_at`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'changeDesc', value: { stringValue: input.changeDesc as string } },
        { name: 'impact', value: { stringValue: (input.impactAssessment as string) ?? '' } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();

    await publishAuditEvent({
      tenantId, actor, module: 'M5',
      clauseRef: 'ISO 9001 6.3', standard: 'ISO9001',
      detailType: 'Change.Planned', source: 'cumplify.m5.risk',
      payload: { input },
    });

    return marshalOne(result);
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

async function getRisk(event: AppSyncEvent, tenantId: string) {
  const id = event.arguments.id as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m5.risks WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: id } }],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

async function getCrossRegisterRiskView(tenantId: string) {
  // risk_register_view accessed via SECURITY DEFINER function ONLY (design §6.4)
  // NEVER a direct SELECT on the materialized view.
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m5_views.get_risk_register_view()`,
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}
