/**
 * Unit tests: enum mapping values match DB CHECK constraints exactly.
 * Cross-checks every mapped value against the migration's CHECK list.
 * This class of bug (UPPERCASE → lowercase mismatch) is invisible to mocked Data API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DOC_TYPE_MAP, DOC_STATUS_MAP, APPROVAL_DECISION_MAP,
  NC_SOURCE_MAP, NC_TYPE_MAP, SEVERITY_MAP,
  DISPOSITION_MAP, FINDING_TYPE_MAP, RISK_CATEGORY_MAP,
  mapEnum,
} from '../src/resolvers/enum-mappings.js';

const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

function readMigration(filename: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, filename), 'utf-8');
}

/** Extract allowed values from a CHECK constraint for a given column */
function extractCheckValues(sql: string, columnName: string): string[] {
  // Match: column_name TEXT ... CHECK (column_name IN ('val1', 'val2', ...))
  const pattern = new RegExp(`${columnName}[^)]*CHECK\\s*\\(${columnName}\\s+IN\\s*\\(([^)]+)\\)`, 'i');
  const match = sql.match(pattern);
  if (!match) return [];
  return match[1].match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) ?? [];
}

describe('Enum mappings match DB CHECK constraints', () => {
  const m002 = readMigration('002_m1_document_studio.sql');
  const m003 = readMigration('003_m2_capa.sql');
  const m004 = readMigration('004_m3_audit_studio.sql');
  const m006 = readMigration('006_m5_risk_management.sql');

  it('DOC_TYPE_MAP values ⊆ doc_type CHECK (016 supersedes 002)', () => {
    // Migration 016 DROPs and re-ADDs the doc_type CHECK (spec-40 Task 6:
    // correlation_matrix + master_list) — the LATEST definition governs.
    const m016 = readMigration('016_document_types.sql');
    const allowed = extractCheckValues(m016, 'doc_type');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(DOC_TYPE_MAP)) {
      expect(allowed).toContain(val);
    }
    // Every CHECK value has a mapping key
    for (const val of allowed) {
      expect(Object.values(DOC_TYPE_MAP)).toContain(val);
    }
  });

  it('DOC_STATUS_MAP values ⊆ status CHECK (002 documents)', () => {
    const allowed = extractCheckValues(m002, 'status');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(DOC_STATUS_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('APPROVAL_DECISION_MAP values ⊆ decision CHECK (002)', () => {
    const allowed = extractCheckValues(m002, 'decision');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(APPROVAL_DECISION_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('NC_SOURCE_MAP values ⊆ source CHECK (003)', () => {
    const allowed = extractCheckValues(m003, 'source');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(NC_SOURCE_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('NC_TYPE_MAP values ⊆ nc_type CHECK (003)', () => {
    const allowed = extractCheckValues(m003, 'nc_type');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(NC_TYPE_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('SEVERITY_MAP values ⊆ severity CHECK (003)', () => {
    const allowed = extractCheckValues(m003, 'severity');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(SEVERITY_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('DISPOSITION_MAP values ⊆ disposition CHECK (003)', () => {
    const allowed = extractCheckValues(m003, 'disposition');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(DISPOSITION_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('FINDING_TYPE_MAP values ⊆ finding_type CHECK (004)', () => {
    const allowed = extractCheckValues(m004, 'finding_type');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(FINDING_TYPE_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('RISK_CATEGORY_MAP values ⊆ category CHECK (006)', () => {
    const allowed = extractCheckValues(m006, 'category');
    expect(allowed.length).toBeGreaterThan(0);
    for (const val of Object.values(RISK_CATEGORY_MAP)) {
      expect(allowed).toContain(val);
    }
  });

  it('standard values are VERBATIM (ISO9001/14001/45001) — no mapping applied', () => {
    // Verify standard CHECK includes the uppercase values
    const allowed = extractCheckValues(m006, 'standard');
    expect(allowed).toContain('ISO9001');
    expect(allowed).toContain('ISO14001');
    expect(allowed).toContain('ISO45001');
  });

  it('mapEnum throws on invalid value', () => {
    expect(() => mapEnum(RISK_CATEGORY_MAP, 'INVALID', 'category')).toThrow('Invalid enum value');
  });

  it('mapEnum returns correct lowercase for valid UPPERCASE input', () => {
    expect(mapEnum(RISK_CATEGORY_MAP, 'QUALITY', 'category')).toBe('quality');
    expect(mapEnum(DOC_TYPE_MAP, 'WORK_INSTRUCTION', 'docType')).toBe('work_instruction');
    expect(mapEnum(FINDING_TYPE_MAP, 'MAJOR_NC', 'findingType')).toBe('major_nc');
  });
});
