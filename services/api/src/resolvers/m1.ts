/**
 * M1 Document Studio resolver.
 * RDS system-of-record via Data API (app_role). DDB metadata via tenant-data role.
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany } from './shared.js';
import { mapEnum, DOC_TYPE_MAP, DOC_STATUS_MAP, APPROVAL_DECISION_MAP } from './enum-mappings.js';

const logger = new Logger({ serviceName: 'resolver-m1' });

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
    case 'createDocumentDraft': return createDocumentDraft(event, tenantId, sub);
    case 'submitDocumentForApproval': return submitDocumentForApproval(event, tenantId, sub);
    case 'approveDocumentVersion': return approveDocumentVersion(event, tenantId, sub);
    case 'publishControlledDocument': return publishControlledDocument(event, tenantId, sub);
    case 'updatePolicy': return updatePolicy(event, tenantId, sub);
    case 'updateImsScope': return updateImsScope(event, tenantId, sub);
    case 'getDocument': return getDocument(event, tenantId);
    case 'listDocuments': return listDocuments(event, tenantId);
    case 'listDocumentVersions': return listDocumentVersions(event, tenantId);
    case 'getDocumentVersionDiff': return getDocumentVersionDiff(event, tenantId);
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function createDocumentDraft(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const docType = mapEnum(DOC_TYPE_MAP, input.docType as string, 'docType');
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m1.documents (tenant_id, standard, doc_type, title, owner_id, status, created_by)
       VALUES (:tenantId, :standard, :docType, :title, :actor, 'draft', :actor)
       RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'standard', value: { stringValue: input.standard as string } },
        { name: 'docType', value: { stringValue: docType } },
        { name: 'title', value: { stringValue: input.title as string } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 7.5.2', standard: 'ISO9001',
      detailType: 'Document.DraftCreated', source: 'cumplify.m1.document-studio',
      payload: { input },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function submitDocumentForApproval(event: AppSyncEvent, tenantId: string, actor: string) {
  const id = event.arguments.id as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m1.documents SET status = 'in_review', updated_at = NOW() WHERE id = :id::uuid RETURNING *`,
      [{ name: 'id', value: { stringValue: id } }],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 7.5.2', standard: 'ISO9001',
      detailType: 'Document.SubmittedForApproval', source: 'cumplify.m1.document-studio',
      payload: { documentId: id },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function approveDocumentVersion(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const decision = mapEnum(APPROVAL_DECISION_MAP, input.decision as string, 'decision');
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `INSERT INTO m1.document_approvals (tenant_id, document_version_id, approver_id, decision, approved_at, created_by)
       VALUES (:tenantId, :versionId::uuid, :actor, :decision, NOW(), :actor) RETURNING *`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'versionId', value: { stringValue: input.versionId as string } },
        { name: 'actor', value: { stringValue: actor } },
        { name: 'decision', value: { stringValue: decision } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 7.5.2', standard: 'ISO9001',
      detailType: 'Document.Approved', source: 'cumplify.m1.document-studio',
      payload: { versionId: input.versionId, decision: input.decision },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function publishControlledDocument(event: AppSyncEvent, tenantId: string, actor: string) {
  const versionId = event.arguments.versionId as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m1.documents d SET status = 'approved', updated_at = NOW()
       FROM m1.document_versions v WHERE v.id = :versionId::uuid AND v.document_id = d.id
       RETURNING d.*`,
      [{ name: 'versionId', value: { stringValue: versionId } }],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 7.5.3', standard: 'ISO9001',
      detailType: 'Document.Published', source: 'cumplify.m1.document-studio',
      payload: { versionId },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function updatePolicy(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m1.policies SET policy_text = :text, effective_date = NOW(), updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [
        { name: 'id', value: { stringValue: input.id as string } },
        { name: 'text', value: { stringValue: input.policyText as string } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 5.2', standard: 'ISO9001',
      detailType: 'Policy.Updated', source: 'cumplify.m1.document-studio',
      payload: { policyId: input.id },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function updateImsScope(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `UPDATE m1.ims_scope SET scope_statement = :stmt, boundaries = :bounds, exclusions_9001 = :excl, updated_at = NOW()
       WHERE id = :id::uuid RETURNING *`,
      [
        { name: 'id', value: { stringValue: input.id as string } },
        { name: 'stmt', value: { stringValue: input.scopeStatement as string } },
        { name: 'bounds', value: { stringValue: (input.boundaries as string) ?? '' } },
        { name: 'excl', value: { stringValue: (input.exclusions9001 as string) ?? '' } },
      ],
    );
    await txn.commit();
    await publishAuditEvent({
      tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 4.3', standard: 'ISO9001',
      detailType: 'Scope.Changed', source: 'cumplify.m1.document-studio',
      payload: { scopeId: input.id },
    });
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getDocument(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m1.documents WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: event.arguments.id as string } }],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listDocuments(event: AppSyncEvent, tenantId: string) {
  // Filters declared in the schema (standard, status) are honored here —
  // previously ignored, which made the M1 filter bar a no-op live.
  const clauses: string[] = [];
  const params: Array<{ name: string; value: { stringValue: string } }> = [];
  const standard = event.arguments.standard as string | undefined;
  const status = event.arguments.status as string | undefined;
  if (standard) {
    clauses.push('standard = :standard');
    params.push({ name: 'standard', value: { stringValue: standard } });
  }
  if (status) {
    clauses.push('status = :status');
    params.push({ name: 'status', value: { stringValue: mapEnum(DOC_STATUS_MAP, status, 'status') } });
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m1.documents ${where} ORDER BY created_at DESC`,
      params,
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function listDocumentVersions(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT * FROM m1.document_versions WHERE document_id = :documentId::uuid ORDER BY version_no DESC`,
      [{ name: 'documentId', value: { stringValue: event.arguments.documentId as string } }],
    );
    await txn.commit();
    return marshalMany(result);
  } catch (err) { await txn.rollback(); throw err; }
}

async function getDocumentVersionDiff(event: AppSyncEvent, tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(
      `SELECT v1.content_ref as v1_ref, v2.content_ref as v2_ref
       FROM m1.document_versions v1, m1.document_versions v2
       WHERE v1.id = :v1::uuid AND v2.id = :v2::uuid`,
      [
        { name: 'v1', value: { stringValue: event.arguments.v1 as string } },
        { name: 'v2', value: { stringValue: event.arguments.v2 as string } },
      ],
    );
    await txn.commit();
    return marshalOne(result);
  } catch (err) { await txn.rollback(); throw err; }
}
