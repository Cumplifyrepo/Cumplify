/**
 * M1 Document Studio resolver.
 * RDS system-of-record via Data API (app_role). DDB metadata via tenant-data role.
 * C-2 INVARIANT: set_config FIRST in every transaction, transaction-local (true).
 * SCHEMA-5: tenantId from resolverContext only.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { extractContext, beginTenantTransaction, publishAuditEvent, marshalOne, marshalMany } from './shared.js';
import { mapEnum, DOC_TYPE_MAP, DOC_STATUS_MAP, APPROVAL_DECISION_MAP } from './enum-mappings.js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const logger = new Logger({ serviceName: 'resolver-m1' });
const s3 = new S3Client({});
const CONTENT_BUCKET = process.env.CONTENT_BUCKET ?? '';

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
    // APR-1/APR-3: preconditions — only for documents with an associated generation run.
    // Non-generated documents (hand-authored M1 drafts) pass through unchanged.
    const runResult = await txn.execute(`
      SELECT gr.id, gr.status
      FROM qms.generation_runs gr
      WHERE gr.manual_document_id = :docId::uuid
      ORDER BY gr.started_at DESC LIMIT 1
    `, [{ name: 'docId', value: { stringValue: id } }]);

    const hasRun = runResult.records && runResult.records.length > 0;

    if (hasRun) {
      const runId = (runResult.records![0][0] as { stringValue?: string }).stringValue!;

      // APR-1: every section must have reviewed_at IS NOT NULL
      const unreviewedResult = await txn.execute(`
        SELECT COUNT(*) AS cnt FROM qms.generation_sections
        WHERE run_id = :runId::uuid AND reviewed_at IS NULL
      `, [{ name: 'runId', value: { stringValue: runId } }]);
      const unreviewedCount = (unreviewedResult.records![0][0] as { longValue?: number }).longValue ?? 0;
      if (unreviewedCount > 0) {
        throw new Error('UNREVIEWED_SECTIONS');
      }

      // APR-3: zero sections with status IN ('gap', 'failed')
      const gapFailedResult = await txn.execute(`
        SELECT COUNT(*) AS cnt FROM qms.generation_sections
        WHERE run_id = :runId::uuid AND status IN ('gap', 'failed')
      `, [{ name: 'runId', value: { stringValue: runId } }]);
      const gapFailedCount = (gapFailedResult.records![0][0] as { longValue?: number }).longValue ?? 0;
      if (gapFailedCount > 0) {
        throw new Error('UNRESOLVED_GAPS');
      }
    }

    // Status transition: draft → in_review
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
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

async function approveDocumentVersion(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as Record<string, unknown>;
  const decision = mapEnum(APPROVAL_DECISION_MAP, input.decision as string, 'decision');
  const txn = await beginTenantTransaction(tenantId);
  try {
    // BC-11 SoD: approver sub ≠ version created_by
    const versionResult = await txn.execute(
      `SELECT created_by FROM m1.document_versions WHERE id = :versionId::uuid`,
      [{ name: 'versionId', value: { stringValue: input.versionId as string } }],
    );
    if (versionResult.records && versionResult.records.length > 0) {
      const createdBy = (versionResult.records[0][0] as { stringValue?: string }).stringValue;
      if (createdBy === actor) {
        // Rollback BEFORE publishing (lesson: attempt is logged, write is not)
        await txn.rollback();
        await publishAuditEvent({
          tenantId, actor, module: 'M1', clauseRef: 'ISO 9001 7.5.2', standard: 'ISO9001',
          detailType: 'Security.SodViolationBlocked', source: 'cumplify.m1.document-studio',
          payload: { versionId: input.versionId, attemptedBy: actor, createdBy },
        });
        throw new Error('SOD_VIOLATION');
      }
    }

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
  } catch (err) {
    if ((err as Error).message !== 'SOD_VIOLATION') {
      try { await txn.rollback(); } catch { /* never mask */ }
    }
    throw err;
  }
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
    // Fetch content_ref for both versions
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

    const row = marshalOne(result);
    if (!row || !row.v1Ref || !row.v2Ref) {
      return { additions: 0, deletions: 0, content: '{}' };
    }

    // Load content JSONs from S3
    const [content1, content2] = await Promise.all([
      loadContentJson(row.v1Ref as string),
      loadContentJson(row.v2Ref as string),
    ]);

    // Align sections by harmonizationKey and compute sentence-level LCS diff
    const diff = computeSectionDiff(content1, content2);
    return diff;
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

// ─── S3 content loading ──────────────────────────────────────────────────────

async function loadContentJson(key: string): Promise<ContentJson> {
  if (!CONTENT_BUCKET) {
    logger.warn('CONTENT_BUCKET not configured — returning empty content');
    return { sections: [] };
  }
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }));
    const body = await resp.Body?.transformToString('utf-8');
    return body ? JSON.parse(body) : { sections: [] };
  } catch (err) {
    logger.warn('Failed to load content from S3', { key, error: (err as Error).message });
    return { sections: [] };
  }
}

// ─── Diff computation (section alignment by harmonizationKey + sentence LCS) ──

interface ContentSection {
  harmonizationKey: string;
  sentences?: string[];
  [key: string]: unknown;
}

interface ContentJson {
  sections: ContentSection[];
  [key: string]: unknown;
}

/**
 * Align sections by harmonizationKey, then compute sentence-level LCS diff.
 * Convention: bare key for shared sections, "key#standard" for forked/standard_only.
 */
function computeSectionDiff(v1: ContentJson, v2: ContentJson): { additions: number; deletions: number; content: string } {
  const v1Map = new Map(v1.sections.map(s => [s.harmonizationKey, s]));
  const v2Map = new Map(v2.sections.map(s => [s.harmonizationKey, s]));

  let totalAdditions = 0;
  let totalDeletions = 0;
  const sectionDiffs: Record<string, { added: string[]; removed: string[] }> = {};

  // Sections in v2 but not v1 (added)
  for (const [key, sec] of v2Map) {
    if (!v1Map.has(key)) {
      const sentences = sec.sentences ?? [];
      totalAdditions += sentences.length;
      sectionDiffs[key] = { added: sentences, removed: [] };
    }
  }

  // Sections in v1 but not v2 (removed)
  for (const [key, sec] of v1Map) {
    if (!v2Map.has(key)) {
      const sentences = sec.sentences ?? [];
      totalDeletions += sentences.length;
      sectionDiffs[key] = { added: [], removed: sentences };
    }
  }

  // Sections in both — sentence-level LCS diff
  for (const [key, sec1] of v1Map) {
    const sec2 = v2Map.get(key);
    if (!sec2) continue;
    const s1 = sec1.sentences ?? [];
    const s2 = sec2.sentences ?? [];
    const { added, removed } = sentenceLcsDiff(s1, s2);
    if (added.length > 0 || removed.length > 0) {
      totalAdditions += added.length;
      totalDeletions += removed.length;
      sectionDiffs[key] = { added, removed };
    }
  }

  return {
    additions: totalAdditions,
    deletions: totalDeletions,
    content: JSON.stringify(sectionDiffs),
  };
}

/**
 * Sentence-level diff using LCS (Longest Common Subsequence).
 * Returns sentences added in v2 and removed from v1.
 */
function sentenceLcsDiff(v1: string[], v2: string[]): { added: string[]; removed: string[] } {
  const m = v1.length;
  const n = v2.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = v1[i - 1] === v2[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to find which sentences are NOT in the LCS
  const inLcs1 = new Set<number>();
  const inLcs2 = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (v1[i - 1] === v2[j - 1]) { inLcs1.add(i - 1); inLcs2.add(j - 1); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { i--; }
    else { j--; }
  }

  const removed = v1.filter((_, idx) => !inLcs1.has(idx));
  const added = v2.filter((_, idx) => !inLcs2.has(idx));
  return { added, removed };
}
