/**
 * Controlled-document template hermetic tests (spec 40, Task 9 — STO-3).
 * Pure HTML assembly: no AWS, no chromium. Content fixtures use the REAL
 * derive.ts shapes (lowercase kinds, frontMatter.purpose, clauseRefs
 * objects, gap.missingSources) — the T7/T11 lesson, applied.
 */

import { describe, it, expect } from 'vitest';
import { buildDocumentHtml, esc, BRAND, type DocMeta } from '../src/template.js';

const meta: DocMeta = {
  title: 'Integrated Management System Manual',
  documentId: 'doc-0001',
  versionNo: 1,
  docType: 'manual',
  standard: 'IMS',
  generatedAt: '2026-07-15',
};

const manualContent = {
  frontMatter: {
    purpose: 'This manual was generated from the organization’s own recorded data.',
    scope: {
      organization: 'Acme Corp', standards: ['ISO9001', 'ISO14001'],
      sites: ['HQ, Austin, TX, US'], managementRepresentative: 'Jane Doe',
    },
    normativeRefs: [{ standard: 'ISO9001', source: 'https://www.iso.org/store.html' }],
    terms: [],
  },
  sections: [
    {
      harmonizationKey: '4.1-context',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '4.1' }],
      kind: 'prose' as const,
      sentences: [{ text: 'The organization has determined external and internal issues.', factRefs: ['F1'] }],
    },
    {
      harmonizationKey: '6.1-risks',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '6.1' }],
      kind: 'gap' as const,
      gap: { missingSources: ['register.risk_assessments'] },
    },
    {
      harmonizationKey: '8.3-design',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '8.3' }],
      kind: 'na_justified' as const,
      naJustification: 'Design not performed at this organization',
    },
    {
      harmonizationKey: '9.1-monitoring',
      clauseRefs: [{ standard: 'ISO9001', clauseNo: '9.1' }],
      kind: 'failed' as const,
    },
  ],
};

describe('buildDocumentHtml — sections (manual / clause doc)', () => {
  const html = buildDocumentHtml(meta, manualContent);

  it('carries the CONTROLLED stamp and branded header', () => {
    expect(html).toContain('Controlled Document');
    expect(html).toContain('controlled-stamp');
    expect(html).toContain(BRAND.accent);
  });

  it('QMS Required Document Information block lists id/type/standard/version', () => {
    expect(html).toContain('QMS Required Document Information');
    expect(html).toContain('doc-0001');
    expect(html).toContain('IMS');
    expect(html).toContain('v1');
    expect(html).toContain('Acme Corp');
  });

  it('BC-1 disclaimer rendered from frontMatter.purpose', () => {
    expect(html).toContain('organization’s own recorded data');
  });

  it('numbered clauses: sections carry 1. 2. 3. 4. markers in order', () => {
    const idx = (n: string) => html.indexOf(`<span class="section-no">${n}</span>`);
    expect(idx('1.')).toBeGreaterThan(-1);
    expect(idx('2.')).toBeGreaterThan(idx('1.'));
    expect(idx('4.')).toBeGreaterThan(idx('3.'));
  });

  it('prose renders sentence text; gap renders missingSources in a distinct block (never prose-styled)', () => {
    expect(html).toContain('external and internal issues');
    expect(html).toContain('gap-block');
    expect(html).toContain('register.risk_assessments');
    // the gap section must NOT render inside a prose paragraph
    const gapIdx = html.indexOf('register.risk_assessments');
    const gapBlockIdx = html.lastIndexOf('gap-block', gapIdx);
    expect(gapBlockIdx).toBeGreaterThan(-1);
  });

  it('na_justified and failed render their own markers', () => {
    expect(html).toContain('Not applicable — Design not performed at this organization');
    expect(html).toContain('failed-block');
    expect(html).toContain('no content is presented rather than');
  });

  it('escapes tenant-sourced HTML (no script injection from content)', () => {
    const evil = buildDocumentHtml(meta, {
      ...manualContent,
      sections: [{
        harmonizationKey: '4.1-context',
        clauseRefs: [{ standard: 'ISO9001', clauseNo: '4.1' }],
        kind: 'prose' as const,
        sentences: [{ text: '<script>alert(1)</script>' }],
      }],
    });
    expect(evil).not.toContain('<script>alert');
    expect(evil).toContain('&lt;script&gt;');
  });
});

describe('buildDocumentHtml — correlation matrix', () => {
  const html = buildDocumentHtml(
    { ...meta, title: 'Standards Correlation Matrix', docType: 'correlation_matrix' },
    {
      kind: 'correlation_matrix' as const,
      standards: ['ISO9001', 'ISO14001'],
      rows: [{
        harmonizationKey: '6.1-risks', sectionKind: 'prose',
        coverage: [
          { standard: 'ISO9001', clauseNo: '6.1', clauseTitle: 'Actions to address risks', annexSlMode: 'FORKED' },
          { standard: 'ISO14001', clauseNo: '6.1', clauseTitle: 'Environmental aspects', annexSlMode: 'FORKED' },
        ],
      }],
    },
  );

  it('renders one column per standard with clause coverage', () => {
    expect(html).toContain('<th>ISO9001</th>');
    expect(html).toContain('<th>ISO14001</th>');
    expect(html).toContain('Actions to address risks');
    expect(html).toContain('FORKED');
    expect(html).toContain('Controlled Document');
  });
});

describe('buildDocumentHtml — master list', () => {
  const html = buildDocumentHtml(
    { ...meta, title: 'Documented Information Master List', docType: 'master_list' },
    {
      kind: 'master_list' as const,
      entries: [{
        documentId: 'doc-2', title: 'Context of the Organization (4.1-context)', docType: 'procedure',
        standard: 'ISO9001', clauseRefs: ['4.1'], status: 'draft', versionNo: 1,
      }],
    },
  );

  it('renders the register table with title/type/standard/version/status', () => {
    expect(html).toContain('Context of the Organization');
    expect(html).toContain('<th>Title</th>');
    expect(html).toContain('procedure');
    expect(html).toContain('draft');
  });
});

describe('esc', () => {
  it('escapes &, <, >, ", \'', () => {
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(esc(undefined)).toBe('');
  });
});
