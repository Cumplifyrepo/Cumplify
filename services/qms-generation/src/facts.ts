/**
 * Fact assembly — the citable fact set F1..Fn (spec 40, design §4.3, BC-4).
 *
 * Facts come ONLY from tenant data: org-profile fields and register rows.
 * The clause intent paraphrase is scaffolding (shapes the prose) — it is NOT
 * a fact and cannot be cited. Absent profile fields produce no fact: what the
 * tenant never said cannot be cited, so the checker rejects any sentence that
 * would need it (assertion coverage closes the invention loophole).
 *
 * Every fact carries `source` (the ledger's fact_source column) so the
 * assertion ledger records precisely which tenant datum backed each sentence.
 */

import { createHash } from 'node:crypto';

export interface Fact {
  key: string;    // F1..Fn — what the model cites in factRefs
  source: string; // org_profile.<path> | register.<name>[count] | register.<name>[sample]
  text: string;   // the fact as given to the model
}

export interface RegisterData {
  name: string;
  count: number;
  samples: string[];
}

interface SiteShape {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  headcount?: number;
}

function present(v: unknown): boolean {
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
}

/** Profile fields → fact templates. Only non-empty fields become facts. */
export function buildProfileFacts(profile: Record<string, unknown>): Omit<Fact, 'key'>[] {
  const facts: Omit<Fact, 'key'>[] = [];
  const add = (path: string, text: string) => facts.push({ source: `org_profile.${path}`, text });

  if (present(profile.legalName)) add('legalName', `The organization's legal name is ${profile.legalName}.`);
  if (present(profile.industry)) add('industry', `The organization operates in the ${profile.industry} industry.`);
  if (present(profile.productsServices)) add('productsServices', `Products and services: ${profile.productsServices}.`);
  if (present(profile.employeeCount)) add('employeeCount', `The organization employs ${profile.employeeCount} people.`);
  if (present(profile.managementRep)) add('managementRep', `The named management representative is ${profile.managementRep}.`);
  if (present(profile.yearFounded)) add('yearFounded', `The organization was founded in ${profile.yearFounded}.`);
  if (present(profile.supplyChainShape)) add('supplyChainShape', `Supply-chain shape: ${profile.supplyChainShape}.`);
  if (present(profile.targetCertDate)) add('targetCertDate', `Target certification date: ${profile.targetCertDate}.`);
  if (profile.designResponsibility !== undefined) {
    add('designResponsibility', profile.designResponsibility
      ? 'The organization carries design and development responsibility.'
      : 'The organization does not carry design and development responsibility.');
  }
  // Boolean false is PRESENT — encode both branches (golden-eval round-1
  // finding, Task 12: present(false)===true fed "maintains an existing quality
  // manual" to orgs whose profile said manualExists:false; the model then
  // faithfully cited the wrong fact). Mirrors the designResponsibility ternary.
  if (profile.manualExists !== undefined) {
    add('manualExists', profile.manualExists
      ? 'The organization maintains an existing quality manual.'
      : 'The organization does not yet have a quality manual; this document establishes it.');
  }
  if (present(profile.coreProcesses)) {
    add('coreProcesses', `Core processes: ${(profile.coreProcesses as string[]).join(', ')}.`);
  }
  if (present(profile.outsourcedProcesses)) {
    add('outsourcedProcesses', `Outsourced processes: ${(profile.outsourcedProcesses as string[]).join(', ')}.`);
  }
  if (present(profile.existingCertifications)) {
    add('existingCertifications', `Existing certifications: ${(profile.existingCertifications as string[]).join(', ')}.`);
  }
  if (present(profile.standardsInScope)) {
    add('standardsInScope', `Standards in scope: ${(profile.standardsInScope as string[]).join(', ')}.`);
  }
  if (Array.isArray(profile.sites)) {
    (profile.sites as SiteShape[]).forEach((site, i) => {
      if (!present(site?.name)) return;
      const locality = [site.address, site.city, site.state, site.country].filter(Boolean).join(', ');
      const headcount = present(site.headcount) ? ` (headcount ${site.headcount})` : '';
      add(`sites.${i}`, `The organization operates a site "${site.name}"${locality ? ` at ${locality}` : ''}${headcount}.`);
    });
  }
  return facts;
}

/** Register data → count fact + optional sample fact. */
export function buildRegisterFacts(reg: RegisterData): Omit<Fact, 'key'>[] {
  if (reg.count <= 0) return []; // empty register is a GAP, never a fact
  const facts: Omit<Fact, 'key'>[] = [{
    source: `register.${reg.name}[count]`,
    text: `The ${reg.name.replace(/_/g, ' ')} register currently holds ${reg.count} ${reg.count === 1 ? 'entry' : 'entries'}.`,
  }];
  if (reg.samples.length > 0) {
    facts.push({
      source: `register.${reg.name}[sample]`,
      text: `Entries in the ${reg.name.replace(/_/g, ' ')} register include: ${reg.samples.join('; ')}.`,
    });
  }
  return facts;
}

/** Number the assembled facts F1..Fn. */
export function assembleFacts(
  profile: Record<string, unknown>,
  registers: RegisterData[],
): Fact[] {
  const unnumbered = [
    ...buildProfileFacts(profile),
    ...registers.flatMap(buildRegisterFacts),
  ];
  return unnumbered.map((f, i) => ({ key: `F${i + 1}`, ...f }));
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
