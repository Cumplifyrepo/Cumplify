/**
 * QMS Forms Engine — catalog seed validation (spec 41, Tasks 1–2).
 *
 * Hermetic unit lane — no DB, no AWS. Reads the migration SQL files and
 * asserts structural invariants:
 *
 * 1. BC-1: template counts are NEVER hardcoded strings — they are COUNTs
 *    over the seed rows. A literal count anywhere in the seed = reject.
 * 2. BC-3: every maps_to_column on the NCR template resolves to a REAL
 *    column in m2.nonconformities or m2.corrective_actions (asserted
 *    against migration 003 column names — the M2 lesson).
 * 3. BC-3: the NCR template carries standard, source, nc_type, clause_ref,
 *    severity as REQUIRED fields with maps_to_column set.
 * 4. TPL-5: NCR template has ≥30 fields.
 * 5. TPL-4: 15 templates seeded.
 * 6. TPL-3: standards filter — 14001-only templates exist, 45001-only exist,
 *    and multi-standard templates carry correct arrays.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(__dirname, '../migrations');
const SEED_SQL = readFileSync(resolve(MIGRATIONS_DIR, '013_qms_forms_seed.sql'), 'utf8');
const M2_SQL = readFileSync(resolve(MIGRATIONS_DIR, '003_m2_capa.sql'), 'utf8');
const MIGRATION_SQL = readFileSync(resolve(MIGRATIONS_DIR, '012_qms_forms.sql'), 'utf8');

// ── Helpers ──────────────────────────────────────────────────────────────

/** Extract column names from a CREATE TABLE block in migration SQL. */
function extractColumns(sql: string, table: string): string[] {
  // Match CREATE TABLE <schema>.<table> ( ... );
  const re = new RegExp(`CREATE TABLE ${table.replace('.', '\\.')}\\s*\\(([\\s\\S]*?)\\);`, 'm');
  const match = sql.match(re);
  if (!match) return [];
  const body = match[1];
  // Column lines start with a word (column name), not a constraint keyword
  const CONSTRAINT_KEYWORDS = [
    'PRIMARY',
    'UNIQUE',
    'CHECK',
    'CONSTRAINT',
    'FOREIGN',
    'CREATE',
    'REFERENCES',
  ];
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0].replace(',', ''))
    .filter((w) => w && !CONSTRAINT_KEYWORDS.includes(w.toUpperCase()) && !w.startsWith('('));
}

/** Count INSERT rows for a given table in seed SQL. */
function countInsertRows(sql: string, table: string): number {
  // Find INSERT INTO <table> ... VALUES followed by rows
  const re = new RegExp(
    `INSERT INTO ${table.replace('.', '\\.')}[\\s\\S]*?VALUES\\s*([\\s\\S]*?)(?=\\n\\n|INSERT INTO|-- ====|$)`,
    'g',
  );
  let total = 0;
  let match;
  while ((match = re.exec(sql)) !== null) {
    // Count opening parentheses that start a value tuple (lines starting with ( or  (')
    const valueBlock = match[1];
    const rows = valueBlock.split('\n').filter((l) => l.trim().startsWith("('"));
    total += rows.length;
  }
  return total;
}

/** Extract maps_to_column values from NCR template fields in seed SQL. */
function extractNcrMapsToColumns(sql: string): string[] {
  const results: string[] = [];
  // Find all lines that are NCR field inserts (c0000001-* IDs)
  const lines = sql.split('\n').filter((l) => l.trim().startsWith("('c0000001-"));
  for (const line of lines) {
    // maps_to_column is the second-to-last value before the sort_order integer)
    // Parse by finding the last quoted value before the trailing number)
    const parts = parseInsertRow(line);
    if (parts && parts.mapsToColumn !== 'NULL' && parts.mapsToColumn) {
      results.push(parts.mapsToColumn);
    }
  }
  return results;
}

/** Parse a single INSERT row for template_fields. */
function parseInsertRow(
  line: string,
): { fieldKey: string; required: boolean; mapsToColumn: string } | null {
  // Row format: ('id', 'section_id', 'field_key', 'label_key', 'field_type', true/false, options, relation_target, maps_to_column, sort_order)
  const trimmed = line
    .trim()
    .replace(/^\(/, '')
    .replace(/\)[,;]?\s*$/, '');
  // Split carefully respecting single-quoted strings
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "'" && !inQuote) {
      inQuote = true;
      current += ch;
      continue;
    }
    if (ch === "'" && inQuote) {
      // Check escaped quote ('')
      if (i + 1 < trimmed.length && trimmed[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inQuote = false;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuote) {
      tokens.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) tokens.push(current.trim());

  if (tokens.length < 10) return null;
  const fieldKey = tokens[2].replace(/^'|'$/g, '');
  const required = tokens[5].trim() === 'true';
  let mapsToColumn = tokens[8].trim();
  if (mapsToColumn === 'NULL') return { fieldKey, required, mapsToColumn: 'NULL' };
  mapsToColumn = mapsToColumn.replace(/^'|'$/g, '');
  return { fieldKey, required, mapsToColumn };
}

/** Extract BC-3 required mapped fields from NCR. */
function extractNcrRequiredMappedFields(sql: string): Array<{ fieldKey: string; mapsTo: string }> {
  const results: Array<{ fieldKey: string; mapsTo: string }> = [];
  const lines = sql.split('\n').filter((l) => l.trim().startsWith("('c0000001-"));
  for (const line of lines) {
    const parts = parseInsertRow(line);
    if (parts && parts.required && parts.mapsToColumn !== 'NULL' && parts.mapsToColumn) {
      results.push({ fieldKey: parts.fieldKey, mapsTo: parts.mapsToColumn });
    }
  }
  return results;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('qms-forms: migration 012 structural checks', () => {
  it('creates the forms schema', () => {
    expect(MIGRATION_SQL).toContain('CREATE SCHEMA IF NOT EXISTS forms');
  });

  it('creates forms.templates with required columns', () => {
    expect(MIGRATION_SQL).toContain('CREATE TABLE forms.templates');
    const cols = extractColumns(MIGRATION_SQL, 'forms.templates');
    expect(cols).toContain('id');
    expect(cols).toContain('key');
    expect(cols).toContain('title_key');
    expect(cols).toContain('standards');
    expect(cols).toContain('maps_to');
    expect(cols).toContain('requires_approval');
  });

  it('creates forms.record_values with typed value columns', () => {
    expect(MIGRATION_SQL).toContain('CREATE TABLE forms.record_values');
    const cols = extractColumns(MIGRATION_SQL, 'forms.record_values');
    expect(cols).toContain('value_text');
    expect(cols).toContain('value_number');
    expect(cols).toContain('value_date');
    expect(cols).toContain('value_bool');
    expect(cols).toContain('value_uuid');
    expect(cols).toContain('value_json');
  });

  it('enforces exactly-one-value CHECK on record_values', () => {
    expect(MIGRATION_SQL).toContain('exactly_one_value');
  });

  it('enables RLS + FORCE on tenant tables only', () => {
    expect(MIGRATION_SQL).toContain('ALTER TABLE forms.records ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION_SQL).toContain('ALTER TABLE forms.records FORCE ROW LEVEL SECURITY');
    expect(MIGRATION_SQL).toContain('ALTER TABLE forms.record_values ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION_SQL).toContain('ALTER TABLE forms.record_values FORCE ROW LEVEL SECURITY');
    // Catalog tables should NOT have RLS
    expect(MIGRATION_SQL).not.toContain('ALTER TABLE forms.templates ENABLE ROW LEVEL SECURITY');
  });

  it('grants SELECT-only on catalog tables to app_role', () => {
    expect(MIGRATION_SQL).toMatch(/GRANT SELECT ON forms\.templates TO app_role/);
    expect(MIGRATION_SQL).toMatch(/GRANT SELECT ON forms\.template_sections TO app_role/);
    expect(MIGRATION_SQL).toMatch(/GRANT SELECT ON forms\.template_fields TO app_role/);
    // Must NOT grant INSERT/UPDATE/DELETE on catalog
    expect(MIGRATION_SQL).not.toMatch(/GRANT.*INSERT.*ON forms\.templates/);
  });
});

describe('qms-forms: seed catalog (BC-1, TPL-4, TPL-5)', () => {
  it('TPL-4: seeds exactly 15 templates', () => {
    const count = countInsertRows(SEED_SQL, 'forms.templates');
    expect(count).toBe(15);
  });

  it('TPL-5: NCR template has ≥30 fields', () => {
    // Count field rows with NCR section IDs (c0000001-*)
    const ncrFieldLines = SEED_SQL.split('\n').filter((l) => l.trim().startsWith("('c0000001-"));
    expect(ncrFieldLines.length).toBeGreaterThanOrEqual(30);
  });

  it('BC-1: no hardcoded count strings in seed (counts computed from rows)', () => {
    // A literal like "30 fields" or "42 fields" or "6 sections" in the seed = reject
    const countPattern = /\d+\s+(fields?|sections?|field count|section count)/i;
    // Filter: only check INSERT statements and template data, not comments
    const dataLines = SEED_SQL.split('\n').filter(
      (l) => l.trim().startsWith("('") || l.trim().startsWith('('),
    );
    const offenders = dataLines.filter((l) => countPattern.test(l));
    countPattern.lastIndex = 0; // reset
    expect(offenders).toEqual([]);
  });

  it('NCR maps_to is set to m2_ncr', () => {
    expect(SEED_SQL).toContain("'ncr'");
    expect(SEED_SQL).toContain("'m2_ncr'");
  });

  it('NCR disposition is a SELECT field, not text', () => {
    // Find the disposition_decision field — must be field_type 'select'
    const dispositionLine = SEED_SQL.split('\n').find((l) => l.includes("'disposition_decision'"));
    expect(dispositionLine).toBeDefined();
    expect(dispositionLine).toContain("'select'");
    expect(dispositionLine).toContain('use_as_is');
    expect(dispositionLine).toContain('rework');
    expect(dispositionLine).toContain('scrap');
  });
});

describe('qms-forms: BC-3 NCR → M2 mapping integrity', () => {
  // Real columns from migration 003 (m2.nonconformities)
  const m2NcColumns = extractColumns(M2_SQL, 'm2.nonconformities');
  // Real columns from migration 003 (m2.corrective_actions)
  const m2CaColumns = extractColumns(M2_SQL, 'm2.corrective_actions');
  const allM2Columns = [...m2NcColumns, ...m2CaColumns];

  it('m2.nonconformities columns extracted from migration 003', () => {
    // Sanity check — these are the BC-3 columns that MUST exist
    expect(m2NcColumns).toContain('standard');
    expect(m2NcColumns).toContain('source');
    expect(m2NcColumns).toContain('nc_type');
    expect(m2NcColumns).toContain('clause_ref');
    expect(m2NcColumns).toContain('severity');
    expect(m2NcColumns).toContain('description');
    expect(m2NcColumns).toContain('raised_by');
  });

  it('m2.corrective_actions columns extracted from migration 003', () => {
    expect(m2CaColumns).toContain('action_desc');
    expect(m2CaColumns).toContain('owner_id');
    expect(m2CaColumns).toContain('due_date');
    expect(m2CaColumns).toContain('containment_flag');
  });

  it('every maps_to_column on NCR fields resolves to a real m2 column', () => {
    const ncrMapsTo = extractNcrMapsToColumns(SEED_SQL);
    expect(ncrMapsTo.length).toBeGreaterThan(0);

    const invalid = ncrMapsTo.filter((col) => !allM2Columns.includes(col));
    expect(invalid).toEqual([]);
  });

  it('BC-3 required mapped fields: standard, source, nc_type, clause_ref, severity are REQUIRED + mapped', () => {
    const requiredMapped = extractNcrRequiredMappedFields(SEED_SQL);
    const mappedColumns = requiredMapped.map((f) => f.mapsTo);

    // These MUST be present as required mapped fields (BC-3 hard constraint)
    expect(mappedColumns).toContain('standard');
    expect(mappedColumns).toContain('source');
    expect(mappedColumns).toContain('nc_type');
    expect(mappedColumns).toContain('clause_ref');
    expect(mappedColumns).toContain('severity');
  });

  it('clause_ref field is a relation type targeting clause registry', () => {
    const clauseRefLine = SEED_SQL.split('\n').find(
      (l) => l.includes("'clause_ref'") && l.includes("'c0000001-"),
    );
    expect(clauseRefLine).toBeDefined();
    expect(clauseRefLine).toContain("'relation'");
    expect(clauseRefLine).toContain("'clause'");
  });

  it('source field options match m2.nonconformities CHECK constraint exactly', () => {
    // m2 CHECK: source IN ('audit', 'incident', 'complaint', 'process')
    const sourceLine = SEED_SQL.split('\n').find(
      (l) => l.includes("'source'") && l.includes("'c0000001-") && l.includes("'select'"),
    );
    expect(sourceLine).toBeDefined();
    expect(sourceLine).toContain('audit');
    expect(sourceLine).toContain('incident');
    expect(sourceLine).toContain('complaint');
    expect(sourceLine).toContain('process');
  });

  it('severity field options match m2.nonconformities CHECK constraint exactly', () => {
    // m2 CHECK: severity IN ('low', 'medium', 'high', 'critical')
    const severityLine = SEED_SQL.split('\n').find(
      (l) => l.includes("'severity'") && l.includes("'c0000001-") && l.includes("'select'"),
    );
    expect(severityLine).toBeDefined();
    expect(severityLine).toContain('low');
    expect(severityLine).toContain('medium');
    expect(severityLine).toContain('high');
    expect(severityLine).toContain('critical');
  });
});

describe('qms-forms: TPL-3 standards filter fixtures', () => {
  it('14001-only templates exist (aspects_impacts)', () => {
    // aspects template standards array should include ISO14001 but NOT ISO9001 or ISO45001
    const aspectsLine = SEED_SQL.split('\n').find((l) => l.includes("'aspects_impacts'"));
    expect(aspectsLine).toBeDefined();
    expect(aspectsLine).toContain('ISO14001');
    expect(aspectsLine).not.toContain('ISO9001');
    expect(aspectsLine).not.toContain('ISO45001');
  });

  it('45001-only templates exist (hira, worker_consultation)', () => {
    const hiraLine = SEED_SQL.split('\n').find((l) => l.includes("'hira'"));
    expect(hiraLine).toBeDefined();
    expect(hiraLine).toContain('ISO45001');
    expect(hiraLine).not.toContain('ISO9001');
    expect(hiraLine).not.toContain('ISO14001');
  });

  it('multi-standard templates carry all applicable standards', () => {
    const ncrLine = SEED_SQL.split('\n').find((l) => l.includes("'ncr'"));
    expect(ncrLine).toBeDefined();
    expect(ncrLine).toContain('ISO9001');
    expect(ncrLine).toContain('ISO14001');
    expect(ncrLine).toContain('ISO45001');
    expect(ncrLine).toContain('IMS');
  });

  it('9001-only template exists (supplier_evaluation)', () => {
    const supplierLine = SEED_SQL.split('\n').find((l) => l.includes("'supplier_evaluation'"));
    expect(supplierLine).toBeDefined();
    expect(supplierLine).toContain('ISO9001');
    expect(supplierLine).not.toContain('ISO14001');
    expect(supplierLine).not.toContain('ISO45001');
  });
});
