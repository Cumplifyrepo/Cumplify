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
  type TenantTransaction,
  type DataApiResult,
} from './shared.js';
import type { SqlParameter } from '@aws-sdk/client-rds-data';

const logger = new Logger({ serviceName: 'resolver-forms' });

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
  clause: 'qms.clause_registry', // pending migration 011 (spec-40 Task 1)
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
      throw new Error('NOT_IMPLEMENTED: exportFormRecordPdf gated on spec-40 BC-10');
    default:
      throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * listFormTemplates — returns all templates (tenant-less catalog).
 * TPL-3: filters by the tenant's standards in scope (falls back to all until
 * an org profile exists). sectionCount/fieldCount are COUNTs over rows (BC-1).
 */
async function listFormTemplates(_tenantId: string): Promise<unknown[]> {
  const txn = await beginTenantTransaction(_tenantId);
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
    await txn.commit();
    return marshalTemplates(result);
  } catch (err) {
    await txn.rollback();
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
    await txn.rollback();
    throw err;
  }
}

/**
 * listFormRecords — tenant-scoped record listing per template.
 * NOTE: This closes the standing BLOCKED listRecords item from frontend-app Task 29.
 * Server-computed FormCompletion joined to each record.
 */
async function listFormRecords(event: AppSyncEvent, tenantId: string): Promise<unknown[]> {
  const templateId = event.arguments.templateId as string;
  const status = event.arguments.status as string | undefined;
  const txn = await beginTenantTransaction(tenantId);
  try {
    let sql = `
      SELECT r.id, r.template_id, r.status, r.opened_by, r.completed_by,
             r.m2_nc_id, r.created_at, r.updated_at
      FROM forms.records r
      WHERE r.template_id = :templateId::uuid
    `;
    const params: SqlParameter[] = [
      { name: 'templateId', value: { stringValue: templateId } },
    ];
    if (status) {
      sql += ` AND r.status = :status`;
      params.push({ name: 'status', value: { stringValue: status.toLowerCase() } });
    }
    sql += ` ORDER BY r.created_at DESC`;

    const result = await txn.execute(sql, params);
    const records = marshalRecordRows(result);

    // Server-computed completion for each record
    for (const rec of records) {
      rec.completion = await computeCompletion(txn, rec.id as string, templateId);
      rec.values = '{}'; // Values returned on getFormRecord only (list is lightweight)
    }

    await txn.commit();
    return records;
  } catch (err) {
    await txn.rollback();
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

    rec.values = JSON.stringify(marshalValues(valResult));
    rec.completion = await computeCompletion(txn, recordId, rec.templateId as string);

    await txn.commit();
    return rec;
  } catch (err) {
    await txn.rollback();
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
    // BUG-1 fix: compute real completion from catalog (not hardcoded 0/0/[])
    rec.completion = await computeCompletion(txn, rec.id as string, templateId);
    rec.values = '{}';
    await txn.commit();
    return rec;
  } catch (err) {
    await txn.rollback();
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
    await txn.rollback();
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
    await txn.rollback();
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
      await txn.rollback();
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
      payload: { recordId, templateId, approvedBy: actor },
    });

    return getFormRecordById(recordId, tenantId);
  } catch (err) {
    if ((err as Error).message !== 'SOD_VIOLATION') {
      await txn.rollback().catch(() => {});
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
    await txn.rollback();
    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Compute FormCompletion server-side (design §2.4). */
async function computeCompletion(
  txn: TenantTransaction,
  recordId: string,
  templateId: string,
): Promise<{ fieldsFilled: number; fieldsTotal: number; requiredMissing: string[] }> {
  // Total fields + required fields for the template
  const totalsResult = await txn.execute(`
    SELECT f.field_key, f.required
    FROM forms.template_fields f
    JOIN forms.template_sections s ON f.section_id = s.id
    WHERE s.template_id = :templateId::uuid
  `, [{ name: 'templateId', value: { stringValue: templateId } }]);

  // Filled fields for this record
  const filledResult = await txn.execute(`
    SELECT f.field_key
    FROM forms.record_values rv
    JOIN forms.template_fields f ON rv.field_id = f.id
    WHERE rv.record_id = :recordId::uuid
  `, [{ name: 'recordId', value: { stringValue: recordId } }]);

  const allFields = extractFieldKeys(totalsResult);
  const requiredFields = extractRequiredFieldKeys(totalsResult);
  const filledKeys = new Set(extractFilledFieldKeys(filledResult));

  const requiredMissing = requiredFields.filter(k => !filledKeys.has(k));

  return {
    fieldsFilled: filledKeys.size,
    fieldsTotal: allFields.length,
    requiredMissing,
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
    rec.completion = await computeCompletion(txn, recordId, rec.templateId as string);

    const valResult = await txn.execute(`
      SELECT f.field_key, rv.value_text, rv.value_number, rv.value_date,
             rv.value_bool, rv.value_uuid, rv.value_json
      FROM forms.record_values rv
      JOIN forms.template_fields f ON rv.field_id = f.id
      WHERE rv.record_id = :id::uuid
    `, [{ name: 'id', value: { stringValue: recordId } }]);
    rec.values = JSON.stringify(marshalValues(valResult));

    await txn.commit();
    return rec;
  } catch (err) {
    await txn.rollback();
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

function extractFilledFieldKeys(result: DataApiResult): string[] {
  const keys: string[] = [];
  if (!result.records || !result.columnMetadata) return keys;
  const keyIdx = result.columnMetadata.findIndex(c => c.name === 'field_key');
  if (keyIdx < 0) return keys;
  for (const row of result.records) {
    keys.push(unwrapField(row[keyIdx]) as string);
  }
  return keys;
}
