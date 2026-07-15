/**
 * GAP decision table (design §4.2) + deterministic checker fixtures (§4.3).
 * The unmapped-sentence case MUST fail — that is the assertion-coverage spine
 * (BC-4) and the explicitly mandated negative fixture.
 */

import { describe, it, expect } from 'vitest';
import { decideGap, REGISTER_TABLE_MAP } from '../src/gap.js';
import { checkSection } from '../src/checker.js';
import { assembleFacts, buildProfileFacts, buildRegisterFacts } from '../src/facts.js';

const PROFILE = {
  legalName: 'MB Design & Remodel LLC',
  sites: [{ name: 'HQ', city: 'Crofton', state: 'MD', country: 'USA' }],
  employeeCount: 12,
  industry: 'Construction',
  productsServices: 'Design-build remodeling',
  coreProcesses: ['estimating', 'construction', 'closeout'],
  designResponsibility: true,
  standardsInScope: ['ISO9001'],
  managementRep: 'Julio Medrano',
};

describe('GAP decision table', () => {
  it('all sources present → no gap', () => {
    const d = decideGap(
      ['org_profile.legalName', 'org_profile.coreProcesses', 'register.risks'],
      PROFILE, { risks: 3 },
    );
    expect(d.gap).toBe(false);
    expect(d.missingSources).toEqual([]);
  });

  it('empty register → gap naming the register, ZERO model cost by construction (ACC-4)', () => {
    const d = decideGap(['org_profile.legalName', 'register.aspects'], PROFILE, {});
    expect(d.gap).toBe(true);
    expect(d.missingSources).toEqual(['register.aspects']);
  });

  it('missing profile field → gap naming the field path', () => {
    const d = decideGap(['org_profile.outsourcedProcesses'], PROFILE, {});
    expect(d.missingSources).toEqual(['org_profile.outsourcedProcesses']);
  });

  it('empty-array profile field counts as missing', () => {
    const d = decideGap(['org_profile.coreProcesses'], { ...PROFILE, coreProcesses: [] }, {});
    expect(d.gap).toBe(true);
  });

  it('boolean false is PRESENT (designResponsibility=false is an answer, not a gap)', () => {
    const d = decideGap(['org_profile.designResponsibility'], { ...PROFILE, designResponsibility: false }, {});
    expect(d.gap).toBe(false);
  });

  it('unknown source scheme fails toward GAP, never toward invention', () => {
    const d = decideGap(['telepathy.vibes'], PROFILE, {});
    expect(d.gap).toBe(true);
  });

  it('REGISTER_TABLE_MAP covers every register named in the 014 seed', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const seed = readFileSync(
      resolve(__dirname, '../../api/migrations/014_qms_registry_seed.sql'), 'utf8',
    );
    const named = new Set([...seed.matchAll(/register\.(\w+)/g)].map(m => m[1]));
    for (const reg of named) {
      expect(REGISTER_TABLE_MAP, `register '${reg}' missing from REGISTER_TABLE_MAP`).toHaveProperty(reg);
    }
  });
});

describe('deterministic checker', () => {
  const facts = assembleFacts(PROFILE, [{ name: 'risks', count: 2, samples: ['supply delay'] }]);
  const factKeys = new Set(facts.map(f => f.key));
  const ctx = { factKeys, orgName: 'MB Design & Remodel LLC' };

  it('positive fixture: cited, styled prose passes', () => {
    const r = checkSection({
      ...ctx,
      sentences: [
        { text: 'MB Design & Remodel LLC assigns quality responsibility to Julio Medrano.', factRefs: ['F1', 'F5'] },
      ],
    });
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('UNMAPPED SENTENCE FAILS: a factRef that resolves to nothing is a violation (BC-4)', () => {
    const r = checkSection({
      ...ctx,
      sentences: [{ text: 'The organization maintains meticulous records.', factRefs: ['F999'] }],
    });
    expect(r.pass).toBe(false);
    expect(r.violations.join(' ')).toContain("factRef 'F999' does not resolve");
  });

  it('sentence with zero factRefs fails', () => {
    const r = checkSection({
      ...ctx,
      sentences: [{ text: 'The organization is committed to excellence.', factRefs: [] }],
    });
    expect(r.pass).toBe(false);
  });

  it('"shall" fails house style', () => {
    const r = checkSection({
      ...ctx,
      sentences: [{ text: 'The organization shall maintain documented information.', factRefs: ['F1'] }],
    });
    expect(r.violations.join(' ')).toContain('shall');
  });

  it('bullets, placeholders, and second person each fail', () => {
    const r = checkSection({
      ...ctx,
      sentences: [
        { text: '- The organization does things', factRefs: ['F1'] },
        { text: 'The organization at [Company] will decide TBD.', factRefs: ['F1'] },
        { text: 'You must review your processes at the organization.', factRefs: ['F1'] },
      ],
    });
    expect(r.violations.join(' ')).toContain('bullet');
    expect(r.violations.join(' ')).toContain('placeholder');
    expect(r.violations.join(' ')).toContain('second person');
  });

  it('banned standard-text fragment fails (CLR-3 screen)', () => {
    const r = checkSection({
      ...ctx,
      sentences: [{ text: 'The organization conforms to this International Standard.', factRefs: ['F1'] }],
    });
    expect(r.violations.join(' ')).toContain('banned standard-text fragment');
  });

  it('section that never names the organization fails (BC-2)', () => {
    const r = checkSection({
      ...ctx,
      sentences: [{ text: 'Processes are reviewed annually by management.', factRefs: ['F1'] }],
    });
    expect(r.violations.join(' ')).toContain('organization-as-subject');
  });
});

describe('fact assembly', () => {
  it('absent profile fields produce NO fact — what was never said cannot be cited', () => {
    const facts = buildProfileFacts({ legalName: 'X Corp' });
    const sources = facts.map(f => f.source);
    expect(sources).toContain('org_profile.legalName');
    expect(sources).not.toContain('org_profile.outsourcedProcesses');
    expect(sources).not.toContain('org_profile.industry');
  });

  it('empty register produces NO fact (gap, never a citable claim)', () => {
    expect(buildRegisterFacts({ name: 'aspects', count: 0, samples: [] })).toEqual([]);
  });

  it('facts are numbered F1..Fn with ledger-ready sources', () => {
    const facts = assembleFacts(PROFILE, [{ name: 'risks', count: 2, samples: ['a'] }]);
    expect(facts[0].key).toBe('F1');
    expect(facts[facts.length - 1].key).toBe(`F${facts.length}`);
    expect(facts.find(f => f.source === 'register.risks[count]')).toBeTruthy();
    expect(facts.find(f => f.source === 'register.risks[sample]')).toBeTruthy();
  });
});
