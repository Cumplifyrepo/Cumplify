/**
 * QMS marshalling pinning tests (architect remediation 2026-07-15).
 *
 * Class: hermetic SQL-string tests cannot catch Data-API VALUE mapping —
 * third recurrence (M2 CAPA status 2026-07-14, cast binding twice before).
 * These tests pin the two halves that would have failed at deploy:
 *
 *  1. Every DB CHECK value on qms enum columns reverse-maps to a member of
 *     the corresponding schema.graphql enum — parsed from BOTH files, so a
 *     drift in either the migration or the SDL breaks the suite.
 *  2. Data-API array wrappers ({stringValues: [...]}) unwrap to plain
 *     arrays; qms columns `standards TEXT[]` and `clause_registry_ids
 *     UUID[]` are the first array reads in the codebase's shared marshaller.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { marshalRow } from '../../src/resolvers/shared.js';

const sdl = readFileSync(resolve(__dirname, '../../schema/schema.graphql'), 'utf8');
const migration = readFileSync(
  resolve(__dirname, '../../migrations/011_qms_engine.sql'),
  'utf8',
);

/** Extract the value set of a GraphQL enum block from the SDL. */
function sdlEnumValues(name: string): Set<string> {
  const m = sdl.match(new RegExp(`enum ${name}\\s*\\{([^}]*)\\}`));
  expect(m, `enum ${name} must exist in schema.graphql`).toBeTruthy();
  return new Set(m![1].trim().split(/\s+/));
}

/** Extract CHECK (status IN (...)) values for a table from migration 011. */
function checkValues(table: string): Set<string> {
  const tableDdl = migration.match(
    new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`),
  );
  expect(tableDdl, `${table} DDL must exist in 011`).toBeTruthy();
  const check = tableDdl![1].match(/status TEXT[^\n]*CHECK \(status IN \(([^)]*)\)\)/);
  expect(check, `${table}.status CHECK must exist`).toBeTruthy();
  return new Set(check![1].split(',').map(v => v.trim().replace(/'/g, '')));
}

function marshalSingle(column: string, dbValue: string): unknown {
  const row = marshalRow([{ stringValue: dbValue }], [{ name: column }]);
  return row[column];
}

describe('qms enum reverse-mapping — DB CHECK values ↔ SDL enums', () => {
  it('every generation_runs.status CHECK value maps into GenerationRunStatus', () => {
    const sdlValues = sdlEnumValues('GenerationRunStatus');
    const dbValues = checkValues('qms.generation_runs');
    const mapped = new Set([...dbValues].map(v => marshalSingle('status', v)));
    for (const v of mapped) {
      expect(sdlValues, `mapped value ${v} must be a GenerationRunStatus`).toContain(v);
    }
    // Both directions: every SDL value is reachable from some DB value
    expect(mapped).toEqual(sdlValues);
  });

  it('every generation_sections.status CHECK value maps into SectionKind — under BOTH the `kind` alias and the raw `status` column name', () => {
    const sdlValues = sdlEnumValues('SectionKind');
    const dbValues = checkValues('qms.generation_sections');
    for (const col of ['kind', 'status']) {
      const mapped = new Set([...dbValues].map(v => marshalSingle(col, v)));
      for (const v of mapped) {
        expect(sdlValues, `mapped ${col}=${v} must be a SectionKind`).toContain(v);
      }
      expect(mapped, `column '${col}' must reach every SectionKind value`).toEqual(sdlValues);
    }
  });

  it("the overloaded 'failed' value maps identically for run status and section kind (merge-safety)", () => {
    expect(marshalSingle('status', 'failed')).toBe('FAILED');
    expect(marshalSingle('kind', 'failed')).toBe('FAILED');
  });

  it('regression: doc + CAPA status values still map after the qms merge', () => {
    expect(marshalSingle('status', 'draft')).toBe('DRAFT');
    expect(marshalSingle('status', 'in_review')).toBe('IN_REVIEW');
    expect(marshalSingle('status', 'open')).toBe('OPEN');
    expect(marshalSingle('status', 'verified')).toBe('VERIFIED');
  });
});

describe('Data-API array unwrapping — plain arrays, never wrapper objects', () => {
  it('standards TEXT[] → plain string array with SDL-valid Standard values', () => {
    const row = marshalRow(
      [{ arrayValue: { stringValues: ['ISO9001', 'ISO45001'] } }],
      [{ name: 'standards' }],
    );
    expect(row.standards).toEqual(['ISO9001', 'ISO45001']);
    const standardValues = sdlEnumValues('Standard');
    for (const s of row.standards as string[]) {
      expect(standardValues).toContain(s);
    }
  });

  it('clause_registry_ids UUID[] → plain string array (AWSJSON clauseRefs)', () => {
    const row = marshalRow(
      [{ arrayValue: { stringValues: ['d0000001-0001-4000-8000-000000000001'] } }],
      [{ name: 'clause_registry_ids' }],
    );
    expect(row.clauseRegistryIds).toEqual(['d0000001-0001-4000-8000-000000000001']);
  });

  it('longValues and nested arrayValues unwrap recursively', () => {
    const row = marshalRow(
      [
        { arrayValue: { longValues: [1, 2, 3] } },
        { arrayValue: { arrayValues: [{ stringValues: ['a'] }, { stringValues: ['b', 'c'] }] } },
      ],
      [{ name: 'nums' }, { name: 'nested' }],
    );
    expect(row.nums).toEqual([1, 2, 3]);
    expect(row.nested).toEqual([['a'], ['b', 'c']]);
  });
});
