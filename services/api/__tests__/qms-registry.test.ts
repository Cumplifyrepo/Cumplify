/**
 * QMS clause registry — seed validation (spec 40, migration 014).
 *
 * Hermetic unit lane — no DB, no AWS. Reads the seed SQL and the ISO coverage
 * matrix and asserts structural invariants:
 *
 * 1. BC-7: registry integrity is asserted over PARSED (standard, clause_no)
 *    pairs against docs/architecture/iso-coverage-matrix.md — never a line
 *    count. Both directions: every matrix data row is seeded, every seeded
 *    row exists in the matrix. Totals: 80 = 28 (9001) + 24 (14001) + 28 (45001).
 * 2. CLR-3: no occurrence of the ISO modal verb ("shall", word-boundary,
 *    case-insensitive) in any intent_paraphrase value.
 * 3. Harmonization consistency: each harmonization_key carries exactly one
 *    annex_sl_mode; forced-distinct keys (14001 6.1.2 vs 45001 6.1.2,
 *    9001 8.2 vs 14001 8.2) never collide; shared keys '6.1.3' and
 *    '8.2-emergency' pair exactly 2 rows; '9.2' spans exactly 3 rows.
 * 4. doc_type: every 4.3 row is 'scope', every 5.2 row is 'policy';
 *    exactly 3 of each.
 * 5. required_sources: every row parses as a JSON array of ≥1 strings, each
 *    matching org_profile.* / register.* / applicability.*.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');
const SEED_SQL = readFileSync(
  resolve(__dirname, '../migrations/014_qms_registry_seed.sql'),
  'utf8',
);
const MATRIX_MD = readFileSync(
  resolve(REPO_ROOT, 'docs/architecture/iso-coverage-matrix.md'),
  'utf8',
);

// ── Helpers ──────────────────────────────────────────────────────────────

const STANDARD_LABELS: Record<string, string> = {
  'ISO 9001:2015': 'ISO9001',
  'ISO 14001:2015': 'ISO14001',
  'ISO 45001:2018': 'ISO45001',
};

interface MatrixClause {
  standard: string;
  clauseNo: string;
}

/**
 * Parse the coverage-matrix data rows into (standard, clause_no) pairs.
 * Data rows start `| ISO 9001:2015 |` (or 14001/45001) and carry a clause
 * number FOLLOWED BY title text in column 2. The Grand Total rows also start
 * `| ISO ...` but column 2 is a bare number (the clause tally) with no title
 * text — that is the exclusion signal.
 */
function parseMatrixClauses(md: string): MatrixClause[] {
  const rows: MatrixClause[] = [];
  for (const line of md.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('| ISO ')) continue;
    const cells = trimmed.split('|').map((c) => c.trim());
    // cells[0] is '' (leading pipe); cells[1] = standard label; cells[2] = clause cell
    const standard = STANDARD_LABELS[cells[1]];
    if (!standard) continue;
    // Clause number followed by whitespace + title text; a bare number (Grand
    // Total tally) does not match.
    const m = cells[2]?.match(/^(\d+(?:\.\d+)*)\s+\S/);
    if (!m) continue;
    rows.push({ standard, clauseNo: m[1] });
  }
  return rows;
}

interface SeedRow {
  id: string;
  standard: string;
  clauseNo: string;
  clauseTitle: string;
  intentParaphrase: string;
  annexSlMode: string;
  harmonizationKey: string;
  docType: string;
  requiredSourcesRaw: string;
  sortOrder: number;
}

/** Split one VALUES tuple on commas, respecting single-quoted SQL strings. */
function tokenizeRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\(/, '').replace(/\)[,;]?\s*$/, '');
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "'" && !inQuote) { inQuote = true; current += ch; continue; }
    if (ch === "'" && inQuote) {
      // Escaped quote ('')
      if (i + 1 < trimmed.length && trimmed[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inQuote = false; current += ch; continue;
    }
    if (ch === ',' && !inQuote) {
      tokens.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/** Strip surrounding single quotes and unescape '' → '. */
function unquote(token: string): string {
  return token.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'");
}

/**
 * Parse the seed rows the same way as the matrix: over PARSED values, never a
 * line count of the file. Registry rows are the tuples whose id carries the
 * deterministic d0000001-* prefix.
 */
function parseSeedRows(sql: string): SeedRow[] {
  const lines = sql.split('\n').filter((l) => l.trim().startsWith("('d0000001-"));
  return lines.map((line) => {
    const t = tokenizeRow(line);
    // (id, standard, clause_no, clause_title, intent_paraphrase,
    //  annex_sl_mode, harmonization_key, doc_type, required_sources, sort_order)
    expect(t.length).toBe(10);
    return {
      id: unquote(t[0]),
      standard: unquote(t[1]),
      clauseNo: unquote(t[2]),
      clauseTitle: unquote(t[3]),
      intentParaphrase: unquote(t[4]),
      annexSlMode: unquote(t[5]),
      harmonizationKey: unquote(t[6]),
      docType: unquote(t[7]),
      requiredSourcesRaw: unquote(t[8]),
      sortOrder: Number(t[9]),
    };
  });
}

const matrixClauses = parseMatrixClauses(MATRIX_MD);
const seedRows = parseSeedRows(SEED_SQL);

const pairKey = (standard: string, clauseNo: string) => `${standard}:${clauseNo}`;

function findRow(standard: string, clauseNo: string): SeedRow {
  const row = seedRows.find((r) => r.standard === standard && r.clauseNo === clauseNo);
  expect(row, `seed row ${standard} ${clauseNo}`).toBeDefined();
  return row as SeedRow;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('qms-registry: BC-7 parse integrity (matrix ↔ seed)', () => {
  it('matrix parses to 80 data rows: 28 + 24 + 28 (Grand Total rows excluded)', () => {
    const byStandard = (s: string) => matrixClauses.filter((c) => c.standard === s).length;
    expect(byStandard('ISO9001')).toBe(28);
    expect(byStandard('ISO14001')).toBe(24);
    expect(byStandard('ISO45001')).toBe(28);
    expect(matrixClauses.length).toBe(80);
  });

  it('seed parses to 80 rows: 28 + 24 + 28', () => {
    const byStandard = (s: string) => seedRows.filter((r) => r.standard === s).length;
    expect(byStandard('ISO9001')).toBe(28);
    expect(byStandard('ISO14001')).toBe(24);
    expect(byStandard('ISO45001')).toBe(28);
    expect(seedRows.length).toBe(80);
  });

  it('(standard, clause_no) sets are EQUAL in both directions', () => {
    const matrixSet = new Set(matrixClauses.map((c) => pairKey(c.standard, c.clauseNo)));
    const seedSet = new Set(seedRows.map((r) => pairKey(r.standard, r.clauseNo)));

    const missingFromSeed = [...matrixSet].filter((k) => !seedSet.has(k));
    const notInMatrix = [...seedSet].filter((k) => !matrixSet.has(k));

    expect(missingFromSeed).toEqual([]);
    expect(notInMatrix).toEqual([]);
    // No duplicate (standard, clause_no) pairs on either side
    expect(matrixSet.size).toBe(matrixClauses.length);
    expect(seedSet.size).toBe(seedRows.length);
  });
});

describe('qms-registry: CLR-3 paraphrase discipline', () => {
  it('zero occurrences of the ISO modal verb in any intent_paraphrase', () => {
    const offenders = seedRows
      .filter((r) => /\bshall\b/i.test(r.intentParaphrase))
      .map((r) => pairKey(r.standard, r.clauseNo));
    expect(offenders).toEqual([]);
  });
});

describe('qms-registry: harmonization consistency', () => {
  it('every harmonization_key maps to exactly one annex_sl_mode', () => {
    const modesByKey = new Map<string, Set<string>>();
    for (const r of seedRows) {
      if (!modesByKey.has(r.harmonizationKey)) modesByKey.set(r.harmonizationKey, new Set());
      modesByKey.get(r.harmonizationKey)!.add(r.annexSlMode);
    }
    const inconsistent = [...modesByKey.entries()]
      .filter(([, modes]) => modes.size !== 1)
      .map(([key, modes]) => `${key} → ${[...modes].join(', ')}`);
    expect(inconsistent).toEqual([]);
  });

  it('14001 6.1.2 (aspects) and 45001 6.1.2 (hazards) have distinct keys', () => {
    const aspects = findRow('ISO14001', '6.1.2');
    const hazards = findRow('ISO45001', '6.1.2');
    expect(aspects.harmonizationKey).not.toBe(hazards.harmonizationKey);
  });

  it('9001 8.2 (products/services) and 14001 8.2 (emergency) have distinct keys', () => {
    const products = findRow('ISO9001', '8.2');
    const emergency = findRow('ISO14001', '8.2');
    expect(products.harmonizationKey).not.toBe(emergency.harmonizationKey);
  });

  it("shared key '6.1.3' appears on exactly 2 rows", () => {
    const rows = seedRows.filter((r) => r.harmonizationKey === '6.1.3');
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.annexSlMode === 'shared')).toBe(true);
  });

  it("shared key '8.2-emergency' appears on exactly 2 rows", () => {
    const rows = seedRows.filter((r) => r.harmonizationKey === '8.2-emergency');
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.annexSlMode === 'shared')).toBe(true);
  });

  it("key '9.2' appears on exactly 3 rows", () => {
    const rows = seedRows.filter((r) => r.harmonizationKey === '9.2');
    expect(rows.length).toBe(3);
  });
});

describe('qms-registry: doc_type assignments', () => {
  it("every 4.3 row is 'scope'", () => {
    const rows = seedRows.filter((r) => r.clauseNo === '4.3');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.docType === 'scope')).toBe(true);
  });

  it("every 5.2 row is 'policy'", () => {
    const rows = seedRows.filter((r) => r.clauseNo === '5.2');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.docType === 'policy')).toBe(true);
  });

  it('exactly 3 policy rows and 3 scope rows', () => {
    expect(seedRows.filter((r) => r.docType === 'policy').length).toBe(3);
    expect(seedRows.filter((r) => r.docType === 'scope').length).toBe(3);
  });
});

describe('qms-registry: required_sources shape', () => {
  it('every row parses as a JSON array of ≥1 namespaced string tokens', () => {
    const TOKEN_RE = /^(org_profile|register|applicability)\./;
    const offenders: string[] = [];
    for (const r of seedRows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(r.requiredSourcesRaw);
      } catch {
        offenders.push(`${pairKey(r.standard, r.clauseNo)}: invalid JSON`);
        continue;
      }
      if (!Array.isArray(parsed) || parsed.length < 1) {
        offenders.push(`${pairKey(r.standard, r.clauseNo)}: not a non-empty array`);
        continue;
      }
      for (const token of parsed) {
        if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
          offenders.push(`${pairKey(r.standard, r.clauseNo)}: bad token ${String(token)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
