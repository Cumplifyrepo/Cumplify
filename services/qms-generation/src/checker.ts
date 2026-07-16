/**
 * Deterministic post-pass checker — CODE, not model (spec 40, design §4.3).
 * The model never grades its own homework (BC-4).
 *
 * Checks:
 *  1. Assertion coverage (BC-4): every sentence carries ≥1 factRef and every
 *     factRef resolves to a fact actually provided.
 *  2. House style (BC-2/NFR-3): zero "shall" tokens, zero bullet markers,
 *     zero placeholder patterns, organization-as-subject (org named at least
 *     once; second person banned).
 *  3. Standard-text screen (CLR-3): banned-fragment containment scan. The
 *     official standards are NOT in this repo (licensing), so the screen is a
 *     curated fragment list of characteristic standard boilerplate, not an
 *     n-gram diff against the full text. The "shall" token check catches the
 *     dominant class; the list below catches the known shall-free boilerplate.
 *     Extend the list WITH a fixture test when new fragments surface.
 */

export interface ComposedSentence {
  text: string;
  factRefs: string[];
}

export interface CheckInput {
  sentences: ComposedSentence[];
  /** fact key → provided fact (assembleFacts output) */
  factKeys: Set<string>;
  orgName: string;
}

export interface CheckResult {
  pass: boolean;
  violations: string[];
}

/** Characteristic ISO-boilerplate fragments that survive a "shall"-strip. */
const BANNED_FRAGMENTS = [
  'this international standard',
  'this document specifies requirements',
  'annex sl',
  'normative reference',
  'documented information required by',
];

const PLACEHOLDER_PATTERN = /\{\{|\bTBD\b|\bTO\s?DO\b|\[company\]|\[organization\]|\[insert\b|lorem ipsum|<[A-Z_]{2,}>/i;
const BULLET_PATTERN = /^\s*[-*•·]\s|\n\s*[-*•·]\s/;
const SECOND_PERSON = /\byou\b|\byour\b/i;
// Golden-eval round-1 finding (Task 12): models sometimes echo fact citations
// into the prose ("... as per guidelines (F1, F3)."). Citations belong in the
// factRefs array only — inline markers would print in the controlled PDF.
const INLINE_FACT_MARKER = /\(\s*F\d+(?:\s*,\s*F\d+)*\s*\)|\bF\d+\b(?=[,.)\s]*$)/;

export function checkSection(input: CheckInput): CheckResult {
  const violations: string[] = [];
  const { sentences, factKeys, orgName } = input;

  if (sentences.length === 0) {
    return { pass: false, violations: ['section has zero sentences'] };
  }

  sentences.forEach((s, i) => {
    // 1. Assertion coverage
    if (!s.factRefs || s.factRefs.length === 0) {
      violations.push(`sentence ${i + 1}: no factRefs — every sentence must cite at least one fact`);
    } else {
      for (const ref of s.factRefs) {
        if (!factKeys.has(ref)) {
          violations.push(`sentence ${i + 1}: factRef '${ref}' does not resolve to a provided fact`);
        }
      }
    }

    // 2. House style
    if (/\bshall\b/i.test(s.text)) {
      violations.push(`sentence ${i + 1}: contains "shall" — house style forbids standard-voice`);
    }
    if (BULLET_PATTERN.test(s.text)) {
      violations.push(`sentence ${i + 1}: bullet marker — sections are prose, not lists`);
    }
    if (PLACEHOLDER_PATTERN.test(s.text)) {
      violations.push(`sentence ${i + 1}: placeholder pattern — content must be concrete`);
    }
    if (SECOND_PERSON.test(s.text)) {
      violations.push(`sentence ${i + 1}: second person — the organization is the subject, not "you"`);
    }
    if (INLINE_FACT_MARKER.test(s.text)) {
      violations.push(`sentence ${i + 1}: inline fact-reference marker — citations belong in factRefs, never in the prose`);
    }

    // 3. Standard-text screen
    const lower = s.text.toLowerCase();
    for (const frag of BANNED_FRAGMENTS) {
      if (lower.includes(frag)) {
        violations.push(`sentence ${i + 1}: banned standard-text fragment "${frag}"`);
      }
    }
  });

  // Organization-as-subject: the org must be named at least once per section
  const namesOrg = sentences.some(
    s => s.text.includes(orgName) || /\bthe organization\b/i.test(s.text),
  );
  if (!namesOrg) {
    violations.push('no sentence names the organization — organization-as-subject (BC-2)');
  }

  return { pass: violations.length === 0, violations };
}
