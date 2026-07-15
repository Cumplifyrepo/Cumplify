/**
 * GraphQL enum → DB value mappings.
 *
 * GraphQL enums are UPPERCASE (QUALITY, DRAFT, etc.).
 * DB CHECK constraints use lowercase (quality, draft, etc.).
 * EXCEPTION: `standard` is stored verbatim (ISO9001, ISO14001, ISO45001) — no mapping needed.
 *
 * Each mapping is cross-checked against the exact CHECK lists in migrations 002-006.
 * A blanket toLowerCase() is NOT used because `standard` values would break.
 */

// ─── M1 Document Studio (migration 002) ─────────────────────────────────────

/** CHECK (doc_type IN ('manual', 'procedure', 'work_instruction', 'policy', 'scope')) */
export const DOC_TYPE_MAP: Record<string, string> = {
  MANUAL: 'manual',
  PROCEDURE: 'procedure',
  WORK_INSTRUCTION: 'work_instruction',
  POLICY: 'policy',
  SCOPE: 'scope',
  // spec-40 Task 6 (migration 016): DERIVED documents — registry × section
  // state, never model-authored. Not offered in the hand-create form.
  CORRELATION_MATRIX: 'correlation_matrix',
  MASTER_LIST: 'master_list',
};

/** CHECK (status IN ('draft', 'in_review', 'approved', 'obsolete')) */
export const DOC_STATUS_MAP: Record<string, string> = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  OBSOLETE: 'obsolete',
};

/** CHECK (decision IN ('approved', 'rejected', 'returned')) */
export const APPROVAL_DECISION_MAP: Record<string, string> = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED: 'returned',
};

// ─── M2 CAPA (migration 003) ────────────────────────────────────────────────

/** CHECK (source IN ('audit', 'incident', 'complaint', 'process')) */
export const NC_SOURCE_MAP: Record<string, string> = {
  AUDIT: 'audit',
  INCIDENT: 'incident',
  COMPLAINT: 'complaint',
  PROCESS: 'process',
};

/** CHECK (nc_type IN ('nonconforming_output', 'nc', 'incident')) */
export const NC_TYPE_MAP: Record<string, string> = {
  NONCONFORMING_OUTPUT: 'nonconforming_output',
  NC: 'nc',
  INCIDENT: 'incident',
};

/** CHECK (severity IN ('low', 'medium', 'high', 'critical')) */
export const SEVERITY_MAP: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/** CHECK (status IN ('open', 'in_progress', 'closed', 'verified')) — CAPA status */
export const CAPA_STATUS_MAP: Record<string, string> = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  VERIFIED: 'verified',
};

/** CHECK (method IN ('5why', 'fishbone', 'fta')) */
export const RCA_METHOD_MAP: Record<string, string> = {
  '5WHY': '5why',
  FISHBONE: 'fishbone',
  FTA: 'fta',
};

/** CHECK (disposition IN ('rework', 'scrap', 'concession', 'regrade')) */
export const DISPOSITION_MAP: Record<string, string> = {
  REWORK: 'rework',
  SCRAP: 'scrap',
  CONCESSION: 'concession',
  REGRADE: 'regrade',
};

// ─── M3 Audit Studio (migration 004) ────────────────────────────────────────

/** CHECK (finding_type IN ('major_nc', 'minor_nc', 'observation', 'ofi')) */
export const FINDING_TYPE_MAP: Record<string, string> = {
  MAJOR_NC: 'major_nc',
  MINOR_NC: 'minor_nc',
  OBSERVATION: 'observation',
  OFI: 'ofi',
};

// ─── M5 Risk Management (migration 006) ─────────────────────────────────────

/** CHECK (category IN ('quality', 'environmental', 'ohs', 'opportunity')) */
export const RISK_CATEGORY_MAP: Record<string, string> = {
  QUALITY: 'quality',
  ENVIRONMENTAL: 'environmental',
  OHS: 'ohs',
  OPPORTUNITY: 'opportunity',
};

/** CHECK (status IN ('running', 'complete', 'failed', 'partial')) — qms.generation_runs (migration 011) */
export const GENERATION_RUN_STATUS_MAP: Record<string, string> = {
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed',
  PARTIAL: 'partial',
};

/** CHECK (status IN ('pending', 'prose', 'gap', 'na_justified', 'failed')) — qms.generation_sections (011); SDL enum SectionKind */
export const SECTION_KIND_MAP: Record<string, string> = {
  PENDING: 'pending',
  PROSE: 'prose',
  GAP: 'gap',
  NA_JUSTIFIED: 'na_justified',
  FAILED: 'failed',
};

// ─── Shared helper ───────────────────────────────────────────────────────────

/**
 * Map a GraphQL enum value to its DB representation.
 * Throws if the value is not in the mapping (prevents silent CHECK violations).
 */
export function mapEnum(map: Record<string, string>, value: string, fieldName: string): string {
  const mapped = map[value];
  if (mapped === undefined) {
    throw new Error(`Invalid enum value '${value}' for field '${fieldName}'. Allowed: ${Object.keys(map).join(', ')}`);
  }
  return mapped;
}
