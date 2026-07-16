/**
 * IMS becomes a first-class standard (spec-40 BC-6, design §2.6).
 *
 * The bug class this guards: m1.documents' CHECK accepted 'IMS' since
 * migration 002, but the GraphQL Standard enum did not — an IMS manual row
 * would FAIL ENUM SERIALIZATION on read (same class as the CAPA-status
 * defect fixed 2026-07-14). These assertions pin all three layers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublishAuditEventOptions } from '../src/resolvers/shared.js';

const SCHEMA = readFileSync(
  resolve(__dirname, '../schema/schema.graphql'),
  'utf8',
);
const MIGRATION_011 = readFileSync(
  resolve(__dirname, '../migrations/011_qms_engine.sql'),
  'utf8',
);
const MIGRATION_002 = readFileSync(
  resolve(__dirname, '../migrations/002_m1_document_studio.sql'),
  'utf8',
);

describe('IMS as first-class standard (BC-6)', () => {
  it('GraphQL Standard enum includes IMS', () => {
    const enumBlock = SCHEMA.match(/enum Standard \{([\s\S]*?)\}/)?.[1] ?? '';
    const values = enumBlock.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(values).toEqual(['ISO9001', 'ISO14001', 'ISO45001', 'IMS']);
  });

  it('m1.documents CHECK already accepts IMS (migration 002 — the DB side that made the enum gap a live bug)', () => {
    const check = MIGRATION_002.match(
      /CREATE TABLE m1\.documents[\s\S]*?standard TEXT NOT NULL CHECK \(standard IN \(([^)]*)\)\)/,
    )?.[1];
    expect(check).toContain("'IMS'");
  });

  it('migration 011 rewrites the m4.records standard CHECK to include IMS', () => {
    expect(MIGRATION_011).toContain('ALTER TABLE m4.records DROP CONSTRAINT IF EXISTS records_standard_check');
    const newCheck = MIGRATION_011.match(
      /ADD CONSTRAINT records_standard_check\s+CHECK \(standard IN \(([^)]*)\)\)/,
    )?.[1];
    expect(newCheck).toContain("'IMS'");
  });

  it('PublishAuditEventOptions accepts IMS (type-level pin)', () => {
    // This test exists to fail COMPILATION if the union is ever narrowed again.
    const opts: PublishAuditEventOptions = {
      tenantId: 't', actor: 'a', module: 'M1', clauseRef: '4.3',
      standard: 'IMS',
      detailType: 'x', source: 'y', entityId: 'e', payload: {},
    };
    expect(opts.standard).toBe('IMS');
  });

  it('no reverse-map strips standard values on read (enum-mappings passthrough)', () => {
    // enum-mappings.ts states `standard` is stored verbatim. Assert no
    // STANDARD_MAP exists that could silently drop IMS the way CAPA_STATUS_MAP
    // dropped statuses before invertMap was wired.
    const enumMappings = readFileSync(
      resolve(__dirname, '../src/resolvers/enum-mappings.ts'),
      'utf8',
    );
    expect(enumMappings).not.toMatch(/STANDARD_MAP/);
    expect(enumMappings).toContain('`standard` is stored verbatim');
  });
});
