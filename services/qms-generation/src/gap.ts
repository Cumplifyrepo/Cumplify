/**
 * GAP decision — BEFORE any model call (spec 40, design §4.2, BC-3).
 *
 * A section composes prose ONLY when every required source resolves to real
 * tenant data. Missing source → the section is a `gap` block, zero model
 * invocation, $0. Honesty by construction — ACC-4's negative case (empty
 * aspects register ⇒ zero aspect prose) is enforced here, not prompted for.
 *
 * REGISTER_TABLE_MAP maps `register.<name>` sources to real tables. Entries
 * that are null name registers whose module DOES NOT EXIST YET (M6-M8 not
 * built) — they are definitionally empty and always gap. That is correct
 * behavior, not a shortcut: the generator must not invent aspects/hazards
 * data the product cannot hold yet.
 */

export interface RegisterSourceSpec {
  table: string;
  /** SQL expression for a human-readable sample line (used in fact assembly) */
  titleExpr: string;
}

export const REGISTER_TABLE_MAP: Record<string, RegisterSourceSpec | null> = {
  documents: { table: 'm1.documents', titleExpr: 'title' },
  policies: { table: 'm1.policies', titleExpr: 'left(policy_text, 120)' },
  nonconformities: { table: 'm2.nonconformities', titleExpr: 'description' },
  audits: { table: 'm3.audits', titleExpr: 'scope' },
  risks: { table: 'm5.risks', titleExpr: 'description' },
  change_plans: { table: 'm5.change_plans', titleExpr: 'change_desc' },
  // Modules not yet built — definitionally empty, always GAP:
  aspects: null,
  hazards: null,
  competence: null,
  interested_parties: null,
  legal_obligations: null,
  emergency_preparedness: null,
  worker_consultation: null,
  management_reviews: null,
  objectives: null,
  suppliers: null,
};

/** Walk a dot path into the profile payload (same semantics as the Task-10 UI). */
export function getProfileValue(profile: Record<string, unknown>, path: string): unknown {
  let current: unknown = profile;
  for (const p of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export interface GapDecision {
  gap: boolean;
  missingSources: string[];
}

/**
 * Pure decision. `registerCounts` is keyed by register name (`risks`, not
 * `register.risks`); a register absent from the map counts as 0.
 */
export function decideGap(
  requiredSources: string[],
  profile: Record<string, unknown>,
  registerCounts: Record<string, number>,
): GapDecision {
  const missing: string[] = [];
  for (const src of requiredSources) {
    if (src.startsWith('org_profile.')) {
      if (isEmpty(getProfileValue(profile, src.slice('org_profile.'.length)))) missing.push(src);
    } else if (src.startsWith('register.')) {
      const name = src.slice('register.'.length);
      if ((registerCounts[name] ?? 0) <= 0) missing.push(src);
    } else {
      // Unknown source scheme: treat as missing — never compose on a source
      // we cannot resolve (fail toward GAP, not toward invention).
      missing.push(src);
    }
  }
  return { gap: missing.length > 0, missingSources: missing };
}
