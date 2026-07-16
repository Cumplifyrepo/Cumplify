/**
 * PdfRenderFn + ExportFn hermetic tests (spec 40, Task 9 — STO-3/4).
 * AWS clients mocked; chromium is NEVER loaded (the all-cached path skips the
 * lazy import — the render path itself is D3 live-readback territory).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockS3Send, mockLambdaSend } = vi.hoisted(() => {
  process.env.CONTENT_BUCKET = 'test-general-bucket';
  process.env.PDF_RENDER_FN = 'test-pdf-render-fn';
  return { mockS3Send: vi.fn(), mockLambdaSend: vi.fn() };
});

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = mockS3Send; },
  GetObjectCommand: class { constructor(public input: unknown) {} },
  PutObjectCommand: class { constructor(public input: unknown) {} },
  HeadObjectCommand: class { constructor(public input: unknown) {} },
}));
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class { send = mockLambdaSend; },
  InvokeCommand: class { constructor(public input: unknown) {} },
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/zip?sig=abc'),
}));
vi.mock('@aws-lambda-powertools/logger', () => ({
  Logger: class { info = vi.fn(); warn = vi.fn(); error = vi.fn(); appendKeys = vi.fn(); },
}));

import { handler as renderHandler, pdfKeyFor, assertTenantKey } from '../src/render.js';
import { handler as exportHandler } from '../src/export.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';

const T = 'tenant-test';

function s3Json(obj: unknown) {
  const body = JSON.stringify(obj);
  return {
    Body: {
      transformToString: () => Promise.resolve(body),
      transformToByteArray: () => Promise.resolve(new TextEncoder().encode(body)),
    },
  };
}

beforeEach(() => {
  mockS3Send.mockReset();
  mockLambdaSend.mockReset();
});

describe('PdfRenderFn guards + cache', () => {
  it('assertTenantKey rejects keys outside the tenant prefix', () => {
    expect(() => assertTenantKey(T, `tenants/${T}/documents/d/v1.json`)).not.toThrow();
    expect(() => assertTenantKey(T, 'tenants/tenant-other/documents/d/v1.json')).toThrow('TENANT_KEY_MISMATCH');
    expect(() => assertTenantKey(T, 'other/prefix.json')).toThrow('TENANT_KEY_MISMATCH');
  });

  it('pdf key is sha-derived: same body → same key, changed body → new key', () => {
    const shaA = createHash('sha256').update('{"a":1}').digest('hex');
    const shaB = createHash('sha256').update('{"a":2}').digest('hex');
    expect(pdfKeyFor(T, 'doc-1', shaA)).toBe(`tenants/${T}/pdf/doc-1-${shaA.slice(0, 12)}.pdf`);
    expect(pdfKeyFor(T, 'doc-1', shaA)).not.toBe(pdfKeyFor(T, 'doc-1', shaB));
  });

  it('fully-cached batch: HeadObject hits → returns cached=true, never launches chromium, no PutObject', async () => {
    const content = { sections: [] };
    mockS3Send.mockImplementation((cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === 'GetObjectCommand') return Promise.resolve(s3Json(content));
      if (cmd.constructor.name === 'HeadObjectCommand') return Promise.resolve({}); // exists
      return Promise.reject(new Error(`unexpected ${cmd.constructor.name}`));
    });

    const res = await renderHandler({
      tenantId: T,
      documents: [{
        documentId: 'doc-1', versionId: 'ver-1',
        contentKey: `tenants/${T}/documents/doc-1/v1.json`,
        title: 'Manual', docType: 'manual', standard: 'IMS', versionNo: 1,
      }],
    });

    expect(res.results).toHaveLength(1);
    expect(res.results[0].cached).toBe(true);
    const sha = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    expect(res.results[0].pdfKey).toBe(pdfKeyFor(T, 'doc-1', sha));
    const puts = mockS3Send.mock.calls.filter(c => c[0].constructor.name === 'PutObjectCommand');
    expect(puts).toHaveLength(0);
  });

  it('rejects cross-tenant contentKey and empty batch', async () => {
    await expect(renderHandler({
      tenantId: T,
      documents: [{
        documentId: 'd', versionId: 'v', contentKey: 'tenants/tenant-other/x.json',
        title: 't', docType: 'manual', standard: 'IMS', versionNo: 1,
      }],
    })).rejects.toThrow('TENANT_KEY_MISMATCH');
    await expect(renderHandler({ tenantId: T, documents: [] })).rejects.toThrow('BAD_REQUEST');
  });
});

describe('ExportFn', () => {
  const manual = {
    documentId: 'doc-manual', versionId: 'ver-manual',
    contentKey: `tenants/${T}/documents/doc-manual/v1.json`,
    title: 'IMS Manual', docType: 'manual', standard: 'IMS', versionNo: 1,
  };
  const masterEntries = [
    { documentId: 'doc-manual', title: 'IMS Manual', docType: 'manual', standard: 'IMS',
      versionNo: 1, contentRef: `tenants/${T}/documents/doc-manual/v1.json` },
    { documentId: 'doc-clause', title: 'Context (4.1)', docType: 'procedure', standard: 'ISO9001',
      versionNo: 1, contentRef: `tenants/${T}/documents/doc-clause/v1.json` },
  ];
  const candidates = [
    { documentId: 'ml-other', versionId: 'ver-ml-o', contentKey: `tenants/${T}/documents/ml-other/v1.json`,
      title: 'Master List (other run)', standard: 'IMS', versionNo: 1 },
    { documentId: 'ml-match', versionId: 'ver-ml-m', contentKey: `tenants/${T}/documents/ml-match/v1.json`,
      title: 'Documented Information Master List', standard: 'IMS', versionNo: 1 },
  ];

  function wireHappyPath() {
    mockS3Send.mockImplementation((cmd: { constructor: { name: string }; input: { Key?: string } }) => {
      const key = cmd.input.Key ?? '';
      if (cmd.constructor.name === 'GetObjectCommand') {
        if (key.includes('ml-other')) return Promise.resolve(s3Json({ entries: [{ documentId: 'someone-else' }] }));
        if (key.includes('ml-match')) return Promise.resolve(s3Json({ entries: masterEntries }));
        if (key.endsWith('.pdf')) return Promise.resolve(s3Json({ pdf: key })); // fake pdf bytes
        return Promise.resolve(s3Json({}));
      }
      if (cmd.constructor.name === 'PutObjectCommand') return Promise.resolve({});
      return Promise.reject(new Error(`unexpected ${cmd.constructor.name}`));
    });
    mockLambdaSend.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({
        results: [
          { documentId: 'doc-manual', versionId: 'ver-manual', pdfKey: `tenants/${T}/pdf/doc-manual-a.pdf`, sha256: 'a', cached: false },
          { documentId: 'doc-clause', versionId: 'doc-clause-v1', pdfKey: `tenants/${T}/pdf/doc-clause-b.pdf`, sha256: 'b', cached: true },
          { documentId: 'ml-match', versionId: 'ver-ml-m', pdfKey: `tenants/${T}/pdf/ml-match-c.pdf`, sha256: 'c', cached: true },
        ],
      })),
    });
  }

  it('resolves the export set from the master list that CONTAINS the manual (skips non-matching candidate)', async () => {
    wireHappyPath();
    const res = await exportHandler({ tenantId: T, manual, masterListCandidates: candidates });
    expect(res.url).toBe('https://signed.example/zip?sig=abc');

    // render batch = 2 entries + the matching master list itself, manual pinned to its CURRENT version
    const invokePayload = JSON.parse(String(mockLambdaSend.mock.calls[0][0].input.Payload));
    expect(invokePayload.documents).toHaveLength(3);
    expect(invokePayload.documents[0].versionId).toBe('ver-manual');
    expect(invokePayload.documents.map((d: { documentId: string }) => d.documentId))
      .toEqual(['doc-manual', 'doc-clause', 'ml-match']);
  });

  it('uploads a real ZIP (PK header) with the manual as 00- first entry, presigned at 900s', async () => {
    wireHappyPath();
    await exportHandler({ tenantId: T, manual, masterListCandidates: candidates });

    const put = mockS3Send.mock.calls.find(c =>
      c[0].constructor.name === 'PutObjectCommand' && String(c[0].input.Key).endsWith('.zip'));
    expect(put).toBeTruthy();
    const body = put![0].input.Body as Uint8Array;
    expect(body[0]).toBe(0x50); // 'P'
    expect(body[1]).toBe(0x4b); // 'K'
    const zipText = new TextDecoder().decode(body);
    expect(zipText).toContain('00-ims-manual.pdf');
    expect(put![0].input.Key).toMatch(new RegExp(`^tenants/${T}/exports/ims-doc-manual-`));

    const presignOpts = vi.mocked(getSignedUrl).mock.calls.at(-1)![2];
    expect(presignOpts).toEqual({ expiresIn: 900 });
  });

  it('EXPORT_SET_NOT_FOUND when no master list contains the manual', async () => {
    mockS3Send.mockImplementation(() => Promise.resolve(s3Json({ entries: [{ documentId: 'x' }] })));
    await expect(exportHandler({ tenantId: T, manual, masterListCandidates: candidates }))
      .rejects.toThrow('EXPORT_SET_NOT_FOUND');
  });

  it('RENDER_FAILED when PdfRenderFn returns FunctionError', async () => {
    mockS3Send.mockImplementation((cmd: { input: { Key?: string } }) =>
      Promise.resolve(String(cmd.input.Key).includes('ml-match')
        ? s3Json({ entries: masterEntries })
        : s3Json({ entries: [] })));
    mockLambdaSend.mockResolvedValue({
      FunctionError: 'Unhandled',
      Payload: new TextEncoder().encode('{"errorMessage":"boom"}'),
    });
    await expect(exportHandler({ tenantId: T, manual, masterListCandidates: candidates }))
      .rejects.toThrow('RENDER_FAILED');
  });
});
