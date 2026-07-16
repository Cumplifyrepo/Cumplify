/**
 * Seed ↔ catalog label contract (spec 41, Task 8 — BC-7).
 *
 * The record PDF resolves template/section/field labels from the shared
 * frontend/messages catalogs at render time, so a seeded i18n key missing
 * from ANY locale is now a customer-visible defect (raw key printed into a
 * sealed evidence PDF). This test makes that drift impossible: every
 * forms.* key referenced by migration 013 must resolve to a non-empty
 * string in en, es and pt — plus the forms.pdf.* keys the value formatter
 * itself uses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SEED_SQL = readFileSync(resolve(__dirname, '../migrations/013_qms_forms_seed.sql'), 'utf8');

const CATALOGS: Record<string, unknown> = {
  en: JSON.parse(readFileSync(resolve(__dirname, '../../../frontend/messages/en.json'), 'utf8')),
  es: JSON.parse(readFileSync(resolve(__dirname, '../../../frontend/messages/es.json'), 'utf8')),
  pt: JSON.parse(readFileSync(resolve(__dirname, '../../../frontend/messages/pt.json'), 'utf8')),
};

function resolveKey(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (o, part) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[part] : undefined),
      catalog,
    );
}

// Every quoted forms.* key in the seed (title_key / description_key / label_key
// columns are the only places such strings appear).
const seededKeys = [
  ...new Set([...SEED_SQL.matchAll(/'(forms\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1])),
];

// Keys the PDF value formatter resolves directly (forms.ts).
const FORMATTER_KEYS = ['forms.pdf.yes', 'forms.pdf.no'];

describe('forms seed i18n keys resolve in every catalog (BC-7 / Task 8)', () => {
  it('seed references a non-trivial key set', () => {
    // 15 templates × (title+desc) + sections + fields — a collapse here means
    // the extraction regex broke, not that the seed shrank.
    expect(seededKeys.length).toBeGreaterThan(100);
  });

  for (const locale of Object.keys(CATALOGS)) {
    it(`every seeded key resolves to a non-empty string in ${locale}`, () => {
      const missing = [...seededKeys, ...FORMATTER_KEYS].filter((k) => {
        const v = resolveKey(CATALOGS[locale], k);
        return typeof v !== 'string' || v.length === 0;
      });
      expect(missing).toEqual([]);
    });
  }
});
