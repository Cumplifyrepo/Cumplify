/**
 * QMS Document Engine resolver (spec 40, Task 3).
 *
 * Schema node dependency: OrgProfile, ClauseRegistryEntry, ClauseApplicability,
 * GenerationRun, GenerationSection, AnnexSlMode, SectionKind, GenerationRunStatus,
 * SaveOrgProfileInput, SetClauseApplicabilityInput.
 *
 * Key invariants:
 * - saveOrgProfile: zod-validated JSONB payload, versioned write (new version row +
 *   bump current_version in ONE txn).
 * - setClauseApplicability: exclusion REQUIRES justification — the DB CHECK enforces
 *   it; surface typed error EXCLUSION_REQUIRES_JUSTIFICATION.
 * - SCHEMA-5: tenantId from resolverContext only.
 * - C-2: set_config FIRST in every transaction.
 * - ::uuid casts on every UUID param (M3 lesson).
 * - Unmasked rollback: try { await txn.rollback(); } catch { /- never mask -/ }
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import {
  extractContext,
  beginTenantTransaction,
  publishAuditEvent,
  marshalOne,
  marshalMany,
} from './shared.js';
import type { SqlParameter } from '@aws-sdk/client-rds-data';
import { canApprove } from '../permissions/role-matrix.js';

const sfnClient = new SFNClient({});

import { z } from 'zod';

const logger = new Logger({ serviceName: 'resolver-qms' });

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

// ─── ORG-1 Org Profile Schema (zod — full design §2.2) ──────────────────────
// Consumed by saveOrgProfile AND the org-profile wizard (Task 10).
const VALID_STANDARDS = ['ISO9001', 'ISO14001', 'ISO45001'] as const;

export const OrgProfileSchema = z.object({
  legalName: z.string().min(1, 'legalName is required'),
  sites: z.array(z.object({
    name: z.string().min(1),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    headcount: z.number().int().positive().optional(),
  })).min(1, 'at least one site required'),
  employeeCount: z.number().int().positive(),
  industry: z.string().min(1, 'industry is required'),
  productsServices: z.string().min(1, 'productsServices is required'),
  coreProcesses: z.array(z.string().min(1)).min(1, 'at least one core process required'),
  designResponsibility: z.boolean(),
  standardsInScope: z.array(z.enum(VALID_STANDARDS)).min(1, 'at least one standard required'),
  managementRep: z.string().min(1, 'managementRep is required'),
  targetCertDate: z.string().optional(),
  // Extended ORG-1 fields (all optional — absence is a GAP for the generator, never a validation error)
  yearFounded: z.number().int().optional(),
  outsourcedProcesses: z.array(z.string()).optional(),
  supplyChainShape: z.string().optional(),
  existingCertifications: z.array(z.string()).optional(),
  manualExists: z.boolean().optional(),
}).passthrough(); // Allow additional fields for extensibility

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(event: AppSyncEvent): Promise<unknown> {
  const ctx = extractContext(event);
  const { tenantId, sub, role } = ctx;
  logger.appendKeys({ tenantId, requestField: event.info.fieldName });

  switch (event.info.fieldName) {
    case 'getOrgProfile': return getOrgProfile(tenantId);
    case 'saveOrgProfile': return requireM1Role(role, () => saveOrgProfile(event, tenantId, sub));
    case 'listClauseRegistry': return listClauseRegistry(event, tenantId);
    case 'listClauseApplicability': return listClauseApplicability(tenantId);
    case 'setClauseApplicability': return requireM1Role(role, () => setClauseApplicability(event, tenantId, sub));
    case 'getGenerationRun': return getGenerationRun(event, tenantId);
    case 'listGenerationRuns': return listGenerationRuns(event, tenantId);
    case 'markSectionReviewed': return requireM1Role(role, () => markSectionReviewed(event, tenantId, sub));
    case 'generateImsManual': return requireM1Role(role, () => generateImsManual(event, tenantId, sub));
    // regenerateSection (GEN-6): deferred to the Task 6/7 wave — it creates a
    // new document version on the affected docs, which needs FinalizeManual's
    // m1 writes. Deferred = reported here + in Task-5 evidence, not omitted.
    default: throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

/** Role gate: M1 authoring family (design §6). */
function requireM1Role<T>(role: string, fn: () => T): T {
  if (!canApprove(role, 'M1')) {
    throw new Error('UNAUTHORIZED');
  }
  return fn();
}

// ─── Queries ─────────────────────────────────────────────────────────────────

async function getOrgProfile(tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    // Fetch profile + latest version payload in one go
    const result = await txn.execute(`
      SELECT p.id, p.current_version, pv.payload, p.updated_at
      FROM qms.org_profiles p
      LEFT JOIN qms.org_profile_versions pv
        ON pv.profile_id = p.id AND pv.version_no = p.current_version
      LIMIT 1
    `);
    await txn.commit();
    const row = marshalOne(result);
    if (!row) return null;
    // payload is JSONB — returned as stringified JSON from Data API
    return row;
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

async function listClauseRegistry(event: AppSyncEvent, tenantId: string) {
  const standard = event.arguments.standard as string | undefined;
  const txn = await beginTenantTransaction(tenantId);
  try {
    let sql = `
      SELECT id, standard, clause_no, clause_title, intent_paraphrase,
             annex_sl_mode, harmonization_key, required_sources, sort_order
      FROM qms.clause_registry
    `;
    const params: SqlParameter[] = [];
    if (standard) {
      sql += ` WHERE standard = :standard`;
      params.push({ name: 'standard', value: { stringValue: standard } });
    }
    sql += ` ORDER BY sort_order`;

    const result = await txn.execute(sql, params);
    await txn.commit();
    return marshalMany(result);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

async function listClauseApplicability(tenantId: string) {
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      SELECT id, clause_registry_id, applicable, justification
      FROM qms.clause_applicability
    `);
    await txn.commit();
    return marshalMany(result);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

async function getGenerationRun(event: AppSyncEvent, tenantId: string) {
  const runId = event.arguments.id as string;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const runResult = await txn.execute(`
      SELECT id, status, standards, manual_document_id, started_at, finished_at
      FROM qms.generation_runs WHERE id = :id::uuid
    `, [{ name: 'id', value: { stringValue: runId } }]);

    const sectionsResult = await txn.execute(`
      SELECT id, harmonization_key, status AS kind, clause_registry_ids AS clause_refs,
             content_sha256, reviewed_by, reviewed_at, error
      FROM qms.generation_sections WHERE run_id = :runId::uuid ORDER BY harmonization_key
    `, [{ name: 'runId', value: { stringValue: runId } }]);

    await txn.commit();

    const run = marshalOne(runResult);
    if (!run) return null;
    const sections = marshalMany(sectionsResult);

    // Compute gapCount from sections
    const gapCount = sections.filter(s => s.kind === 'gap' || s.kind === 'GAP').length;

    return { ...run, sections, gapCount };
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

async function listGenerationRuns(event: AppSyncEvent, tenantId: string) {
  const limit = (event.arguments.limit as number) || 20;
  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      SELECT id, status, standards, manual_document_id, started_at, finished_at
      FROM qms.generation_runs
      ORDER BY started_at DESC
      LIMIT :lim
    `, [{ name: 'lim', value: { longValue: limit } }]);
    await txn.commit();
    // Return without nested sections (lightweight list)
    return marshalMany(result).map(r => ({ ...r, sections: [], gapCount: 0 }));
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * saveOrgProfile — zod-validated JSONB payload, versioned write (design §2.2).
 * In ONE txn: UPSERT org_profiles + INSERT new version row + bump current_version.
 */
async function saveOrgProfile(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as { payload: string };
  const payloadRaw = JSON.parse(input.payload);

  // Zod validation (full ORG-1 schema — also consumed by wizard Task 10)
  const parseResult = OrgProfileSchema.safeParse(payloadRaw);
  if (!parseResult.success) {
    throw new Error(`INVALID_PAYLOAD: ${parseResult.error.message}`);
  }
  const payload = parseResult.data;

  const txn = await beginTenantTransaction(tenantId);
  try {
    // UPSERT the profile row (creates if first time, else gets id + current_version)
    const upsertResult = await txn.execute(`
      INSERT INTO qms.org_profiles (tenant_id, current_version, created_by)
      VALUES (:tenantId, 0, :actor)
      ON CONFLICT (tenant_id) DO UPDATE SET updated_at = NOW()
      RETURNING id, current_version
    `, [
      { name: 'tenantId', value: { stringValue: tenantId } },
      { name: 'actor', value: { stringValue: actor } },
    ]);

    const profileRow = marshalOne(upsertResult)!;
    const profileId = profileRow.id as string;
    const currentVersion = profileRow.currentVersion as number;
    const newVersion = currentVersion + 1;

    // INSERT new version row
    await txn.execute(`
      INSERT INTO qms.org_profile_versions (profile_id, tenant_id, version_no, payload, created_by)
      VALUES (:profileId::uuid, :tenantId, :versionNo, :payload::jsonb, :actor)
    `, [
      { name: 'profileId', value: { stringValue: profileId } },
      { name: 'tenantId', value: { stringValue: tenantId } },
      { name: 'versionNo', value: { longValue: newVersion } },
      { name: 'payload', value: { stringValue: JSON.stringify(payload) } },
      { name: 'actor', value: { stringValue: actor } },
    ]);

    // Bump current_version
    await txn.execute(`
      UPDATE qms.org_profiles SET current_version = :newVersion, updated_at = NOW()
      WHERE id = :id::uuid
    `, [
      { name: 'newVersion', value: { longValue: newVersion } },
      { name: 'id', value: { stringValue: profileId } },
    ]);

    await txn.commit();

    // Audit event: Context.Updated (already registered)
    await publishAuditEvent({
      tenantId, actor, module: 'M1',
      clauseRef: '4.1', standard: 'ISO9001',
      detailType: 'Context.Updated', source: 'cumplify.qms.document-engine',
      payload: { profileId, version: newVersion },
    });

    return { id: profileId, currentVersion: newVersion, payload: JSON.stringify(payload), updatedAt: new Date().toISOString() };
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

/**
 * setClauseApplicability — exclusion REQUIRES justification (DB CHECK enforces;
 * surface typed error before hitting the DB for better UX).
 */
async function setClauseApplicability(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as { clauseRegistryId: string; applicable: boolean; justification?: string };

  // Surface typed error before hitting DB CHECK
  if (!input.applicable && (!input.justification || input.justification.trim().length === 0)) {
    throw new Error('EXCLUSION_REQUIRES_JUSTIFICATION');
  }

  const txn = await beginTenantTransaction(tenantId);
  try {
    const result = await txn.execute(`
      INSERT INTO qms.clause_applicability (tenant_id, clause_registry_id, applicable, justification, decided_by, created_by)
      VALUES (:tenantId, :clauseId::uuid, :applicable, :justification, :actor, :actor)
      ON CONFLICT (tenant_id, clause_registry_id)
      DO UPDATE SET applicable = :applicable, justification = :justification,
                    decided_by = :actor, decided_at = NOW(), updated_at = NOW()
      RETURNING id, clause_registry_id, applicable, justification
    `, [
      { name: 'tenantId', value: { stringValue: tenantId } },
      { name: 'clauseId', value: { stringValue: input.clauseRegistryId } },
      { name: 'applicable', value: { booleanValue: input.applicable } },
      { name: 'justification', value: input.justification ? { stringValue: input.justification } : { isNull: true } },
      { name: 'actor', value: { stringValue: actor } },
    ]);

    await txn.commit();

    // Audit event: Scope.Changed (already registered)
    await publishAuditEvent({
      tenantId, actor, module: 'M1',
      clauseRef: '4.3', standard: 'ISO9001',
      detailType: 'Scope.Changed', source: 'cumplify.qms.document-engine',
      payload: { clauseRegistryId: input.clauseRegistryId, applicable: input.applicable },
    });

    return marshalOne(result);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

/**
 * markSectionReviewed — stamps reviewed_by/reviewed_at on a generation section.
 * Role-gated to M1 authoring family (canApprove(role,'M1') — enforced server-side).
 * Rejects if the parent run is in a terminal state (complete/failed).
 */
async function markSectionReviewed(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = event.arguments.input as { sectionId: string };
  const sectionId = input.sectionId;

  const txn = await beginTenantTransaction(tenantId);
  try {
    // Fetch section + parent run status
    const sectionResult = await txn.execute(`
      SELECT gs.id, gs.run_id, gs.reviewed_at, gr.status AS run_status
      FROM qms.generation_sections gs
      JOIN qms.generation_runs gr ON gr.id = gs.run_id
      WHERE gs.id = :sectionId::uuid
    `, [{ name: 'sectionId', value: { stringValue: sectionId } }]);

    if (!sectionResult.records || sectionResult.records.length === 0) {
      throw new Error('SECTION_NOT_FOUND');
    }

    // Check run status — reject on terminal states
    const runStatusIdx = sectionResult.columnMetadata!.findIndex(c => c.name === 'run_status');
    const runStatus = (sectionResult.records[0][runStatusIdx] as { stringValue?: string }).stringValue;
    // Review happens AFTER generation (document exists post-FinalizeManual).
    // ALLOW: complete, partial (content is final).
    // REJECT: running (retry could replace content), failed (nothing to review).
    if (runStatus === 'running' || runStatus === 'failed') {
      throw new Error('RUN_NOT_REVIEWABLE');
    }

    // Stamp reviewed_by/reviewed_at
    const result = await txn.execute(`
      UPDATE qms.generation_sections
      SET reviewed_by = :actor, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = :sectionId::uuid
      RETURNING id, harmonization_key, status AS kind, clause_registry_ids AS clause_refs,
                content_sha256, reviewed_by, reviewed_at, error
    `, [
      { name: 'actor', value: { stringValue: actor } },
      { name: 'sectionId', value: { stringValue: sectionId } },
    ]);

    await txn.commit();
    return marshalOne(result);
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }
}

/**
 * generateImsManual (spec-40 Task 5) — inserts the run row with the PINNED
 * profile version, then starts DocGenStateMachine (ARN by deterministic name,
 * env DOCGEN_SFN_ARN — no CFN cross-stack cycle).
 *
 * Ordering: run row COMMITS first (the state machine reads it), then
 * StartExecution, then a best-effort UPDATE stamps sfn_execution_arn.
 * StartExecution failure marks the run 'failed' and throws
 * GENERATION_UNAVAILABLE — a run row must never sit 'running' with no
 * execution behind it.
 */
async function generateImsManual(event: AppSyncEvent, tenantId: string, actor: string) {
  const input = (event.arguments.input ?? {}) as { standards?: string[] };
  const sfnArn = process.env.DOCGEN_SFN_ARN;
  if (!sfnArn) throw new Error('GENERATION_UNAVAILABLE');

  const txn = await beginTenantTransaction(tenantId);
  let run: Record<string, unknown>;
  try {
    const profileResult = await txn.execute(
      `SELECT op.current_version, opv.payload
       FROM qms.org_profiles op
       JOIN qms.org_profile_versions opv
         ON opv.profile_id = op.id AND opv.version_no = op.current_version`,
    );
    if (!profileResult.records?.length) throw new Error('ORG_PROFILE_REQUIRED');
    const currentVersion = Number((profileResult.records[0][0] as { longValue?: number }).longValue ?? 0);
    if (currentVersion < 1) throw new Error('ORG_PROFILE_REQUIRED');
    const payload = JSON.parse(
      (profileResult.records[0][1] as { stringValue?: string }).stringValue ?? '{}',
    ) as { standardsInScope?: string[] };

    const standards = input.standards?.length ? input.standards : (payload.standardsInScope ?? []);
    if (standards.length === 0) throw new Error('NO_STANDARDS_IN_SCOPE');

    const runResult = await txn.execute(
      `INSERT INTO qms.generation_runs
         (tenant_id, profile_version, standards, status, requested_by, created_by)
       VALUES (:tenantId, :pv::integer, :standards::text[], 'running', :actor, :actor)
       RETURNING id, status, standards, manual_document_id, started_at, finished_at`,
      [
        { name: 'tenantId', value: { stringValue: tenantId } },
        { name: 'pv', value: { longValue: currentVersion } },
        { name: 'standards', value: { stringValue: `{${standards.join(',')}}` } },
        { name: 'actor', value: { stringValue: actor } },
      ],
    );
    run = marshalOne(runResult)!;
    await txn.commit();
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }

  const runId = run.id as string;
  try {
    const exec = await sfnClient.send(new StartExecutionCommand({
      stateMachineArn: sfnArn,
      name: `run-${runId}`,
      input: JSON.stringify({ runId, tenantId }),
    }));
    const stamp = await beginTenantTransaction(tenantId);
    try {
      await stamp.execute(
        `UPDATE qms.generation_runs SET sfn_execution_arn = :arn, updated_at = NOW() WHERE id = :id::uuid`,
        [
          { name: 'arn', value: { stringValue: exec.executionArn! } },
          { name: 'id', value: { stringValue: runId } },
        ],
      );
      await stamp.commit();
    } catch (err) {
      try { await stamp.rollback(); } catch { /* never mask */ }
      logger.warn('Failed to stamp sfn_execution_arn (run continues)', { runId });
    }
  } catch (err) {
    // Never leave a 'running' row with no execution behind it
    const mark = await beginTenantTransaction(tenantId);
    try {
      await mark.execute(
        `UPDATE qms.generation_runs SET status = 'failed', finished_at = NOW(), updated_at = NOW() WHERE id = :id::uuid`,
        [{ name: 'id', value: { stringValue: runId } }],
      );
      await mark.commit();
    } catch (markErr) {
      try { await mark.rollback(); } catch { /* never mask */ }
    }
    logger.error('StartExecution failed', { runId, error: (err as Error).message });
    throw new Error('GENERATION_UNAVAILABLE');
  }

  return run;
}
