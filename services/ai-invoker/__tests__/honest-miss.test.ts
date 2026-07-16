/**
 * Unit tests for honest-miss.ts — spec-35 Task 11.
 * Verifies: locale selection, fallback to EN, no clauseRefs in templates.
 */

import { describe, it, expect } from 'vitest';
import { getHonestMissTemplate } from '../src/honest-miss.js';

describe('getHonestMissTemplate', () => {
  it('returns English template for locale "en"', () => {
    const template = getHonestMissTemplate('en');
    expect(template).toContain('unable to provide a sufficiently grounded answer');
    expect(template).toContain('IMS Lead');
  });

  it('returns Spanish template for locale "es"', () => {
    const template = getHonestMissTemplate('es');
    expect(template).toContain('No fue posible proporcionar');
    expect(template).toContain('Representante del SIG');
  });

  it('returns Portuguese template for locale "pt"', () => {
    const template = getHonestMissTemplate('pt');
    expect(template).toContain('Nao foi possivel fornecer');
    expect(template).toContain('Representante do SGI');
  });

  it('falls back to English for undefined locale', () => {
    const template = getHonestMissTemplate(undefined);
    expect(template).toContain('unable to provide');
  });

  it('falls back to English for unsupported locale', () => {
    const template = getHonestMissTemplate('fr');
    expect(template).toContain('unable to provide');
  });

  it('templates make NO factual claims (no clauseRef patterns)', () => {
    const clauseRefPattern = /ISO\s+\d{4,5}\s+\d+\.\d+/;
    for (const locale of ['en', 'es', 'pt'] as const) {
      const template = getHonestMissTemplate(locale);
      expect(template).not.toMatch(clauseRefPattern);
    }
  });
});
