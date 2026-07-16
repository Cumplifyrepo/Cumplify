/**
 * QMS Forms & Records Engine resolver (spec 41, design §2–5).
 *
 * Schema node dependency: FormTemplate, FormTemplateSection, FormTemplateField,
 * FormRecord, FormCompletion, FormRecordStatus, SaveFormRecordValuesInput,
 * SubmitFormRecordInput, ApproveFormRecordInput, ReopenFormRecordInput, ExportResult.
 *
 * Key invariants:
 * - FormCompletion is SERVER-COMPUTED (COUNT over record_values joined to
 *   template_fields) — the client never computes it.
 * - saveFormRecordValues: typed-column dispatch by field_type.
 * - Immutability guard: complete/approved status rejects writes.
 * - BC-1: sectionCount/fieldCount are COUNTs over catalog rows, never hardcoded.
 * - SCHEMA-5: tenantId from resolverContext only, never input.
 * - C-2: set_config is the FIRST statement in every transaction.
 *
 * Note: listFormRecords closes the standing BLOCKED listRecords item from
 * frontend-app Task 29.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import {
  extractContext,
  beginTenantTransaction,
  publishAuditEvent,
  getTenantDdbClient,
  TABLE_NAME,
  type TenantTransaction,
  type DataApiResult,
} from './shared.js';
import type { SqlParameter } from '@aws-sdk/client-rds-data';
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
// PDF labels resolve from the SAME catalogs the UI renders (BC-7 single
// source): bundle-time JSON import — catalog edits ship with the next deploy,
// and the seed↔catalog contract is pinned hermetically (qms-forms-catalog).
import enMessages from '../../../../frontend/messages/en.json';
import esMessages from '../../../../frontend/messages/es.json';
import ptMessages from '../../../../frontend/messages/pt.json';

const logger = new Logger({ serviceName: 'resolver-forms' });
const s3 = new S3Client({});
const lambdaClient = new LambdaClient({});

// Task 8 (REC-7): record PDF export + approved-record sealing. Env mirrors
// the m1 sealing block (spec-40 Task 9) — GOVERNANCE dev / COMPLIANCE prod.
const CONTENT_BUCKET = process.env.CONTENT_BUCKET ?? '';
const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET ?? '';
const EVIDENCE_LOCK_MODE = process.env.EVIDENCE_LOCK_MODE ?? 'GOVERNANCE';
const PDF_RENDER_FN = process.env.PDF_RENDER_FN ?? '';
const DEFAULT_RETENTION_YEARS = 7;
const EXPORT_URL_TTL_SECONDS = 15 * 60;

const MESSAGES: Record<string, unknown> = { en: enMessages, es: esMessages, pt: ptMessages };

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

// ─── Field type → value column dispatch map ──────────────────────────────────
const FIELD_TYPE_COLUMN: Record<string, string> = {
  text: 'value_text',
  textarea: 'value_text',
  select: 'value_text',
  multiselect: 'value_json',
  radio: 'value_text',
  number: 'value_number',
  date: 'value_date',
  checkbox: 'value_bool',
  user: 'value_text',
  relation: 'value_uuid',
};

// Immutable statuses — writes rejected on these (after marshal: uppercased)
const IMMUTABLE_STATUSES = new Set(['COMPLETE', 'APPROVED']);

// Value column → SQL type cast (M3 lesson: RDS Data API binds stringValue as varchar)
const VALUE_COLUMN_CAST: Record<string, string> = {
  value_uuid: '::uuid',
  value_date: '::timestamptz',
  value_json: '::jsonb',
  value_number: '::numeric',
};

// ─── BC-2: Relation target → table allowlist (CODE constant, never from data) ─
// The target table name is NEVER interpolated from a catalog row or user input.
// 'user' is excluded — user references are stored as text (sub claim), not FK-probed.
// 'clause' → qms.clause_registry (lands in migration 011, same deploy wave).
const RELATION_TARGET_TABLE: Record<string, string> = {
  nonconformity: 'm2.nonconformities',
  corrective_action: 'm2.corrective_actions',
  audit: 'm3.audits',
  risk: 'm5.risks',
  document: 'm1.documents',
  clause: 'qms.clause_registry', // migration 011 (spec-40 Task 1)
};

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(event: AppSyncEvent): Promise<unknown> {
  const ctx = extractContext(event);
  const { tenantId, sub } = ctx;
  logger.appendKeys({ tenantId, requestField: event.info.fieldName });

  switch (event.info.fieldName) {
    case 'listFormTemplates':
      return listFormTemplates(tenantId);
    case 'getFormTemplate':
      return getFormTemplate(event);
    case 'listFormRecords':
      return listFormRecords(event, tenantId);
    case 'getFormRecord':
      return getFormRecord(event, tenantId);
    case 'createFormRecord':
      return createFormRecord(event, tenantId, sub);
    case 'saveFormRecordValues':
      return saveFormRecordValues(event, tenantId);
    case 'submitFormRecord':
      return submitFormRecord(event, tenantId, sub);
    case 'approveFormRecord':
      return approveFormRecord(event, tenantId, sub);
    case 'reopenFormRecord':
      return reopenFormRecord(event, tenantId, sub);
    case 'exportFormRecordPdf':
      return exportFormRecordPdf(event, tenantId);
    default:
      throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * listFormTemplates — the tenant-less catalog, scoped to the tenant.
 * TPL-3 (ACC-1): filtered by the tenant's standards in scope from the
 * spec-40 org profile — a 9001-only tenant never sees 14001/45001-only
 * registers. Falls back to ALL templates until a profile exists (design §5).
 * The 'IMS' marker in seed standards[] is integration metadata, not a scope —
 * overlap is computed on CONCRETE standards only.
 * sectionCount/fieldCount are COUNTs over rows (BC-1).
 */
async function listFormTemplates(tenantId: string): Promise<unknown[]> {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      SELECT t.id, t.key, t.title_key, t.description_key, t.category,
             t.clause_refs, t.standards, t.requires_approval,
             (SELECT COUNT(*) FROM forms.template_sections s WHERE s.template_id = t.id) AS section_count,
             (SELECT COUNT(*) FROM forms.template_fields f
              JOIN forms.template_sections s2 ON f.section_id = s2.id
              WHERE s2.template_id = t.id) AS field_count
      FROM forms.templates t
      ORDER BY t.sort_order
    `);
    // Tenant scope (RLS-confined read; profile may not exist yet)
    const profileResult = await txn.execute(`
      SELECT opv.payload
      FROM qms.org_profiles op
      JOIN qms.org_profile_versions opv ON opv.profile_id = op.id AND opv.version_no = op.current_version
      LIMIT 1
    `);
    await txn.commit();

    const templates = marshalTemplates(result);
    const payloadRaw = profileResult.records?.[0]?.[0] as { stringValue?: string } | undefined;
    if (!payloadRaw?.stringValue) return templates; // no profile → all (design §5)
    const scope = (JSON.parse(payloadRaw.stringValue) as { standardsInScope?: string[] }).standardsInScope ?? [];
    if (scope.length === 0) return templates;

    const scopeSet = new Set(scope);
    return templates.filter(t => {
      const concrete = ((t.standards as string[]) ?? []).filter(s => s !== 'IMS');
      return concrete.some(s => scopeSet.has(s));
    });
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * getFormTemplate — returns template with nested sections and fields.
 */
async function getFormTemplate(event: AppSyncEvent): Promise<unknown> {
  const templateId = event.arguments.id as string;
  // Template is tenant-less; use a minimal transaction for consistency
  const txn = await beginTenantTransaction('__catalog__');
  try {
    const tplResult = await txn.execute(`
      SELECT t.id, t.key, t.title_key, t.description_key, t.category,
             t.clause_refs, t.standards, t.requires_approval,
             (SELECT COUNT(*) FROM forms.template_sections s WHERE s.template_id = t.id) AS section_count,
             (SELECT COUNT(*) FROM forms.template_fields f
              JOIN forms.template_sections s2 ON f.section_id = s2.id
              WHERE s2.template_id = t.id) AS field_count
      FROM forms.templates t WHERE t.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: templateId } }]);

    const sectionsResult = await txn.execute(`
      SELECT s.id, s.section_key, s.title_key, s.sort_order
      FROM forms.template_sections s
      WHERE s.template_id = :id::uuid ORDER BY s.sort_order
    `, [{ name: 'id', value: { stringValue: templateId } }]);

    const fieldsResult = await txn.execute(`
      SELECT f.id, f.section_id, f.field_key, f.label_key, f.field_type,
             f.required, f.options, f.relation_target, f.validation, f.sort_order
      FROM forms.template_fields f
      JOIN forms.template_sections s ON f.section_id = s.id
      WHERE s.template_id = :id::uuid ORDER BY s.sort_order, f.sort_order
    `, [{ name: 'id', value: { stringValue: templateId } }]);

    await txn.commit();
    return marshalTemplateDetail(tplResult, sectionsResult, fieldsResult);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * listFormRecords — tenant-scoped record listing per template.
 * NOTE: This closes the standing BLOCKED listRecords item from frontend-app Task 29.
 *
 * Task 10 (OQ-2 gate) rework: the original per-record computeCompletion was
 * 1 + 2N Data API round trips — a 30s Lambda timeout at 10k records. The
 * completion inputs now ride the listing itself (LATERAL aggregate per
 * returned row) + ONE template-fields query: 2 round trips regardless of
 * page size. Paginated (default 100, cap 500, newest first) — an unpaginated
 * 10k-row response would also breach the AppSync 1MB response limit.
 */
const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;

async function listFormRecords(event: AppSyncEvent, tenantId: string): Promise<unknown[]> {
  const templateId = event.arguments.templateId as string;
  const status = event.arguments.status as string | undefined;
  const limit = Math.min(Math.max(1, (event.arguments.limit as number | undefined) ?? LIST_DEFAULT_LIMIT), LIST_MAX_LIMIT);
  const offset = Math.max(0, (event.arguments.offset as number | undefined) ?? 0);
  const txn = await beginTenantTransaction(tenantId);
  try {
    let where = `WHERE r.template_id = :templateId::uuid`;
    const params: SqlParameter[] = [
      { name: 'templateId', value: { stringValue: templateId } },
      { name: 'limit', value: { longValue: limit } },
      { name: 'offset', value: { longValue: offset } },
    ];
    if (status) {
      where += ` AND r.status = :status`;
      params.push({ name: 'status', value: { stringValue: status.toLowerCase() } });
    }

    // Page FIRST (inner LIMIT), THEN the completion aggregate — a top-level
    // LATERAL runs for every candidate row BEFORE the sort+limit (measured:
    // 10k aggregate executions ≈ 340ms; paged: 100 ≈ 3ms). Ordered walk of
    // idx_forms_records_register (migration 017) serves the page directly.
    const result = await txn.execute(`
      SELECT page.*, c.filled_count, c.filled_keys
      FROM (
        SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by,
               r.m2_nc_id, r.created_at, r.updated_at
        FROM forms.records r
        ${where}
        ORDER BY r.created_at DESC
        LIMIT :limit OFFSET :offset
      ) page
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS filled_count, array_agg(f.field_key) AS filled_keys
        FROM forms.record_values rv
        JOIN forms.template_fields f ON rv.field_id = f.id
        WHERE rv.record_id = page.id
      ) c ON true
      ORDER BY page.created_at DESC
    `, params);
    const fieldsMeta = await fetchTemplateFieldMeta(txn, templateId);
    await txn.commit();

    return marshalRecordRows(result).map(rec => {
      const filledKeys = new Set((rec.filledKeys as string[] | null) ?? []);
      rec.completion = completionFrom(fieldsMeta, filledKeys);
      rec.values = '{}'; // Values returned on getFormRecord only (list is lightweight)
      delete rec.filledCount;
      delete rec.filledKeys;
      return rec;
    });
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * getFormRecord — single record with full values + server-computed completion.
 */
async function getFormRecord(event: AppSyncEvent, tenantId: string): Promise<unknown> {
  const recordId = event.arguments.id as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const recResult = await txn.execute(`
      SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by,
             r.m2_nc_id, r.created_at, r.updated_at
      FROM forms.records r WHERE r.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);

    const rows = marshalRecordRows(recResult);
    if (rows.length === 0) throw new Error('RECORD_NOT_FOUND');
    const rec = rows[0];

    // Fetch values
    const valResult = await txn.execute(`
      SELECT f.field_key, rv.value_text, rv.value_number, rv.value_date,
             rv.value_bool, rv.value_uuid, rv.value_json
      FROM forms.record_values rv
      JOIN forms.template_fields f ON rv.field_id = f.id
      WHERE rv.record_id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);

    const values = marshalValues(valResult);
    rec.values = JSON.stringify(values);
    // Task 10: completion from the values already fetched + one fields query
    // (was computeCompletion = 2 extra round trips per read).
    const fieldsMeta = await fetchTemplateFieldMeta(txn, rec.templateId as string);
    rec.completion = completionFrom(fieldsMeta, new Set(Object.keys(values)));

    await txn.commit();
    return rec;
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * createFormRecord — creates a new record in draft status.
 */
async function createFormRecord(event: AppSyncEvent, tenantId: string, actor: string): Promise<unknown> {
  const templateId = event.arguments.templateId as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      INSERT INTO forms.records (tenant_id, template_id, status, opened_by)
      VALUES (:tenantId, :templateId::uuid, 'draft', :actor)
      RETURNING id, template_id, status, opened_by, completed_by, m2_nc_id, created_at, updated_at
    `, [
      { name: 'tenantId', value: { stringValue: tenantId } },
      { name: 'templateId', value: { stringValue: templateId } },
      { name: 'actor', value: { stringValue: actor } },
    ]);
    const rec = marshalRecordRows(result)[0];
    // BUG-1 fix: compute real completion from catalog (not hardcoded 0/0/[]).
    // Task 10: fresh record has zero filled fields — one fields query suffices.
    const fieldsMeta = await fetchTemplateFieldMeta(txn, templateId);
    rec.completion = completionFrom(fieldsMeta, new Set());
    rec.values = '{}';
    await txn.commit();
    return rec;
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * saveFormRecordValues — partial autosave with typed-column dispatch.
 * Immutability guard: rejects writes on complete/approved status.
 * REC-3: no validation on save, only on submit.
 */
async function saveFormRecordValues(event: AppSyncEvent, tenantId: string): Promise<unknown> {
  const input = event.arguments.input as { recordId: string; values: string };
  const recordId = input.recordId;
  const values = JSON.parse(input.values) as Record<string, unknown>;

  const txn = await beginTenantTransaction(tenantId);
  try {
    // Check record status — immutability guard
    const statusResult = await txn.execute(
      `SELECT status, template_id FROM forms.records WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: recordId } }],
    );
    const statusRows = marshalRecordRows(statusResult);
    if (statusRows.length === 0) throw new Error('RECORD_NOT_FOUND');

    const currentStatus = statusRows[0].status as string;
    if (IMMUTABLE_STATUSES.has(currentStatus)) {
      throw new Error('RECORD_IMMUTABLE');
    }

    const templateId = statusRows[0].templateId as string;

    // Update status to in_progress if still draft
    if (currentStatus === 'DRAFT') {
      await txn.execute(
        `UPDATE forms.records SET status = 'in_progress', updated_at = NOW() WHERE id = :id::uuid`,
        [{ name: 'id', value: { stringValue: recordId } }],
      );
    }

    // Resolve field metadata for typed dispatch
    const fieldsResult = await txn.execute(`
      SELECT f.id, f.field_key, f.field_type, f.relation_target
      FROM forms.template_fields f
      JOIN forms.template_sections s ON f.section_id = s.id
      WHERE s.template_id = :templateId::uuid
    `, [{ name: 'templateId', value: { stringValue: templateId } }]);

    const fieldMeta = marshalFieldMeta(fieldsResult);

    // Upsert each value with typed-column dispatch
    for (const [fieldKey, value] of Object.entries(values)) {
      const meta = fieldMeta.get(fieldKey);
      if (!meta) {
        logger.warn('Unknown fieldKey in saveFormRecordValues — skipping', { fieldKey, recordId });
        continue;
      }

      // BUG-2 fix: null value → DELETE the row (clearing a field)
      if (value === null || value === undefined) {
        await txn.execute(`
          DELETE FROM forms.record_values
          WHERE record_id = :recordId::uuid AND field_id = :fieldId::uuid
        `, [
          { name: 'recordId', value: { stringValue: recordId } },
          { name: 'fieldId', value: { stringValue: meta.fieldId } },
        ]);
        continue;
      }

      const valueColumn = FIELD_TYPE_COLUMN[meta.fieldType];
      if (!valueColumn) continue;

      // BC-2: Relation existence probe — inside the tenant transaction (RLS-enforced)
      if (meta.fieldType === 'relation' && meta.relationTarget) {
        const targetTable = RELATION_TARGET_TABLE[meta.relationTarget];
        if (!targetTable) {
          throw new Error(`INVALID_RELATION_TARGET: ${meta.relationTarget}`);
        }
        const probeResult = await txn.execute(
          `SELECT 1 FROM ${targetTable} WHERE id = :uuid::uuid`,
          [{ name: 'uuid', value: { stringValue: String(value) } }],
        );
        if (!probeResult.records || probeResult.records.length === 0) {
          throw new Error('LINK_TARGET_NOT_FOUND');
        }
      }

      const param = buildValueParam(valueColumn, value);

      // Upsert: INSERT ON CONFLICT UPDATE the appropriate column, null others
      // Type casts: uuid columns need ::uuid, date needs ::timestamptz, json needs ::jsonb, number needs ::numeric
      const valueCast = VALUE_COLUMN_CAST[valueColumn] ?? '';
      await txn.execute(`
        INSERT INTO forms.record_values (record_id, tenant_id, field_id, ${valueColumn})
        VALUES (:recordId::uuid, :tenantId, :fieldId::uuid, :val${valueCast})
        ON CONFLICT (record_id, field_id)
        DO UPDATE SET ${valueColumn} = :val${valueCast},
          ${nullOtherColumns(valueColumn)}
      `, [
        { name: 'recordId', value: { stringValue: recordId } },
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'fieldId', value: { stringValue: meta.fieldId } },
        param,
      ]);
    }

    // Update record timestamp
    await txn.execute(
      `UPDATE forms.records SET updated_at = NOW() WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: recordId } }],
    );

    await txn.commit();

    // Return refreshed record
    return getFormRecordById(recordId, tenantId);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * submitFormRecord — full validation + NCR→M2 mapping (BC-3 core, design §3).
 *
 * Status guard: only DRAFT/IN_PROGRESS/REOPENED can submit (else SUBMIT_INVALID_STATUS).
 * Full validation (REC-3): ALL required fields must be filled (VALIDATION_INCOMPLETE).
 * Mapped validation (BC-3): all maps_to_column required fields filled (MAPPING_INCOMPLETE).
 * Resubmit-after-reopen: if m2_nc_id already set, UPDATE existing NC row (not INSERT).
 *
 * ZERO hardcoded defaults for clause_ref/severity/source/standard/nc_type.
 */
async function submitFormRecord(event: AppSyncEvent, tenantId: string, actor: string): Promise<unknown> {
  const input = event.arguments.input as { recordId: string };
  const recordId = input.recordId;

  const txn = await beginTenantTransaction(tenantId);
  try {
    // 1. Fetch record + template metadata
    const recResult = await txn.execute(`
      SELECT r.id, r.template_id, r.status, r.opened_by, r.m2_nc_id
      FROM forms.records r WHERE r.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    const recRows = marshalRecordRows(recResult);
    if (recRows.length === 0) throw new Error('RECORD_NOT_FOUND');
    const rec = recRows[0];
    const templateId = rec.templateId as string;
    const currentStatus = rec.status as string;
    const existingNcId = rec.m2NcId as string | null;

    // F1: Status guard — submit only from DRAFT/IN_PROGRESS/REOPENED
    const SUBMITTABLE_STATUSES = new Set(['DRAFT', 'IN_PROGRESS', 'REOPENED']);
    if (!SUBMITTABLE_STATUSES.has(currentStatus)) {
      throw new Error('SUBMIT_INVALID_STATUS');
    }

    // Check template maps_to + standards + clause_refs
    const tplResult = await txn.execute(`
      SELECT maps_to, standards, clause_refs FROM forms.templates WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: templateId } }]);
    const tplRows = marshalRecordRows(tplResult);
    const mapsTo = tplRows[0]?.mapsTo as string | null;
    const tplStandards = tplRows[0]?.standards as string[] | null;
    const tplClauseRefs = tplRows[0]?.clauseRefs as string[] | null;

    // Fetch all field metadata with maps_to_column
    const fieldMetaResult = await txn.execute(`
      SELECT f.id, f.field_key, f.field_type, f.required, f.maps_to_column, f.relation_target
      FROM forms.template_fields f
      JOIN forms.template_sections s ON f.section_id = s.id
      WHERE s.template_id = :templateId::uuid
    `, [{ name: 'templateId', value: { stringValue: templateId } }]);

    // Fetch all current record values
    const valuesResult = await txn.execute(`
      SELECT f.field_key, rv.value_text, rv.value_number, rv.value_date,
             rv.value_bool, rv.value_uuid, rv.value_json
      FROM forms.record_values rv
      JOIN forms.template_fields f ON rv.field_id = f.id
      WHERE rv.record_id = :recordId::uuid
    `, [{ name: 'recordId', value: { stringValue: recordId } }]);

    const currentValues = marshalValues(valuesResult);
    const fieldsMeta = marshalFieldMetaFull(fieldMetaResult);

    // BC-3: Validate mapped fields FIRST (MAPPING_INCOMPLETE is the BC-3 signal)
    if (mapsTo === 'm2_ncr') {
      const mappedFields = fieldsMeta.filter(f => f.mapsToColumn !== null);
      const requiredMapped = mappedFields.filter(f => f.required);

      for (const field of requiredMapped) {
        const value = currentValues[field.fieldKey];
        if (value === null || value === undefined || value === '') {
          throw new Error('MAPPING_INCOMPLETE');
        }
      }
    }

    // F3: Full validation (REC-3) — ALL required fields must be filled
    const allRequired = fieldsMeta.filter(f => f.required);
    for (const field of allRequired) {
      const value = currentValues[field.fieldKey];
      if (value === null || value === undefined || value === '') {
        throw new Error('VALIDATION_INCOMPLETE');
      }
    }

    // NCR→M2 mapping path
    if (mapsTo === 'm2_ncr') {

      // Resolve clause_ref UUID → clause_no TEXT from qms.clause_registry (pending 011)
      const clauseRefUuid = currentValues['clause_ref'] as string;
      const clauseResult = await txn.execute(`
        SELECT clause_no FROM qms.clause_registry WHERE id = :id::uuid
      `, [{ name: 'id', value: { stringValue: clauseRefUuid } }]);
      const clauseRows = marshalRecordRows(clauseResult);
      if (clauseRows.length === 0) throw new Error('LINK_TARGET_NOT_FOUND');
      const clauseNoText = clauseRows[0].clauseNo as string;

      // F1: Resubmit-after-reopen — if m2_nc_id already set, UPDATE existing NC (not INSERT)
      let ncId: string;
      if (existingNcId) {
        // UPDATE existing m2.nonconformities mapped columns (do NOT touch CA row — its lifecycle belongs to M2)
        await txn.execute(`
          UPDATE m2.nonconformities
          SET standard = :standard, source = :source, nc_type = :ncType,
              description = :description, clause_ref = :clauseRef, severity = :severity,
              updated_at = NOW()
          WHERE id = :ncId::uuid
        `, [
          { name: 'standard', value: { stringValue: currentValues['standard'] as string } },
          { name: 'source', value: { stringValue: currentValues['source'] as string } },
          { name: 'ncType', value: { stringValue: currentValues['nc_type'] as string } },
          { name: 'description', value: { stringValue: currentValues['nc_description'] as string } },
          { name: 'clauseRef', value: { stringValue: clauseNoText } },
          { name: 'severity', value: { stringValue: currentValues['severity'] as string } },
          { name: 'ncId', value: { stringValue: existingNcId } },
        ]);
        ncId = existingNcId;
      } else {
        // First submit: INSERT m2.nonconformities (real column names from migration 003)
        const ncResult = await txn.execute(`
          INSERT INTO m2.nonconformities (tenant_id, standard, source, nc_type, description, clause_ref, severity, raised_by, created_by)
          VALUES (:tenantId, :standard, :source, :ncType, :description, :clauseRef, :severity, :raisedBy, :actor)
          RETURNING id
        `, [
          { name: 'tenantId', value: { stringValue: tenantId } },
          { name: 'standard', value: { stringValue: currentValues['standard'] as string } },
          { name: 'source', value: { stringValue: currentValues['source'] as string } },
          { name: 'ncType', value: { stringValue: currentValues['nc_type'] as string } },
          { name: 'description', value: { stringValue: currentValues['nc_description'] as string } },
          { name: 'clauseRef', value: { stringValue: clauseNoText } },
          { name: 'severity', value: { stringValue: currentValues['severity'] as string } },
          { name: 'raisedBy', value: { stringValue: currentValues['raised_by'] as string } },
          { name: 'actor', value: { stringValue: actor } },
        ]);
        ncId = unwrapField((ncResult.records![0] as Array<Record<string, unknown>>)[0]) as string;

        // INSERT m2.corrective_actions (nc_id from INSERT; action_desc/owner_id/due_date NOT NULL)
        const containmentFlag = currentValues['containment_flag'] === true || currentValues['containment_flag'] === 'true';
        await txn.execute(`
          INSERT INTO m2.corrective_actions (tenant_id, nc_id, action_desc, owner_id, due_date, containment_flag, created_by)
          VALUES (:tenantId, :ncId::uuid, :actionDesc, :ownerId, :dueDate::timestamptz, :containmentFlag, :actor)
        `, [
          { name: 'tenantId', value: { stringValue: tenantId } },
          { name: 'ncId', value: { stringValue: ncId } },
          { name: 'actionDesc', value: { stringValue: currentValues['corrective_action_desc'] as string } },
          { name: 'ownerId', value: { stringValue: currentValues['ca_owner'] as string } },
          { name: 'dueDate', value: { stringValue: currentValues['ca_due_date'] as string } },
          { name: 'containmentFlag', value: { booleanValue: containmentFlag } },
          { name: 'actor', value: { stringValue: actor } },
        ]);
      }

      // Stamp forms.records.m2_nc_id + mark complete
      await txn.execute(`
        UPDATE forms.records
        SET m2_nc_id = :ncId::uuid, status = 'complete', completed_by = :actor, completed_at = NOW(), updated_at = NOW()
        WHERE id = :id::uuid
      `, [
        { name: 'ncId', value: { stringValue: ncId } },
        { name: 'actor', value: { stringValue: actor } },
        { name: 'id', value: { stringValue: recordId } },
      ]);

      await txn.commit();

      // F2: Audit event — standard + clauseRef from mapped values (no literals)
      await publishAuditEvent({
        tenantId,
        actor,
        module: 'M4',
        clauseRef: clauseNoText,
        standard: currentValues['standard'] as 'ISO9001' | 'ISO14001' | 'ISO45001',
        detailType: 'FormRecord.Submitted',
        source: 'cumplify.forms',
        payload: { recordId, templateId, mapsTo, ncId },
      });
    } else {
      // Non-mapping template: just mark complete (no m2 writes)
      await txn.execute(`
        UPDATE forms.records
        SET status = 'complete', completed_by = :actor, completed_at = NOW(), updated_at = NOW()
        WHERE id = :id::uuid
      `, [
        { name: 'actor', value: { stringValue: actor } },
        { name: 'id', value: { stringValue: recordId } },
      ]);

      await txn.commit();

      // Audit event — standard/clauseRef from template metadata (impossible path fails loudly)
      // TODO-011: once IMS enum lands (spec-40), multi-standard templates use 'IMS'
      if (!tplStandards?.[0] || !tplClauseRefs?.[0]) {
        throw new Error('TEMPLATE_METADATA_MISSING');
      }
      await publishAuditEvent({
        tenantId,
        actor,
        module: 'M4',
        clauseRef: tplClauseRefs[0],
        standard: tplStandards[0] as 'ISO9001' | 'ISO14001' | 'ISO45001',
        detailType: 'FormRecord.Submitted',
        source: 'cumplify.forms',
        payload: { recordId, templateId, mapsTo },
      });
    }

    return getFormRecordById(recordId, tenantId);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/**
 * approveFormRecord — SoD enforcement (BC-4).
 * Only for requires_approval templates, only from COMPLETE status.
 * SoD: approver ≠ completed_by AND approver ≠ opened_by.
 * Violation → Security.SodViolationBlocked, writes NOTHING.
 */
async function approveFormRecord(event: AppSyncEvent, tenantId: string, actor: string): Promise<unknown> {
  const input = event.arguments.input as { recordId: string };
  const recordId = input.recordId;

  const txn = await beginTenantTransaction(tenantId);
  try {
    // Fetch record
    const recResult = await txn.execute(`
      SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by
      FROM forms.records r WHERE r.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    const recRows = marshalRecordRows(recResult);
    if (recRows.length === 0) throw new Error('RECORD_NOT_FOUND');
    const rec = recRows[0];
    const templateId = rec.templateId as string;
    const currentStatus = rec.status as string;
    const openedBy = rec.openedBy as string;
    const completedBy = rec.completedBy as string | null;

    // Status guard: approve only from COMPLETE
    if (currentStatus !== 'COMPLETE') {
      throw new Error('APPROVE_INVALID_STATUS');
    }

    // Template guard: only requires_approval templates
    const tplResult = await txn.execute(`
      SELECT requires_approval, standards, clause_refs FROM forms.templates WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: templateId } }]);
    const tplRows = marshalRecordRows(tplResult);
    const requiresApproval = tplRows[0]?.requiresApproval;
    const tplStandards = tplRows[0]?.standards as string[] | null;
    const tplClauseRefs = tplRows[0]?.clauseRefs as string[] | null;

    if (!requiresApproval) {
      throw new Error('APPROVAL_NOT_REQUIRED');
    }

    // BC-4: SoD — approver ≠ completed_by AND approver ≠ opened_by
    if (actor === completedBy || actor === openedBy) {
      // Publish Security.SodViolationBlocked, write NOTHING
      try { await txn.rollback(); } catch { /* never mask the original error */ }
      await publishAuditEvent({
        tenantId,
        actor,
        module: 'M4',
        clauseRef: tplClauseRefs?.[0] ?? (() => { throw new Error('TEMPLATE_METADATA_MISSING'); })(),
        standard: (tplStandards?.[0] ?? (() => { throw new Error('TEMPLATE_METADATA_MISSING'); })()) as 'ISO9001' | 'ISO14001' | 'ISO45001',
        detailType: 'Security.SodViolationBlocked',
        source: 'cumplify.forms',
        payload: { recordId, attemptedBy: actor, openedBy, completedBy, reason: 'approver must differ from opened_by and completed_by' },
      });
      throw new Error('SOD_VIOLATION');
    }

    // Approve: stamp approved_by/approved_at, status → approved
    await txn.execute(`
      UPDATE forms.records
      SET status = 'approved', approved_by = :actor, approved_at = NOW(), updated_at = NOW()
      WHERE id = :id::uuid
    `, [
      { name: 'actor', value: { stringValue: actor } },
      { name: 'id', value: { stringValue: recordId } },
    ]);

    // Task 8 (REC-7): seal the approved record — PDF → EvidenceVault with
    // per-object retention + m4.records pointer, SAME txn as the flip. A
    // seal failure rolls the approval back (catch below): no
    // approved-but-unsealed records. Unconfigured env (hermetic lane) skips
    // honestly — the audit payload carries sealed:false + reason.
    let sealed: Record<string, unknown> = { sealed: false, reason: 'SEAL_NOT_CONFIGURED' };
    if (CONTENT_BUCKET && EVIDENCE_BUCKET && PDF_RENDER_FN) {
      sealed = await sealApprovedRecord(txn, tenantId, recordId, actor, (tplStandards ?? []) as string[]);
    }

    await txn.commit();

    // Audit event — dynamic standard/clauseRef from template
    if (!tplStandards?.[0] || !tplClauseRefs?.[0]) {
      throw new Error('TEMPLATE_METADATA_MISSING');
    }
    await publishAuditEvent({
      tenantId,
      actor,
      module: 'M4',
      clauseRef: tplClauseRefs[0],
      standard: tplStandards[0] as 'ISO9001' | 'ISO14001' | 'ISO45001',
      detailType: 'FormRecord.Approved',
      source: 'cumplify.forms',
      payload: { recordId, templateId, approvedBy: actor, ...sealed },
    });

    return getFormRecordById(recordId, tenantId);
  } catch (err) {
    if ((err as Error).message !== 'SOD_VIOLATION') {
      try { await txn.rollback(); } catch { /* never mask the original error */ }
    }
    throw err;
  }
}

/**
 * reopenFormRecord — explicit reopen with justification (REC-4, BC-5).
 * Status complete/approved → reopened. Audit-logged with justification.
 */
async function reopenFormRecord(event: AppSyncEvent, tenantId: string, actor: string): Promise<unknown> {
  const input = event.arguments.input as { recordId: string; justification: string };
  const { recordId, justification } = input;

  if (!justification || justification.trim().length === 0) {
    throw new Error('JUSTIFICATION_REQUIRED');
  }

  const txn = await beginTenantTransaction(tenantId);
  try {
    // Verify record exists and is in a completable state
    const recResult = await txn.execute(`
      SELECT r.id, r.template_id, r.status
      FROM forms.records r WHERE r.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    const recRows = marshalRecordRows(recResult);
    if (recRows.length === 0) throw new Error('RECORD_NOT_FOUND');

    const currentStatus = recRows[0].status as string;
    if (currentStatus !== 'COMPLETE' && currentStatus !== 'APPROVED') {
      throw new Error('REOPEN_INVALID_STATUS');
    }

    const templateId = recRows[0].templateId as string;

    // Fetch template metadata for audit event (no literal standards)
    const tplResult = await txn.execute(`
      SELECT standards, clause_refs FROM forms.templates WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: templateId } }]);
    const tplRows = marshalRecordRows(tplResult);
    const tplStandards = tplRows[0]?.standards as string[] | null;
    const tplClauseRefs = tplRows[0]?.clauseRefs as string[] | null;

    // Transition to reopened
    await txn.execute(`
      UPDATE forms.records
      SET status = 'reopened', completed_by = NULL, completed_at = NULL, updated_at = NOW()
      WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);

    await txn.commit();

    // Audit event — standard/clauseRef from template metadata (impossible path fails loudly)
    // TODO-011: once IMS enum lands (spec-40), multi-standard templates use 'IMS'
    if (!tplStandards?.[0] || !tplClauseRefs?.[0]) {
      throw new Error('TEMPLATE_METADATA_MISSING');
    }
    await publishAuditEvent({
      tenantId,
      actor,
      module: 'M4',
      clauseRef: tplClauseRefs[0],
      standard: tplStandards[0] as 'ISO9001' | 'ISO14001' | 'ISO45001',
      detailType: 'FormRecord.Reopened',
      source: 'cumplify.forms',
      payload: { recordId, justification },
    });

    return getFormRecordById(recordId, tenantId);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

// ─── Task 8 (REC-7): record PDF export + sealing ─────────────────────────────

/**
 * exportFormRecordPdf — REC-7: "export ANY record to PDF" (no status guard).
 * Builds the record content JSON (labels resolved to the tenant's document
 * locale), writes it to the GeneralBucket content plane, renders via the
 * shared PdfRenderFn (sha-cached: unchanged records skip chromium), and
 * returns a 15-minute presigned URL (STO-4 parity with requestImsExport).
 */
async function exportFormRecordPdf(event: AppSyncEvent, tenantId: string): Promise<unknown> {
  const recordId = event.arguments.recordId as string;
  if (!recordId) throw new Error('BAD_REQUEST: recordId required');
  if (!CONTENT_BUCKET || !PDF_RENDER_FN) throw new Error('EXPORT_NOT_CONFIGURED');

  const locale = await getTenantDocumentLocale(tenantId);
  const txn = await beginTenantTransaction(tenantId);
  let built: BuiltRecordContent;
  try {
    built = await buildRecordContent(txn, recordId, locale);
    await txn.commit();
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }

  const rendered = await renderRecordPdf(tenantId, recordId, built);
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: rendered.pdfKey }),
    { expiresIn: EXPORT_URL_TTL_SECONDS },
  );
  const expiresAt = new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000).toISOString();
  return { url, expiresAt };
}

/**
 * Seal an approved record (REC-7/ACC-7). Runs INSIDE approveFormRecord's
 * transaction AFTER the status flip (the content build re-reads the row, so
 * the sealed PDF shows APPROVED + approver). Mirrors the m1 STO-5 discipline:
 * per-object ObjectLockRetainUntilDate from the tenant's m4.retention_policies
 * row (default seeded if absent), m4.records pointer row carrying retain_until
 * == object_lock_until, forms.records.m4_record_id stamped in the SAME txn —
 * a failed seal rolls back the approval (no approved-but-unsealed records).
 */
async function sealApprovedRecord(
  txn: TenantTransaction,
  tenantId: string,
  recordId: string,
  actor: string,
  templateStandards: string[],
): Promise<Record<string, unknown>> {
  // Tenant retention policy (RLS-scoped); seed the default row if absent.
  const polRes = await txn.execute(
    `SELECT retention_years FROM m4.retention_policies
     WHERE record_type = 'form_record' LIMIT 1`,
  );
  let years = DEFAULT_RETENTION_YEARS;
  const polRows = marshalRecordRows(polRes);
  if (polRows.length > 0) {
    years = polRows[0].retentionYears as number;
  } else {
    await txn.execute(
      `INSERT INTO m4.retention_policies (tenant_id, record_type, retention_years, disposition_rule, created_by)
       VALUES (:tenantId, 'form_record', :years, 'review_before_disposal', :actor)`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'years', value: { longValue: DEFAULT_RETENTION_YEARS } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
  }

  const locale = await getTenantDocumentLocale(tenantId);
  const built = await buildRecordContent(txn, recordId, locale);
  const rendered = await renderRecordPdf(tenantId, recordId, built);

  const retainUntil = new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000);
  const sealedKey = `tenants/${tenantId}/sealed/records/${recordId}-${rendered.sha256.slice(0, 12)}.pdf`;
  await s3.send(new CopyObjectCommand({
    Bucket: EVIDENCE_BUCKET,
    Key: sealedKey,
    CopySource: encodeURIComponent(`${CONTENT_BUCKET}/${rendered.pdfKey}`),
    ObjectLockMode: EVIDENCE_LOCK_MODE as 'GOVERNANCE' | 'COMPLIANCE',
    ObjectLockRetainUntilDate: retainUntil,
  }));

  // BC-6: multi-standard templates seal as 'IMS' (m4.records CHECK widened in 011).
  const effective = effectiveStandard(templateStandards);
  const m4Res = await txn.execute(
    `INSERT INTO m4.records
       (tenant_id, standard, record_type, source_module, retention_class,
        retain_until, s3_object_ref, object_lock_until, created_by)
     VALUES (:tenantId, :standard, 'form_record', 'M4', :retClass,
             :retainUntil::timestamptz, :objectRef, :retainUntil::timestamptz, :actor)
     RETURNING id`,
    [
      { name: 'tenantId', value: { stringValue: tenantId } },
      { name: 'standard', value: { stringValue: effective } },
      { name: 'retClass', value: { stringValue: `${years}y` } },
      { name: 'retainUntil', value: { stringValue: retainUntil.toISOString() } },
      { name: 'objectRef', value: { stringValue: `s3://${EVIDENCE_BUCKET}/${sealedKey}` } },
      { name: 'actor', value: { stringValue: actor } },
    ],
  );
  const m4RecordId = unwrapField((m4Res.records![0] as Array<Record<string, unknown>>)[0]) as string;

  // ACC-7: pointer stamped in the SAME transaction as the approval flip.
  await txn.execute(
    `UPDATE forms.records SET m4_record_id = :m4Id::uuid, updated_at = NOW() WHERE id = :id::uuid`,
    [
      { name: 'm4Id', value: { stringValue: m4RecordId } },
      { name: 'id', value: { stringValue: recordId } },
    ],
  );

  return {
    sealed: true, sealedKey, m4RecordId, retentionYears: years,
    lockMode: EVIDENCE_LOCK_MODE, retainUntil: retainUntil.toISOString(),
  };
}

interface BuiltRecordContent {
  content: Record<string, unknown>;
  title: string;
  standard: string;
  versionNo: number;
}

function recordContentKey(tenantId: string, recordId: string): string {
  return `tenants/${tenantId}/records/${recordId}.json`;
}

/**
 * Effective standard for a template's standards[] array: seed rows carry
 * 'IMS' alongside the concrete standards (BC-6), so strip it — exactly one
 * concrete standard left means a single-standard template, anything else
 * seals/renders as IMS.
 */
function effectiveStandard(standards: string[]): string {
  const concrete = (standards ?? []).filter(s => s !== 'IMS');
  return concrete.length === 1 ? concrete[0] : 'IMS';
}

/** Upload the content JSON and render it through the shared PdfRenderFn. */
async function renderRecordPdf(
  tenantId: string,
  recordId: string,
  built: BuiltRecordContent,
): Promise<{ pdfKey: string; sha256: string }> {
  const contentKey = recordContentKey(tenantId, recordId);
  await s3.send(new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: contentKey,
    Body: JSON.stringify(built.content),
    ContentType: 'application/json',
  }));

  const invoke = await lambdaClient.send(new InvokeCommand({
    FunctionName: PDF_RENDER_FN,
    Payload: JSON.stringify({
      tenantId,
      documents: [{
        documentId: recordId,
        versionId: `${recordId}-v${built.versionNo}`,
        contentKey,
        title: built.title,
        docType: 'form_record',
        standard: built.standard,
        versionNo: built.versionNo,
      }],
    }),
  }));
  if (invoke.FunctionError) {
    logger.error('record PDF render failed', { raw: new TextDecoder().decode(invoke.Payload) });
    throw new Error('RENDER_FAILED');
  }
  const { results } = JSON.parse(new TextDecoder().decode(invoke.Payload)) as {
    results: Array<{ pdfKey: string; sha256: string }>;
  };
  if (!results?.[0]?.pdfKey) throw new Error('RENDER_FAILED');
  return { pdfKey: results[0].pdfKey, sha256: results[0].sha256 };
}

/**
 * Build the form_record content JSON (pdf-export template contract). All
 * labels are resolved HERE from the shared i18n catalogs — the PDF service
 * renders strings it is given. Reads run inside the caller's transaction, so
 * a seal after the approval UPDATE sees the approved row.
 */
async function buildRecordContent(
  txn: TenantTransaction,
  recordId: string,
  locale: string,
): Promise<BuiltRecordContent> {
  const recResult = await txn.execute(`
    SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by, r.completed_at,
           r.approved_by, r.approved_at, r.m2_nc_id, r.version, r.created_at, r.updated_at
    FROM forms.records r WHERE r.id = :id::uuid
  `, [{ name: 'id', value: { stringValue: recordId } }]);
  const recRows = marshalRecordRows(recResult);
  if (recRows.length === 0) throw new Error('RECORD_NOT_FOUND');
  const rec = recRows[0];
  const templateId = rec.templateId as string;

  const tplResult = await txn.execute(`
    SELECT key, title_key, category, clause_refs, standards, requires_approval
    FROM forms.templates WHERE id = :id::uuid
  `, [{ name: 'id', value: { stringValue: templateId } }]);
  const tpl = marshalRecordRows(tplResult)[0];
  if (!tpl) throw new Error('TEMPLATE_METADATA_MISSING');
  const standards = (tpl.standards as string[]) ?? [];
  const title = resolveLabel(locale, tpl.titleKey as string);

  const sectionsResult = await txn.execute(`
    SELECT s.id, s.section_key, s.title_key
    FROM forms.template_sections s
    WHERE s.template_id = :id::uuid ORDER BY s.sort_order
  `, [{ name: 'id', value: { stringValue: templateId } }]);
  const sections = marshalRecordRows(sectionsResult);

  const fieldsResult = await txn.execute(`
    SELECT f.id, f.section_id, f.field_key, f.label_key, f.field_type, f.required, f.relation_target
    FROM forms.template_fields f
    JOIN forms.template_sections s ON f.section_id = s.id
    WHERE s.template_id = :id::uuid ORDER BY s.sort_order, f.sort_order
  `, [{ name: 'id', value: { stringValue: templateId } }]);
  const fields = marshalRecordRows(fieldsResult);

  const valuesResult = await txn.execute(`
    SELECT f.field_key, rv.value_text, rv.value_number, rv.value_date,
           rv.value_bool, rv.value_uuid, rv.value_json
    FROM forms.record_values rv
    JOIN forms.template_fields f ON rv.field_id = f.id
    WHERE rv.record_id = :id::uuid
  `, [{ name: 'id', value: { stringValue: recordId } }]);
  const values = marshalValues(valuesResult);

  // Clause relations render as "ISO9001 8.7 — Title", not a bare UUID.
  // Other relation targets render the UUID (display resolution per target
  // table is a named carry-forward, not silently pretty-printed).
  const clauseDisplay = new Map<string, string>();
  for (const f of fields) {
    if (f.relationTarget !== 'clause') continue;
    const v = values[f.fieldKey as string];
    if (typeof v !== 'string' || clauseDisplay.has(v)) continue;
    const clauseRes = await txn.execute(
      `SELECT standard, clause_no, clause_title FROM qms.clause_registry WHERE id = :id::uuid`,
      [{ name: 'id', value: { stringValue: v } }],
    );
    const row = marshalRecordRows(clauseRes)[0];
    if (row) clauseDisplay.set(v, `${row.standard} ${row.clauseNo} — ${row.clauseTitle}`);
  }

  const recordSections = sections.map(sec => ({
    key: sec.sectionKey as string,
    title: resolveLabel(locale, sec.titleKey as string),
    fields: fields
      .filter(f => f.sectionId === sec.id)
      .map(f => {
        const raw = values[f.fieldKey as string];
        const filled = raw !== null && raw !== undefined;
        return {
          key: f.fieldKey as string,
          label: resolveLabel(locale, f.labelKey as string),
          type: f.fieldType as string,
          required: f.required === true,
          filled,
          display: filled ? formatFieldValue(f.fieldType as string, f.relationTarget as string | null, raw, locale, clauseDisplay) : '',
        };
      }),
  }));

  const content = {
    kind: 'form_record',
    locale,
    template: {
      key: tpl.key,
      title,
      category: tpl.category,
      clauseRefs: tpl.clauseRefs ?? [],
      standards,
      requiresApproval: tpl.requiresApproval === true,
    },
    record: {
      id: rec.id,
      status: rec.status,
      openedBy: rec.openedBy,
      completedBy: rec.completedBy ?? null,
      completedAt: rec.completedAt ?? null,
      approvedBy: rec.approvedBy ?? null,
      approvedAt: rec.approvedAt ?? null,
      m2NcId: rec.m2NcId ?? null,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    },
    recordSections,
  };

  return {
    content,
    title,
    standard: effectiveStandard(standards),
    versionNo: (rec.version as number) ?? 1,
  };
}

/** Human display for a typed record value (labels/booleans localized). */
function formatFieldValue(
  fieldType: string,
  relationTarget: string | null,
  raw: unknown,
  locale: string,
  clauseDisplay: Map<string, string>,
): string {
  switch (fieldType) {
    case 'checkbox':
      return raw === true ? resolveLabel(locale, 'forms.pdf.yes') : resolveLabel(locale, 'forms.pdf.no');
    case 'multiselect': {
      try {
        const arr = JSON.parse(String(raw)) as unknown;
        if (Array.isArray(arr)) return arr.map(String).join(', ');
      } catch { /* fall through to String(raw) */ }
      return String(raw);
    }
    case 'date':
      return String(raw).slice(0, 10);
    case 'relation':
      if (relationTarget === 'clause') return clauseDisplay.get(String(raw)) ?? String(raw);
      return String(raw);
    default:
      return String(raw);
  }
}

/**
 * Tenant document locale (same DDB item getTenantSettings reads — META/ORG).
 * Defaults gracefully to 'en' like getTenantSettings itself: locale is a
 * rendering preference, not a correctness gate.
 */
async function getTenantDocumentLocale(tenantId: string): Promise<string> {
  try {
    const ddb = await getTenantDdbClient(tenantId);
    const result = await ddb.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ PK: `TENANT#${tenantId}#META`, SK: 'ORG' }),
    }));
    const loc = result.Item ? (unmarshall(result.Item).documentLocale as string | undefined) : undefined;
    return loc && loc in MESSAGES ? loc : 'en';
  } catch (err) {
    logger.warn('documentLocale read failed — defaulting to en', { error: (err as Error).message });
    return 'en';
  }
}

/** Resolve an i18n catalog key to the locale's string (en fallback, then the key itself). */
function resolveLabel(locale: string, key: string): string {
  const walk = (root: unknown): unknown =>
    key.split('.').reduce<unknown>(
      (o, part) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[part] : undefined),
      root,
    );
  const v = walk(MESSAGES[locale] ?? MESSAGES.en) ?? walk(MESSAGES.en);
  if (typeof v === 'string') return v;
  logger.warn('i18n key missing from catalogs — rendering the key', { key, locale });
  return key;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Template field metadata for completion (Task 10 shape: fetched ONCE per
 * call, completion computed in code — never per-record round trips).
 */
async function fetchTemplateFieldMeta(
  txn: TenantTransaction,
  templateId: string,
): Promise<Array<{ fieldKey: string; required: boolean }>> {
  const result = await txn.execute(`
    SELECT f.field_key, f.required
    FROM forms.template_fields f
    JOIN forms.template_sections s ON f.section_id = s.id
    WHERE s.template_id = :templateId::uuid
  `, [{ name: 'templateId', value: { stringValue: templateId } }]);
  const allKeys = extractFieldKeys(result);
  const requiredKeys = new Set(extractRequiredFieldKeys(result));
  return allKeys.map(k => ({ fieldKey: k, required: requiredKeys.has(k) }));
}

/** Compute FormCompletion (design §2.4) from field meta + filled keys. */
function completionFrom(
  fieldsMeta: Array<{ fieldKey: string; required: boolean }>,
  filledKeys: Set<string>,
): { fieldsFilled: number; fieldsTotal: number; requiredMissing: string[] } {
  return {
    fieldsFilled: filledKeys.size,
    fieldsTotal: fieldsMeta.length,
    requiredMissing: fieldsMeta.filter(f => f.required && !filledKeys.has(f.fieldKey)).map(f => f.fieldKey),
  };
}

/** Get a record by ID (after mutation, for return value). */
async function getFormRecordById(recordId: string, tenantId: string): Promise<unknown> {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by,
             r.m2_nc_id, r.created_at, r.updated_at
      FROM forms.records r WHERE r.id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    const rows = marshalRecordRows(result);
    if (rows.length === 0) throw new Error('RECORD_NOT_FOUND');
    const rec = rows[0];

    const valResult = await txn.execute(`
      SELECT f.field_key, rv.value_text, rv.value_number, rv.value_date,
             rv.value_bool, rv.value_uuid, rv.value_json
      FROM forms.record_values rv
      JOIN forms.template_fields f ON rv.field_id = f.id
      WHERE rv.record_id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    const values = marshalValues(valResult);
    rec.values = JSON.stringify(values);
    const fieldsMeta = await fetchTemplateFieldMeta(txn, rec.templateId as string);
    rec.completion = completionFrom(fieldsMeta, new Set(Object.keys(values)));

    await txn.commit();
    return rec;
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask the original error */ }
    throw err;
  }
}

/** Build the value SqlParameter based on the target column. */
function buildValueParam(valueColumn: string, value: unknown): SqlParameter {
  switch (valueColumn) {
    case 'value_text':
      return { name: 'val', value: { stringValue: String(value) } };
    case 'value_number':
      return { name: 'val', value: { stringValue: String(value) } }; // Data API uses stringValue for numeric
    case 'value_date':
      return { name: 'val', value: { stringValue: String(value) } }; // ISO timestamp string
    case 'value_bool':
      return { name: 'val', value: { booleanValue: Boolean(value) } };
    case 'value_uuid':
      return { name: 'val', value: { stringValue: String(value) } }; // UUID as string
    case 'value_json':
      return { name: 'val', value: { stringValue: JSON.stringify(value) } }; // JSONB
    default:
      return { name: 'val', value: { stringValue: String(value) } };
  }
}

/** Generate SET clause to null out all other value columns. */
function nullOtherColumns(activeColumn: string): string {
  const ALL_VALUE_COLUMNS = ['value_text', 'value_number', 'value_date', 'value_bool', 'value_uuid', 'value_json'];
  return ALL_VALUE_COLUMNS
    .filter(c => c !== activeColumn)
    .map(c => `${c} = NULL`)
    .join(', ');
}

// ─── Data API Marshalling (forms-specific) ───────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function unwrapField(field: Record<string, unknown>): unknown {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  if (field.arrayValue !== undefined) {
    const arr = field.arrayValue as { stringValues?: string[] };
    return arr.stringValues ?? [];
  }
  return Object.values(field)[0] ?? null;
}

function marshalTemplates(result: DataApiResult): Record<string, unknown>[] {
  if (!result.records || !result.columnMetadata) return [];
  return result.records.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columnMetadata!.length; i++) {
      const col = result.columnMetadata![i].name ?? `col${i}`;
      obj[snakeToCamel(col)] = unwrapField(row[i]);
    }
    // Rename for SDL compliance
    obj.clauseRefs = obj.clauseRefs ?? [];
    obj.standards = obj.standards ?? [];
    obj.sections = []; // Not loaded in list view
    return obj;
  });
}

function marshalTemplateDetail(
  tplResult: DataApiResult,
  sectionsResult: DataApiResult,
  fieldsResult: DataApiResult,
): Record<string, unknown> | null {
  const templates = marshalTemplates(tplResult);
  if (templates.length === 0) return null;
  const tpl = templates[0];

  const sections: Record<string, unknown>[] = [];
  if (sectionsResult.records && sectionsResult.columnMetadata) {
    for (const row of sectionsResult.records) {
      const sec: Record<string, unknown> = {};
      for (let i = 0; i < sectionsResult.columnMetadata.length; i++) {
        const col = sectionsResult.columnMetadata[i].name ?? `col${i}`;
        sec[snakeToCamel(col)] = unwrapField(row[i]);
      }
      sec.fields = [];
      sections.push(sec);
    }
  }

  // Attach fields to their sections
  if (fieldsResult.records && fieldsResult.columnMetadata) {
    const sectionMap = new Map(sections.map(s => [s.id as string, s]));
    for (const row of fieldsResult.records) {
      const field: Record<string, unknown> = {};
      for (let i = 0; i < fieldsResult.columnMetadata.length; i++) {
        const col = fieldsResult.columnMetadata[i].name ?? `col${i}`;
        field[snakeToCamel(col)] = unwrapField(row[i]);
      }
      const sec = sectionMap.get(field.sectionId as string);
      if (sec) (sec.fields as Record<string, unknown>[]).push(field);
    }
  }

  tpl.sections = sections;
  return tpl;
}

function marshalRecordRows(result: DataApiResult): Record<string, unknown>[] {
  if (!result.records || !result.columnMetadata) return [];
  return result.records.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < result.columnMetadata!.length; i++) {
      const col = result.columnMetadata![i].name ?? `col${i}`;
      const camel = snakeToCamel(col);
      obj[camel] = unwrapField(row[i]);
    }
    // Map status to uppercase enum
    if (typeof obj.status === 'string') {
      obj.status = obj.status.toUpperCase().replace(/_/g, '_');
    }
    return obj;
  });
}

function marshalValues(result: DataApiResult): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (!result.records || !result.columnMetadata) return obj;
  for (const row of result.records) {
    let fieldKey = '';
    let value: unknown = null;
    for (let i = 0; i < result.columnMetadata.length; i++) {
      const col = result.columnMetadata[i].name ?? '';
      const v = unwrapField(row[i]);
      if (col === 'field_key') { fieldKey = v as string; continue; }
      if (v !== null && col !== 'field_key') { value = v; }
    }
    if (fieldKey) obj[fieldKey] = value;
  }
  return obj;
}

interface FieldMeta { fieldId: string; fieldType: string; relationTarget: string | null }

interface FieldMetaFull { fieldKey: string; fieldType: string; required: boolean; mapsToColumn: string | null; relationTarget: string | null }

function marshalFieldMetaFull(result: DataApiResult): FieldMetaFull[] {
  const fields: FieldMetaFull[] = [];
  if (!result.records || !result.columnMetadata) return fields;
  for (const row of result.records) {
    let key = '', type = '', mapsTo: string | null = null, relTarget: string | null = null;
    let required = false;
    for (let i = 0; i < result.columnMetadata.length; i++) {
      const col = result.columnMetadata[i].name ?? '';
      const v = unwrapField(row[i]);
      if (col === 'field_key') key = v as string;
      if (col === 'field_type') type = v as string;
      if (col === 'required') required = v === true;
      if (col === 'maps_to_column') mapsTo = v as string | null;
      if (col === 'relation_target') relTarget = v as string | null;
    }
    if (key) fields.push({ fieldKey: key, fieldType: type, required, mapsToColumn: mapsTo, relationTarget: relTarget });
  }
  return fields;
}

function marshalFieldMeta(result: DataApiResult): Map<string, FieldMeta> {
  const map = new Map<string, FieldMeta>();
  if (!result.records || !result.columnMetadata) return map;
  for (const row of result.records) {
    let id = '', key = '', type = '', relTarget: string | null = null;
    for (let i = 0; i < result.columnMetadata.length; i++) {
      const col = result.columnMetadata[i].name ?? '';
      const v = unwrapField(row[i]);
      if (col === 'id') id = v as string;
      if (col === 'field_key') key = v as string;
      if (col === 'field_type') type = v as string;
      if (col === 'relation_target') relTarget = v as string | null;
    }
    if (key) map.set(key, { fieldId: id, fieldType: type, relationTarget: relTarget });
  }
  return map;
}

function extractFieldKeys(result: DataApiResult): string[] {
  const keys: string[] = [];
  if (!result.records || !result.columnMetadata) return keys;
  const keyIdx = result.columnMetadata.findIndex(c => c.name === 'field_key');
  if (keyIdx < 0) return keys;
  for (const row of result.records) {
    keys.push(unwrapField(row[keyIdx]) as string);
  }
  return keys;
}

function extractRequiredFieldKeys(result: DataApiResult): string[] {
  const keys: string[] = [];
  if (!result.records || !result.columnMetadata) return keys;
  const keyIdx = result.columnMetadata.findIndex(c => c.name === 'field_key');
  const reqIdx = result.columnMetadata.findIndex(c => c.name === 'required');
  if (keyIdx < 0 || reqIdx < 0) return keys;
  for (const row of result.records) {
    if (unwrapField(row[reqIdx]) === true) {
      keys.push(unwrapField(row[keyIdx]) as string);
    }
  }
  return keys;
}

