/**
 * Unit tests for the deterministic ISO requirements map chunker.
 * Spec: iso-kb-seeding Task 3.
 * D-5: golden count pinned as EXPECTED_CHUNK_COUNT.
 * R-4: HLS prefix outside [ISO …] citation pattern.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { chunkIsoRequirementsMap } from '../src/chunker.js';
import { computeContentHash } from '../src/content-hash.js';
import { EXPECTED_CHUNK_COUNT, ISO_CANON_TENANT_ID } from '../../agents/shared/constants.js';
import source from '../../../docs/architecture/iso-requirements-map.md';

const chunks = chunkIsoRequirementsMap(source);

describe('chunker — deterministic output (iso-kb-seeding Task 3)', () => {
  it('produces exactly EXPECTED_CHUNK_COUNT chunks (D-5 golden count)', () => {
    expect(chunks.length).toBe(EXPECTED_CHUNK_COUNT);
  });

  it('every ISO chunk text starts with [ISO <NNNN> <clause>]', () => {
    const isoChunks = chunks.filter((c) => c.metadata.standard !== 'HLS');
    for (const chunk of isoChunks) {
      expect(chunk.text).toMatch(/^\[ISO (9001|14001|45001) \d+(\.\d+)+\]/);
    }
  });

  it('HLS chunk starts with [Annex SL HLS] — NOT [ISO HLS (R-4)', () => {
    const hlsChunks = chunks.filter((c) => c.metadata.standard === 'HLS');
    expect(hlsChunks).toHaveLength(1);
    expect(hlsChunks[0].text).toMatch(/^\[Annex SL HLS\]/);
    expect(hlsChunks[0].text).not.toMatch(/^\[ISO HLS/);
  });

  it('every chunk has correct metadata shape', () => {
    const validStandards = new Set(['ISO9001', 'ISO14001', 'ISO45001', 'HLS']);
    for (const chunk of chunks) {
      expect(chunk.metadata.tenantId).toBe(ISO_CANON_TENANT_ID);
      expect(validStandards.has(chunk.metadata.standard)).toBe(true);
      expect(chunk.metadata.clauseRef).toBeTruthy();
      expect(chunk.metadata.lang).toBe('en');
    }
  });

  it('ISO chunks have clauseRef matching [ISO <stdNum> <clause>] pattern', () => {
    const isoChunks = chunks.filter((c) => c.metadata.standard !== 'HLS');
    for (const chunk of isoChunks) {
      expect(chunk.metadata.clauseRef).toMatch(/^ISO (9001|14001|45001) \d+(\.\d+)+$/);
    }
  });

  it('HLS chunk clauseRef is "Annex SL HLS"', () => {
    const hlsChunks = chunks.filter((c) => c.metadata.standard === 'HLS');
    expect(hlsChunks[0].metadata.clauseRef).toBe('Annex SL HLS');
  });

  it('determinism: two calls yield identical output', () => {
    const chunks1 = chunkIsoRequirementsMap(source);
    const chunks2 = chunkIsoRequirementsMap(source);
    expect(chunks1).toEqual(chunks2);
  });

  it('content hash is deterministic', () => {
    const hash1 = computeContentHash(chunkIsoRequirementsMap(source));
    const hash2 = computeContentHash(chunkIsoRequirementsMap(source));
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('content hash changes when source changes', () => {
    const hash1 = computeContentHash(chunks);
    const modified = source + '\n\n**99.9 Fake clause**\n- (b) Fake.\n- (c) Fake.\n';
    const hash2 = computeContentHash(chunkIsoRequirementsMap(modified));
    expect(hash1).not.toBe(hash2);
  });

  it('has chunks from all three standards plus HLS', () => {
    const standards = new Set(chunks.map((c) => c.metadata.standard));
    expect(standards).toContain('ISO9001');
    expect(standards).toContain('ISO14001');
    expect(standards).toContain('ISO45001');
    expect(standards).toContain('HLS');
  });

  it('no chunk text is empty', () => {
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(10);
    }
  });
});

describe('chunker — property-based tests (fast-check)', () => {
  it('all chunks satisfy metadata invariants', () => {
    fc.assert(
      fc.property(fc.constant(source), (s) => {
        const result = chunkIsoRequirementsMap(s);
        expect(result.length).toBe(EXPECTED_CHUNK_COUNT);
        for (const chunk of result) {
          expect(chunk.metadata.tenantId).toBe('__ISO_CANON__');
          expect(['ISO9001', 'ISO14001', 'ISO45001', 'HLS']).toContain(chunk.metadata.standard);
          expect(chunk.metadata.clauseRef.length).toBeGreaterThan(0);
          expect(chunk.metadata.lang).toBe('en');
          // R-4: no chunk starts with [ISO HLS
          expect(chunk.text).not.toMatch(/^\[ISO HLS/);
        }
      }),
    );
  });
});
