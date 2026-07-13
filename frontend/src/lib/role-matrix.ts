/**
 * Frontend role-matrix — CON-6: presentation-only gating (server always enforces).
 * Mirrors services/api/src/permissions/role-matrix.ts vocabulary.
 * Uses the normalizeRole alias map for Cognito PascalCase groups (BUG-11a).
 *
 * M4 fix: full ROLE_WRITE_MODULES mirror for per-module canApprove().
 */

/** Cognito PascalCase group → kebab-case slug (BUG-11a) */
const COGNITO_GROUP_ROLES: Record<string, string> = {
  TopManagement: 'top-management',
  IMSLead: 'management-rep',
  QualityManager: 'quality-manager',
  EHSManager: 'ehs-manager',
  DocumentController: 'document-controller',
  Employee: 'employee',
};

/** Map a raw custom:role claim to a matrix key. */
export function normalizeRole(role: string): string {
  return COGNITO_GROUP_ROLES[role] ?? role;
}

/** Part 13 permission map — modules where each role has write (approval) permission. */
const ROLE_WRITE_MODULES: Record<string, ReadonlySet<string>> = {
  'top-management': new Set(['M1']),
  'management-rep': new Set(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13']),
  'quality-manager': new Set(['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M11', 'M12', 'M13']),
  'ehs-manager': new Set(['M5', 'M7', 'M8', 'M9', 'M10', 'M11']),
  'document-controller': new Set(['M1']),
  'internal-auditor': new Set(['M3']),
  'external-auditor': new Set([]),
  'process-owner': new Set(['M1', 'M2', 'M5']),
  'supervisor': new Set(['M10', 'M13']),
  'employee': new Set(['M10']),
  'contractor': new Set(['M10']),
  'partner-consultant': new Set([]),
};

/** Roles that can see /settings (Pool B admin-tier roles). */
const ADMIN_ROLES = new Set([
  'top-management',
  'management-rep',
  'quality-manager',
  'ehs-manager',
  'document-controller',
]);

/** Can this role see the admin/settings nav section? */
export function canSeeAdmin(role: string): boolean {
  return ADMIN_ROLES.has(normalizeRole(role));
}

/**
 * Per-module approval check — mirrors backend canApprove(role, module).
 * Returns true if the role has write access to the given module.
 * Unknown roles default to false (deny).
 */
export function canApprove(role: string, module: string): boolean {
  const modules = ROLE_WRITE_MODULES[normalizeRole(role)];
  if (!modules) return false;
  return modules.has(module);
}

/** Human-readable label for the role claim. */
export function roleLabel(role: string): string {
  const slug = normalizeRole(role);
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** All known roles (for validation/testing). */
export const KNOWN_ROLES = Object.keys(ROLE_WRITE_MODULES);
