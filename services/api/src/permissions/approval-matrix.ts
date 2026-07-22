/**
 * Tenant-configurable records-approval matrix (read-surface-completion RS-6;
 * architecture §8). Storage: DDB governance items
 *   PK = TENANT#<tenantId>#GOVERNANCE
 *   SK = APPROVALMATRIX#<artifactType>#<standard|ANY>
 * The matrix NARROWS who may approve a given artifact type. It can never
 * widen beyond the role-matrix floor nor bypass SoD — enforcement order in
 * the approval Lambda is: canApprove(role, module) floor → SoD → matrix.
 */

import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { canApprove, KNOWN_ROLES } from './role-matrix.js';

export interface ApprovalStep {
  roleSlug: string;
  action: 'review' | 'approve';
}

export interface ApprovalMatrixEntry {
  artifactType: string;
  standard: string | null;
  steps: ApprovalStep[];
  version: number;
  updatedBy?: string;
  updatedAt?: string;
}

/** Writeback tool → approval-matrix artifact type (mirrors TOOL_MODULES vocabulary). */
export const TOOL_ARTIFACTS: Record<string, string> = {
  'doc-publish': 'document',
  'doc-draft-write': 'document',
  'capa-open': 'capa',
  'capa-rootcause': 'capa',
  'capa-verify-effectiveness': 'capa',
  'audit-finding-write': 'audit_finding',
  'audit-checklist-gen': 'audit_checklist',
  'records-retention-schedule': 'retention_policy',
  'risk-assessment-write': 'risk_assessment',
  'nc-triage-write': 'capa',
};

/** Artifact type → module code, for computing Part-13 default approver sets. */
export const ARTIFACT_MODULES: Record<string, string> = {
  document: 'M1',
  capa: 'M2',
  audit_finding: 'M3',
  audit_checklist: 'M3',
  audit_plan: 'M3',
  retention_policy: 'M4',
  release_authorization: 'M4',
  risk_assessment: 'M5',
  change_authorization: 'M5',
};

export const GOVERNANCE_SK_PREFIX = 'APPROVALMATRIX#';

export function governancePk(tenantId: string): string {
  return `TENANT#${tenantId}#GOVERNANCE`;
}

export function matrixSk(artifactType: string, standard?: string | null): string {
  return `${GOVERNANCE_SK_PREFIX}${artifactType}#${standard ?? 'ANY'}`;
}

/** Artifact type for a HITL item: explicit field first, else the writeback tool. */
export function resolveArtifactType(item: Record<string, unknown>): string | null {
  if (typeof item.artifactType === 'string' && item.artifactType) return item.artifactType;
  const tool = (item.proposedAction as Record<string, unknown> | undefined)?.tool;
  if (typeof tool === 'string' && TOOL_ARTIFACTS[tool]) return TOOL_ARTIFACTS[tool];
  return null;
}

interface DdbSender {
  send: (cmd: GetItemCommand) => Promise<{ Item?: Record<string, unknown> }>;
}

/**
 * Fetch the matrix entry for (artifactType, standard), falling back to the
 * standard-agnostic 'ANY' row. Null = tenant has not configured this type
 * (no narrowing — the role-matrix floor alone governs).
 */
export async function getMatrixEntry(
  ddb: DdbSender,
  tableName: string,
  tenantId: string,
  artifactType: string,
  standard?: string | null,
): Promise<ApprovalMatrixEntry | null> {
  const keys = standard
    ? [matrixSk(artifactType, standard), matrixSk(artifactType, null)]
    : [matrixSk(artifactType, null)];
  for (const sk of keys) {
    const res = await ddb.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall({ PK: governancePk(tenantId), SK: sk }),
      }),
    );
    if (res.Item) {
      const item = unmarshall(res.Item as never) as Record<string, unknown>;
      const steps =
        typeof item.steps === 'string'
          ? (JSON.parse(item.steps) as ApprovalStep[])
          : ((item.steps as ApprovalStep[]) ?? []);
      return {
        artifactType,
        standard: (item.standard as string) === 'ANY' ? null : ((item.standard as string) ?? null),
        steps,
        version: (item.version as number) ?? 1,
        updatedBy: item.updatedBy as string | undefined,
        updatedAt: item.updatedAt as string | undefined,
      };
    }
  }
  return null;
}

/**
 * Does the matrix allow this role to APPROVE? Entry null → no narrowing
 * (true). Entries with no approve step are invalid-but-safe: fall back to
 * no narrowing rather than locking the tenant out of approvals.
 */
export function approveAllowedByMatrix(
  entry: ApprovalMatrixEntry | null,
  roleSlug: string,
): boolean {
  if (!entry) return true;
  const approveRoles = entry.steps.filter((s) => s.action === 'approve').map((s) => s.roleSlug);
  if (approveRoles.length === 0) return true;
  return approveRoles.includes(roleSlug);
}

/**
 * Part-13 computed defaults: the roles holding write (=approval) permission
 * on the artifact's module, as a single approve step. Returned by
 * listApprovalMatrix when the tenant has no explicit rows — real effective
 * routing, never fabricated data.
 */
export function defaultStepsFor(artifactType: string): ApprovalStep[] {
  const module = ARTIFACT_MODULES[artifactType];
  if (!module) return [];
  return KNOWN_ROLES.filter((roleSlug) => canApprove(roleSlug, module)).map((roleSlug) => ({
    roleSlug,
    action: 'approve' as const,
  }));
}

/** Tenant-admin roles (Part 13 #1–#5) allowed to edit the matrix. */
export const MATRIX_ADMIN_ROLES = new Set([
  'top-management',
  'management-rep',
  'quality-manager',
  'ehs-manager',
  'document-controller',
]);
