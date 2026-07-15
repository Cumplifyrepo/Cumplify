/**
 * SeedSections grouping — GEN-3 by construction (spec 40, design §4.1, CLR-2).
 *
 * shared        → ONE section per harmonization_key covering every in-scope
 *                 standard that has a member row (Annex SL integration).
 * forked        → one section PER STANDARD sharing the spine key.
 * standard_only → one section, its own standard.
 *
 * Section identity (generation_sections.harmonization_key, the
 * UNIQUE(run_id, harmonization_key) spine): the bare spine key for shared
 * sections; `<key>#<standard>` for forked/standard_only so per-standard
 * sections of the same spine key cannot collide. Task 7's diff aligns on
 * this same value — the convention is part of the content contract.
 *
 * Exclusions (clause_applicability, ORG-4): excluded member clauses drop out;
 * a section whose members are ALL excluded becomes `na_justified` carrying the
 * justifications (never silently omitted).
 */

export interface RegistryClause {
  id: string;
  standard: string;
  clauseNo: string;
  clauseTitle: string;
  intentParaphrase: string;
  annexSlMode: 'shared' | 'forked' | 'standard_only';
  harmonizationKey: string;
  docType: string;
  requiredSources: string[];
  sortOrder: number;
}

export interface Exclusion {
  clauseRegistryId: string;
  justification: string;
}

export interface SectionPlan {
  /** value stored in generation_sections.harmonization_key (unique per run) */
  sectionKey: string;
  /** the registry spine key */
  harmonizationKey: string;
  standards: string[];
  clauses: RegistryClause[];
  docType: string;
  sortOrder: number;
  status: 'pending' | 'na_justified';
  naJustification?: string;
}

export function groupSections(
  registry: RegistryClause[],
  inScopeStandards: string[],
  exclusions: Exclusion[],
): SectionPlan[] {
  const inScope = new Set(inScopeStandards);
  const excludedById = new Map(exclusions.map(e => [e.clauseRegistryId, e.justification]));

  const rows = registry.filter(c => inScope.has(c.standard));

  // Bucket by section identity
  const buckets = new Map<string, { key: string; hk: string; members: RegistryClause[] }>();
  for (const c of rows) {
    const sectionKey = c.annexSlMode === 'shared'
      ? c.harmonizationKey
      : `${c.harmonizationKey}#${c.standard}`;
    let bucket = buckets.get(sectionKey);
    if (!bucket) {
      bucket = { key: sectionKey, hk: c.harmonizationKey, members: [] };
      buckets.set(sectionKey, bucket);
    }
    bucket.members.push(c);
  }

  const plans: SectionPlan[] = [];
  for (const { key, hk, members } of buckets.values()) {
    const active = members.filter(m => !excludedById.has(m.id));
    const excluded = members.filter(m => excludedById.has(m.id));

    if (active.length === 0) {
      // Every member clause excluded → N/A section, justification carried (ORG-4)
      plans.push({
        sectionKey: key,
        harmonizationKey: hk,
        standards: [...new Set(members.map(m => m.standard))].sort(),
        clauses: members,
        docType: members[0].docType,
        sortOrder: Math.min(...members.map(m => m.sortOrder)),
        status: 'na_justified',
        naJustification: excluded
          .map(m => `${m.standard} ${m.clauseNo}: ${excludedById.get(m.id)}`)
          .join('; '),
      });
      continue;
    }

    plans.push({
      sectionKey: key,
      harmonizationKey: hk,
      standards: [...new Set(active.map(m => m.standard))].sort(),
      clauses: active,
      docType: active[0].docType,
      sortOrder: Math.min(...active.map(m => m.sortOrder)),
      status: 'pending',
    });
  }

  return plans.sort((a, b) => a.sortOrder - b.sortOrder || a.sectionKey.localeCompare(b.sectionKey));
}
