/**
 * §7 IDENTIFICATION-BLOCK RENDER TEST (architecture §7; view-designs §9.7).
 * Every controlled render MUST carry the identification block — a missing
 * field is a blocking defect; the §7 law is unconditional. Runs the 7
 * mandatory assertions across three content kinds.
 */
import { describe, expect, it } from 'vitest';
import { buildDocumentHtml, type DocMeta, type ContentJson } from '../lib/controlled-doc/template';
const meta: DocMeta = {
  title: 'Quality Manual — Context of the Organization',
  documentId: 'QM-9001-4.1',
  versionNo: 3,
  docType: 'MANUAL_SECTION',
  standard: 'ISO9001',
  tenantName: 'Acme Manufacturing',
  generatedAt: '2026-07-21T22:30:00.000Z',
};
const CONTENT_KINDS: Record<string, ContentJson> = {
  sections: {
    sections: [
      {
        heading: '4.1 Understanding the organization',
        kind: 'prose',
        clauseRefs: [{ standard: 'ISO9001', clauseNo: '4.1' }],
        body: 'The organization determines external and internal issues.',
      } as never,
    ],
  },
  correlation_matrix: {
    kind: 'correlation_matrix',
    standards: ['ISO9001', 'ISO14001', 'ISO45001'],
    rows: [] as never[],
  },
  form_record: {
    kind: 'form_record',
    record: { id: 'rec-1', status: 'complete' } as never,
    recordSections: [] as never[],
  },
};
describe('§7 identification block — 7 mandatory fields on EVERY controlled render', () => {
  for (const [kindName, content] of Object.entries(CONTENT_KINDS)) {
    describe(`content kind: ${kindName}`, () => {
      const html = buildDocumentHtml(meta, content);
      it('1. document ID in the info block', () => {
        expect(html).toContain(meta.documentId);
      });
      it('2. title rendered', () => {
        expect(html).toContain('Quality Manual');
      });
      it('3. version number', () => {
        expect(html).toContain(`v${meta.versionNo}`);
      });
      it('4. standard', () => {
        expect(html).toContain(meta.standard);
      });
      it('5. CONTROLLED stamp', () => {
        expect(html).toContain('Controlled Document');
      });
      it('6. uncontrolled-when-printed footer notice', () => {
        expect(html).toContain('CONTROLLED when viewed through Cumplify');
      });
      it('7. generated date', () => {
        expect(html).toContain('2026');
      });
    });
  }
});
