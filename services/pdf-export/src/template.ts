/**
 * Controlled-document HTML templates (STO-3, spec-40 Task 9).
 *
 * Renders the canonical content JSON (services/qms-generation/src/derive.ts
 * shapes — the SAME contract the frontend viewer binds to) as a WHITE
 * print-ready CONTROLLED document: branded header, CONTROLLED stamp, QMS
 * Required Document Information block, numbered clauses.
 *
 * Colors are the brand values from frontend/src/tokens/design-tokens.ts
 * (framer.accent / neutral scale) mapped onto a print-light theme — the app
 * UI is dark-theme, a controlled document is not. Font: Inter is the app
 * face; chromium-in-Lambda has no Inter, so the stack falls back to
 * Helvetica/Arial (documented in the task evidence).
 *
 * Pure functions — hermetic-testable, no AWS.
 */

// design-tokens.ts framer values (kept literal: this service must not import
// from frontend/; drift is pinned by template.unit.test.ts)
export const BRAND = {
  accent: 'rgb(0, 101, 248)',
  ink: 'rgb(28, 30, 34)', // neutral900
  inkSoft: 'rgb(137, 146, 159)', // neutral500
  hairline: 'rgb(227, 229, 232)', // neutral200
  surface: 'rgb(252, 252, 252)', // neutral50
  warning: 'rgb(251, 191, 36)',
  danger: 'rgb(248, 113, 113)',
} as const;

export interface DocMeta {
  title: string;
  documentId: string;
  versionNo: number;
  docType: string;
  standard: string;
  tenantName?: string;
  generatedAt: string; // ISO — passed in, template stays pure
}

interface ClauseRef { standard: string; clauseNo: string; clauseTitle?: string }

interface ContentSection {
  harmonizationKey: string;
  clauseRefs: ClauseRef[];
  kind: 'prose' | 'gap' | 'na_justified' | 'failed';
  sentences?: Array<{ text: string; factRefs?: string[] }>;
  gap?: { missingSources: string[] };
  naJustification?: string;
}

interface FrontMatter {
  purpose: string;
  scope?: {
    organization: string | null;
    standards: string[];
    sites: string[];
    managementRepresentative: string | null;
  };
  normativeRefs?: Array<{ standard: string; source: string }>;
}

interface MatrixRow {
  harmonizationKey: string;
  sectionKind: string;
  coverage: Array<{ standard: string; clauseNo: string; clauseTitle: string; annexSlMode: string }>;
}

interface MasterEntry {
  documentId: string;
  title: string;
  docType: string;
  standard: string;
  clauseRefs: string[];
  status: string;
  versionNo: number;
}

export interface ContentJson {
  kind?: 'correlation_matrix' | 'master_list';
  frontMatter?: FrontMatter;
  sections?: ContentSection[];
  standards?: string[];
  rows?: MatrixRow[];
  entries?: MasterEntry[];
  locale?: string;
}

/** HTML-escape tenant-sourced strings (content JSON carries tenant data). */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
         color: ${BRAND.ink}; background: #ffffff; font-size: 11px; line-height: 1.55; }
  .page { padding: 36px 44px; }
  .brand-bar { display: flex; justify-content: space-between; align-items: center;
               border-bottom: 3px solid ${BRAND.accent}; padding-bottom: 10px; margin-bottom: 14px; }
  .brand-name { font-size: 16px; font-weight: 700; color: ${BRAND.accent}; letter-spacing: -0.3px; }
  .controlled-stamp { border: 2px solid ${BRAND.accent}; color: ${BRAND.accent};
                      font-weight: 700; font-size: 10px; letter-spacing: 2px;
                      padding: 4px 10px; text-transform: uppercase; }
  h1 { font-size: 21px; font-weight: 600; letter-spacing: -0.3px; margin: 10px 0 12px; }
  .qms-info { width: 100%; border-collapse: collapse; margin: 12px 0 18px;
              font-size: 10px; border: 1px solid ${BRAND.hairline}; }
  .qms-info caption { text-align: left; font-weight: 600; font-size: 9px; letter-spacing: 2px;
                      text-transform: uppercase; color: ${BRAND.inkSoft}; padding: 4px 0; }
  .qms-info th { text-align: left; background: ${BRAND.surface}; color: ${BRAND.inkSoft};
                 font-weight: 500; padding: 5px 8px; border: 1px solid ${BRAND.hairline}; width: 18%; }
  .qms-info td { padding: 5px 8px; border: 1px solid ${BRAND.hairline}; }
  .disclaimer { background: ${BRAND.surface}; border-left: 3px solid ${BRAND.accent};
                padding: 8px 12px; margin-bottom: 18px; font-size: 10px; color: ${BRAND.ink}; }
  .section { margin-bottom: 14px; page-break-inside: avoid; }
  .section-head { display: flex; gap: 8px; align-items: baseline;
                  border-bottom: 1px solid ${BRAND.hairline}; padding-bottom: 3px; margin-bottom: 6px; }
  .section-no { font-weight: 700; color: ${BRAND.accent}; font-size: 12px; }
  .section-title { font-weight: 600; font-size: 12px; }
  .section-clauses { color: ${BRAND.inkSoft}; font-size: 9px; margin-left: auto; }
  .gap-block { border: 1.5px dashed ${BRAND.warning}; background: rgba(251, 191, 36, 0.07);
               padding: 8px 12px; font-size: 10px; }
  .gap-title { font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; font-size: 9px; }
  .na-block { color: ${BRAND.inkSoft}; font-style: italic; }
  .failed-block { border: 1.5px solid ${BRAND.danger}; padding: 8px 12px; font-size: 10px;
                  color: ${BRAND.ink}; }
  table.grid { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  table.grid th { background: ${BRAND.surface}; color: ${BRAND.ink}; font-weight: 600;
                  text-align: left; padding: 5px 7px; border: 1px solid ${BRAND.hairline}; }
  table.grid td { padding: 4px 7px; border: 1px solid ${BRAND.hairline}; vertical-align: top; }
  .footer-note { margin-top: 20px; padding-top: 8px; border-top: 1px solid ${BRAND.hairline};
                 font-size: 8.5px; color: ${BRAND.inkSoft}; }
`;

function qmsInfoBlock(meta: DocMeta, extra: Array<[string, string]> = []): string {
  const rows: Array<[string, string]> = [
    ['Document ID', meta.documentId],
    ['Document type', meta.docType],
    ['Standard(s)', meta.standard],
    ['Version', `v${meta.versionNo}`],
    ['Generated', meta.generatedAt],
    ...extra,
  ];
  const tr = (pair: [string, string]) => `<tr><th>${esc(pair[0])}</th><td>${esc(pair[1])}</td></tr>`;
  return `<table class="qms-info"><caption>QMS Required Document Information</caption>
    ${rows.map(tr).join('\n    ')}</table>`;
}

function shell(meta: DocMeta, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body><div class="page">
  <div class="brand-bar">
    <span class="brand-name">Cumplify${meta.tenantName ? ` — ${esc(meta.tenantName)}` : ''}</span>
    <span class="controlled-stamp">Controlled Document</span>
  </div>
  <h1>${esc(meta.title)}</h1>
  ${body}
  <div class="footer-note">CONTROLLED when viewed through Cumplify or as a sealed export. Printed or
  copied instances are uncontrolled unless stamped otherwise. ${esc(meta.documentId)} v${meta.versionNo}.</div>
</div></body></html>`;
}

function sectionHtml(s: ContentSection, no: string): string {
  const clauses = (s.clauseRefs ?? [])
    .map(c => `${esc(c.standard)} ${esc(c.clauseNo)}`)
    .join(', ');
  const head = `<div class="section-head"><span class="section-no">${esc(no)}</span>
    <span class="section-title">${esc(s.harmonizationKey)}</span>
    <span class="section-clauses">${clauses}</span></div>`;

  let body: string;
  switch (s.kind) {
    case 'prose':
      body = `<p>${(s.sentences ?? []).map(x => esc(x.text)).join(' ')}</p>`;
      break;
    case 'gap':
      body = `<div class="gap-block"><span class="gap-title">Gap — required information not recorded</span>
        <ul>${(s.gap?.missingSources ?? []).map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>`;
      break;
    case 'na_justified':
      body = `<div class="na-block">Not applicable — ${esc(s.naJustification ?? '')}</div>`;
      break;
    case 'failed':
      body = `<div class="failed-block">Section composition failed — no content is presented rather than
        unverified content.</div>`;
      break;
  }
  return `<div class="section">${head}${body}</div>`;
}

function sectionsDocument(meta: DocMeta, content: ContentJson): string {
  const fm = content.frontMatter;
  const disclaimer = fm?.purpose
    ? `<div class="disclaimer">${esc(fm.purpose)}</div>`
    : '';
  const scope = fm?.scope;
  const extra: Array<[string, string]> = [];
  if (scope?.organization) extra.push(['Organization', scope.organization]);
  if (scope?.managementRepresentative) extra.push(['Management representative', scope.managementRepresentative]);
  if (scope?.sites?.length) extra.push(['Sites', scope.sites.join(' | ')]);
  const sections = (content.sections ?? [])
    .map((s, i) => sectionHtml(s, `${i + 1}.`))
    .join('\n');
  return shell(meta, `${qmsInfoBlock(meta, extra)}${disclaimer}${sections}`);
}

function matrixDocument(meta: DocMeta, content: ContentJson): string {
  const standards = content.standards ?? [];
  const header = `<tr><th>Section</th><th>Kind</th>${standards.map(s => `<th>${esc(s)}</th>`).join('')}</tr>`;
  const rows = (content.rows ?? []).map(r => {
    const byStd = new Map<string, string[]>();
    for (const c of r.coverage) {
      const cur = byStd.get(c.standard) ?? [];
      cur.push(`${c.clauseNo} ${c.clauseTitle} (${c.annexSlMode})`);
      byStd.set(c.standard, cur);
    }
    const cells = standards
      .map(s => `<td>${(byStd.get(s) ?? ['—']).map(esc).join('<br>')}</td>`)
      .join('');
    return `<tr><td>${esc(r.harmonizationKey)}</td><td>${esc(r.sectionKind)}</td>${cells}</tr>`;
  }).join('\n');
  return shell(meta, `${qmsInfoBlock(meta)}<table class="grid">${header}${rows}</table>`);
}

function masterListDocument(meta: DocMeta, content: ContentJson): string {
  const rows = (content.entries ?? []).map(e =>
    `<tr><td>${esc(e.title)}</td><td>${esc(e.docType)}</td><td>${esc(e.standard)}</td>
     <td>${(e.clauseRefs ?? []).map(esc).join(', ')}</td><td>v${esc(e.versionNo)}</td><td>${esc(e.status)}</td></tr>`,
  ).join('\n');
  const header = `<tr><th>Title</th><th>Type</th><th>Standard</th><th>Clauses</th><th>Version</th><th>Status</th></tr>`;
  return shell(meta, `${qmsInfoBlock(meta)}<table class="grid">${header}${rows}</table>`);
}

/** Entry point: pick the template by content kind. */
export function buildDocumentHtml(meta: DocMeta, content: ContentJson): string {
  if (content.kind === 'correlation_matrix') return matrixDocument(meta, content);
  if (content.kind === 'master_list') return masterListDocument(meta, content);
  return sectionsDocument(meta, content);
}
