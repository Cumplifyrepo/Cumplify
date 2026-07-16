/**
 * form_record HTML template hermetic tests (spec 41, Task 8 — REC-7).
 * Pure-function layer: no AWS, no chromium. Labels arrive PRE-RESOLVED from
 * the forms resolver — this template renders strings it is given.
 */

import { describe, it, expect } from 'vitest';
import { buildDocumentHtml, type ContentJson, type DocMeta } from '../src/template.js';

const meta: DocMeta = {
  title: 'Nonconformity & Corrective Action (NCR)',
  documentId: 'rec-0000-1111',
  versionNo: 1,
  docType: 'form_record',
  standard: 'IMS',
  generatedAt: '2026-07-16',
};

const content: ContentJson = {
  kind: 'form_record',
  locale: 'en',
  record: {
    id: 'rec-0000-1111',
    status: 'APPROVED',
    openedBy: 'user-a',
    completedBy: 'user-b',
    completedAt: '2026-07-16T10:00:00Z',
    approvedBy: 'approver-1',
    approvedAt: '2026-07-16T11:00:00Z',
    m2NcId: 'nc-42',
  },
  recordSections: [
    {
      key: 'info',
      title: 'NCR Information',
      fields: [
        {
          key: 'ncr_number',
          label: 'NCR Number',
          type: 'text',
          required: true,
          filled: true,
          display: 'NCR-001',
        },
        {
          key: 'clause_ref',
          label: 'Clause Reference',
          type: 'relation',
          required: true,
          filled: true,
          display: 'ISO9001 8.7 — Nonconforming outputs',
        },
        {
          key: 'severity',
          label: 'Severity',
          type: 'select',
          required: true,
          filled: false,
          display: '',
        },
        {
          key: 'notes',
          label: 'Notes <script>',
          type: 'textarea',
          required: false,
          filled: true,
          display: '<img src=x onerror=alert(1)>',
        },
      ],
    },
  ],
};

describe('form_record template', () => {
  const html = buildDocumentHtml(meta, content);

  it('routes kind form_record to the record layout (meta + lifecycle rows)', () => {
    expect(html).toContain('Nonconformity &amp; Corrective Action (NCR)');
    expect(html).toContain('<th>Status</th><td>APPROVED</td>');
    expect(html).toContain('<th>Opened by</th><td>user-a</td>');
    expect(html).toContain('user-b — 2026-07-16');
    expect(html).toContain('approver-1 — 2026-07-16');
    expect(html).toContain('<th>Nonconformity ID</th><td>nc-42</td>');
  });

  it('renders section titles and field rows; required marker; unfilled → em dash', () => {
    expect(html).toContain('NCR Information');
    expect(html).toContain('NCR Number *');
    expect(html).toContain('NCR-001');
    expect(html).toContain('ISO9001 8.7 — Nonconforming outputs');
    // severity is required + unfilled: label marked, value cell is the em dash
    expect(html).toContain('Severity *');
    expect(html).toMatch(/Severity \*<\/td>\s*<td>—<\/td>/);
  });

  it('escapes tenant-sourced labels and values (no raw HTML injection)', () => {
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Notes &lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('never prints [object Object]', () => {
    expect(html).not.toContain('[object Object]');
  });

  it('a record with no lifecycle actors renders without optional rows', () => {
    const draft = buildDocumentHtml(meta, {
      kind: 'form_record',
      record: { id: 'r2', status: 'DRAFT', openedBy: 'user-a' },
      recordSections: [],
    });
    expect(draft).toContain('<th>Status</th><td>DRAFT</td>');
    expect(draft).not.toContain('Completed by');
    expect(draft).not.toContain('Approved by');
    expect(draft).not.toContain('Nonconformity ID');
  });
});
