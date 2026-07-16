/**
 * House-style validator — standalone CI check over GENERATED fixtures
 * (spec 40, Task 12 / NFR-3 / ACC-10 / BC-2).
 *
 * Fixtures: services/qms-generation/__tests__/fixtures/golden-manuals/*.json —
 * REAL manuals generated live from the 10 golden org profiles
 * (fixtures/golden-orgs.json) through the deployed pipeline, committed
 * verbatim. Every prose sentence in every fixture must pass checker.ts's
 * house-style rules: no "shall", no bullets, no placeholders, no second
 * person, no banned standard-text fragments, organization-as-subject.
 *
 * Scope note (honest): assertion-coverage RESOLUTION (factRef → assembled
 * fact) is a runtime/ledger concern (BC-4, checked in compose + T5 readback);
 * here factKeys is the fixture's own factRef union, so this lane checks
 * presence-of-citation + STYLE, which is exactly the Task 12 mandate.
 * The negative cases below pin every violation class so a regression in
 * checker.ts itself also fails CI.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSection, type ComposedSentence } from '../src/checker.js';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'golden-manuals');

interface FixtureSection {
  harmonizationKey: string;
  kind: string;
  sentences?: ComposedSentence[];
}
interface FixtureManual {
  frontMatter: { scope: { organization: string | null } };
  sections: FixtureSection[];
}

function loadFixtures(): Array<{ file: string; manual: FixtureManual }> {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      manual: JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as FixtureManual,
    }));
}

describe('house-style CI validator over generated golden-set manuals (NFR-3/ACC-10)', () => {
  const fixtures = loadFixtures();

  it('golden set present: >= 10 generated manuals committed as fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it('every prose section of every golden manual passes the house-style checker', () => {
    const failures: string[] = [];
    let proseSections = 0;

    for (const { file, manual } of fixtures) {
      const orgName = manual.frontMatter?.scope?.organization ?? '';
      expect(orgName).not.toBe('');
      for (const section of manual.sections) {
        if (section.kind !== 'prose' || !section.sentences?.length) continue;
        proseSections++;
        const factKeys = new Set(section.sentences.flatMap((s) => s.factRefs ?? []));
        const result = checkSection({ sentences: section.sentences, factKeys, orgName });
        if (!result.pass) {
          failures.push(`${file} ${section.harmonizationKey}: ${result.violations.join('; ')}`);
        }
      }
    }

    // A golden set with no prose at all would pass vacuously — forbid that.
    expect(proseSections).toBeGreaterThanOrEqual(30);
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('gap sections carry NO prose sentences (gaps are never padded with text)', () => {
    for (const { file, manual } of fixtures) {
      for (const section of manual.sections) {
        if (section.kind === 'gap') {
          expect(section.sentences ?? [], `${file} ${section.harmonizationKey}`).toEqual([]);
        }
      }
    }
  });
});

describe('house-style checker negative pins (a checker regression fails CI too)', () => {
  const factKeys = new Set(['org_profile.legalName']);
  const orgName = 'Acme Corp';
  const sentence = (text: string): ComposedSentence => ({
    text,
    factRefs: ['org_profile.legalName'],
  });

  const cases: Array<[string, string, string]> = [
    ['shall', 'Acme Corp shall maintain documented information.', 'contains "shall"'],
    ['bullet marker', '- Acme Corp maintains records.', 'bullet marker'],
    ['placeholder', 'Acme Corp stores records at {{LOCATION}}.', 'placeholder pattern'],
    ['second person', 'You must keep your records current at Acme Corp.', 'second person'],
    [
      'banned fragment',
      'Acme Corp follows this International Standard for quality.',
      'banned standard-text fragment',
    ],
    [
      'inline fact marker',
      'Acme Corp reviews requirements before commitment (F1, F3).',
      'inline fact-reference marker',
    ],
  ];

  for (const [name, text, expected] of cases) {
    it(`catches ${name}`, () => {
      const result = checkSection({ sentences: [sentence(text)], factKeys, orgName });
      expect(result.pass).toBe(false);
      expect(result.violations.join(' ')).toContain(expected);
    });
  }

  it('catches missing org-as-subject', () => {
    const result = checkSection({
      sentences: [sentence('Records are maintained and reviewed annually.')],
      factKeys,
      orgName: 'Zenith Ltd',
    });
    expect(result.pass).toBe(false);
    expect(result.violations.join(' ')).toContain('organization-as-subject');
  });

  it('catches uncited sentences (factRef presence)', () => {
    const result = checkSection({
      sentences: [{ text: 'Acme Corp maintains a quality policy.', factRefs: [] }],
      factKeys,
      orgName,
    });
    expect(result.pass).toBe(false);
    expect(result.violations.join(' ')).toContain('no factRefs');
  });
});
