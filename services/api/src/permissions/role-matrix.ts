/**
 * Part 13 Permission Matrix — HITL approval rights per role.
 * Versioned shared module consumed by hitl-approval.ts (step 2).
 *
 * Source: cumplify-CONSOLIDATED-master-architecture-v7-full.md Part 13.1–13.2
 * 12 roles × module write permissions. canApprove checks if the role has
 * write access to the artifact's module (write = can approve HITL items).
 *
 * SoD rules (enforced elsewhere, not in this map):
 * - author ≠ approver (per-artifact check in the approval Lambda)
 * - auditor-independence (Internal Auditor cannot audit processes where they hold write)
 * - incident-investigator ≠ area supervisor
 */

/** Modules where each role has write (and therefore approval) permission */
const ROLE_WRITE_MODULES: Record<string, ReadonlySet<string>> = {
  // Role 1: Top Management / Executive — approve policies (M1 policy only), 9.3 outputs
  'top-management': new Set(['M1']),
  // Role 2: Management Rep / IMS Lead — full write across all modules
  'management-rep': new Set(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13']),
  // Role 3: Quality Manager — quality domains
  'quality-manager': new Set(['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M11', 'M12', 'M13']),
  // Role 4: EHS Manager — environmental + OH&S domains
  'ehs-manager': new Set(['M5', 'M7', 'M8', 'M9', 'M10', 'M11']),
  // Role 5: Document Controller — M1/M14 full lifecycle
  'document-controller': new Set(['M1']),
  // Role 6: Internal Auditor — M3 full, read-only everywhere else
  'internal-auditor': new Set(['M3']),
  // Role 7: External Auditor (guest) — read-only, time-boxed
  'external-auditor': new Set([]),
  // Role 8: Process Owner — write within assigned processes only (row-level)
  'process-owner': new Set(['M1', 'M2', 'M5']),
  // Role 9: Supervisor — M10 hazard/incident, M13 training
  'supervisor': new Set(['M10', 'M13']),
  // Role 10: Employee / Worker — incident reporting only
  'employee': new Set(['M10']),
  // Role 11: Contractor (limited) — incident reporting only
  'contractor': new Set(['M10']),
  // Role 12: Partner Consultant — delegated per-tenant, per-role access (handled at auth layer)
  'partner-consultant': new Set([]),
};

/**
 * Check if a role has approval permission for a HITL item in the given module.
 * Returns true if the role has write access to the module.
 * Unknown roles default to false (deny).
 */
export function canApprove(role: string, module: string): boolean {
  const modules = ROLE_WRITE_MODULES[role];
  if (!modules) return false;
  return modules.has(module);
}

/**
 * Get all modules a role can approve for (utility for UI display).
 */
export function getApprovalModules(role: string): readonly string[] {
  const modules = ROLE_WRITE_MODULES[role];
  if (!modules) return [];
  return [...modules];
}

/** All known roles (for validation) */
export const KNOWN_ROLES = Object.keys(ROLE_WRITE_MODULES);
