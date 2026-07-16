/**
 * PdfRenderFn (STO-3, spec-40 Task 9).
 *
 * Batch-renders content JSONs (GeneralBucket) to controlled-document PDFs
 * (GeneralBucket) with puppeteer-core + @sparticuz/chromium. x86_64 ONLY —
 * the sparticuz chromium build is not ARM; this function alone diverges from
 * the repo's ARM default (design §5, documented).
 *
 * One browser per invocation, pages rendered with bounded concurrency —
 * callers (ExportFn inside the AppSync 30s cap) need the 39-document IMS set
 * to finish in seconds, not minutes.
 *
 * PDF cache: key = tenants/<t>/pdf/<documentId>-<bodySha12>.pdf. The sha is
 * computed from the FETCHED body, so the cache can never serve a stale PDF
 * for changed content; re-renders are skipped via HeadObject.
 */

import { createHash } from 'node:crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { buildDocumentHtml, type ContentJson, type DocMeta } from './template.js';

const logger = new Logger({ serviceName: 'pdf-render' });
const s3 = new S3Client({});
const CONTENT_BUCKET = process.env.CONTENT_BUCKET ?? '';
const PAGE_CONCURRENCY = 4;

export interface RenderRequestDoc {
  documentId: string;
  versionId: string;
  contentKey: string;
  title: string;
  docType: string;
  standard: string;
  versionNo: number;
}

export interface RenderRequest {
  tenantId: string;
  documents: RenderRequestDoc[];
  /** re-render even when a cached PDF exists */
  force?: boolean;
}

export interface RenderedDoc {
  documentId: string;
  versionId: string;
  pdfKey: string;
  sha256: string;
  cached: boolean;
}

// puppeteer/chromium are imported lazily so hermetic unit tests can load this
// module (and test key/guard logic) without the chromium binary present.
async function launchBrowser() {
  const { default: chromium } = await import('@sparticuz/chromium');
  const { default: puppeteer } = await import('puppeteer-core');
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 }, // A4 @ 150dpi
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export function pdfKeyFor(tenantId: string, documentId: string, bodySha256: string): string {
  return `tenants/${tenantId}/pdf/${documentId}-${bodySha256.slice(0, 12)}.pdf`;
}

export function assertTenantKey(tenantId: string, key: string): void {
  if (!key.startsWith(`tenants/${tenantId}/`)) {
    throw new Error(`TENANT_KEY_MISMATCH: ${key}`);
  }
}

async function getBody(key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }));
  return await res.Body!.transformToString();
}

async function pdfExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function handler(event: RenderRequest): Promise<{ results: RenderedDoc[] }> {
  const { tenantId, documents, force } = event;
  if (!tenantId || !Array.isArray(documents) || documents.length === 0) {
    throw new Error('BAD_REQUEST: tenantId and documents[] required');
  }
  if (!CONTENT_BUCKET) throw new Error('CONTENT_BUCKET not configured');
  logger.appendKeys({ tenantId, docCount: documents.length });

  // 1. Fetch bodies + decide cache hits BEFORE paying for chromium: if every
  //    PDF is cached, the browser never launches.
  const prepared = await Promise.all(
    documents.map(async (d) => {
      assertTenantKey(tenantId, d.contentKey);
      const body = await getBody(d.contentKey);
      const sha = createHash('sha256').update(body).digest('hex');
      const pdfKey = pdfKeyFor(tenantId, d.documentId, sha);
      const cached = force ? false : await pdfExists(pdfKey);
      return { doc: d, body, sha, pdfKey, cached };
    }),
  );

  const toRender = prepared.filter((p) => !p.cached);
  logger.info('render plan', { total: prepared.length, cached: prepared.length - toRender.length });

  if (toRender.length > 0) {
    const browser = await launchBrowser();
    try {
      // bounded concurrency: PAGE_CONCURRENCY pages at a time
      let idx = 0;
      const worker = async () => {
        while (idx < toRender.length) {
          const item = toRender[idx++];
          const content = JSON.parse(item.body) as ContentJson;
          const meta: DocMeta = {
            title: item.doc.title,
            documentId: item.doc.documentId,
            versionNo: item.doc.versionNo,
            docType: item.doc.docType,
            standard: item.doc.standard,
            generatedAt: new Date().toISOString().slice(0, 10),
          };
          const page = await browser.newPage();
          try {
            await page.setContent(buildDocumentHtml(meta, content), { waitUntil: 'load' });
            const pdf = await page.pdf({ format: 'A4', printBackground: true });
            await s3.send(
              new PutObjectCommand({
                Bucket: CONTENT_BUCKET,
                Key: item.pdfKey,
                Body: pdf,
                ContentType: 'application/pdf',
              }),
            );
          } finally {
            await page.close();
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(PAGE_CONCURRENCY, toRender.length) }, () => worker()),
      );
    } finally {
      await browser.close();
    }
  }

  return {
    results: prepared.map((p) => ({
      documentId: p.doc.documentId,
      versionId: p.doc.versionId,
      pdfKey: p.pdfKey,
      sha256: p.sha,
      cached: p.cached,
    })),
  };
}
