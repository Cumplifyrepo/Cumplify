/**
 * Derived document content — GEN-4/GEN-8/BC-8 (spec 40, design §3/§4.1).
 *
 * Everything here is DERIVED from registry × section state and the org
 * profile — never model-authored. The BC-1 disclaimer and the ISO purchase
 * link are fixed front-matter, not generated.
 */

export interface SectionState {
  sectionKey: string;
  kind: 'prose' | 'gap' | 'na_justified' | 'failed';
  clauses: Array<{
    standard: string;
    clauseNo: string;
    clauseTitle: string;
    annexSlMode: string;
    docType: string;
  }>;
  /** parsed section content JSON from S3 (sentences/gap/naJustification) */
  content: Record<string, unknown> | null;
  sortOrder: number;
}

export const BC1_DISCLAIMER =
  'This manual was generated from the organization’s own recorded data. ' +
  'Where required information was absent, the affected section is shown as an ' +
  'explicit gap — nothing has been invented to fill it. This document is not ' +
  'a substitute for the official ISO standards; purchase the official texts at ' +
  'https://www.iso.org/store.html.';

const ISO_STORE_URL = 'https://www.iso.org/store.html';

interface ProfileShape {
  legalName?: string;
  sites?: Array<{ name?: string; city?: string; state?: string; country?: string }>;
  standardsInScope?: string[];
  managementRep?: string;
  documentLocale?: string;
}

export function buildFrontMatter(profile: ProfileShape, standards: string[]): Record<string, unknown> {
  const siteLines = (profile.sites ?? [])
    .filter(s => s?.name)
    .map(s => [s.name, s.city, s.state, s.country].filter(Boolean).join(', '));
  return {
    purpose: BC1_DISCLAIMER,
    scope: {
      organization: profile.legalName ?? null,
      standards,
      sites: siteLines,
      managementRepresentative: profile.managementRep ?? null,
    },
    normativeRefs: standards.map(s => ({ standard: s, source: ISO_STORE_URL })),
    terms: [],
  };
}

/** Manual content JSON (§3): front matter + every section in clause order. */
export function assembleManualContent(
  documentId: string,
  locale: string,
  profile: ProfileShape,
  standards: string[],
  sections: SectionState[],
): Record<string, unknown> {
  const ordered = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.sectionKey.localeCompare(b.sectionKey),
  );
  return {
    schemaVersion: 1,
    documentId,
    versionNo: 1,
    locale,
    frontMatter: buildFrontMatter(profile, standards),
    sections: ordered.map(s => ({
      harmonizationKey: s.sectionKey,
      clauseRefs: s.clauses.map(c => ({ standard: c.standard, clauseNo: c.clauseNo })),
      kind: s.kind,
      ...(s.content?.sentences !== undefined ? { sentences: s.content.sentences } : {}),
      ...(s.content?.gap !== undefined ? { gap: s.content.gap } : {}),
      ...(s.content?.naJustification !== undefined ? { naJustification: s.content.naJustification } : {}),
      ...(s.kind === 'failed' ? { failed: true } : {}),
    })),
  };
}

/**
 * Standards Correlation Matrix (GEN-8): per harmonization section, which
 * clause of which standard it covers and how (Annex SL mode + section kind).
 */
export function deriveCorrelationMatrix(
  documentId: string,
  locale: string,
  standards: string[],
  sections: SectionState[],
): Record<string, unknown> {
  const ordered = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.sectionKey.localeCompare(b.sectionKey),
  );
  return {
    schemaVersion: 1,
    documentId,
    versionNo: 1,
    locale,
    kind: 'correlation_matrix',
    standards,
    rows: ordered.map(s => ({
      harmonizationKey: s.sectionKey,
      sectionKind: s.kind,
      coverage: s.clauses.map(c => ({
        standard: c.standard,
        clauseNo: c.clauseNo,
        clauseTitle: c.clauseTitle,
        annexSlMode: c.annexSlMode,
      })),
    })),
  };
}

export interface MasterListEntry {
  documentId: string;
  title: string;
  docType: string;
  standard: string;
  clauseRefs: string[];
  status: string;
  versionNo: number;
  contentRef: string;
}

/** Documented-Information Master List (7.5): every document this run produced. */
export function deriveMasterList(
  documentId: string,
  locale: string,
  entries: MasterListEntry[],
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    documentId,
    versionNo: 1,
    locale,
    kind: 'master_list',
    generatedCount: entries.length,
    entries,
  };
}

/** IMS when the run spans multiple standards, else the single standard (GEN-4). */
export function documentStandard(standards: string[]): string {
  return standards.length > 1 ? 'IMS' : standards[0];
}

/** Clause-document title: "<clauseTitle> (<harmonization key>)". */
export function clauseDocTitle(section: SectionState): string {
  const first = section.clauses[0];
  return first ? `${first.clauseTitle} (${section.sectionKey})` : section.sectionKey;
}
