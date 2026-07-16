/**
 * ExportFn (STO-4, spec-40 Task 9).
 *
 * Invoked by QmsFn's requestImsExport resolver case (the resolver stays on
 * qmsDS — moving the AppSync resolver to a new data source would churn CFN;
 * QmsFn does the SQL, this function does the S3/zip work).
 *
 * Input carries the manual (latest version, fresh from SQL) plus the
 * master-list CANDIDATES (SQL cannot see which master list belongs to which
 * manual — that linkage lives only in the master-list content JSON, so it is
 * resolved HERE by reading the candidates until one lists the manual).
 *
 * Export set = master-list entries (manual + clause docs + correlation
 * matrix, each pinned at the contentRef the finalize wrote) + the master
 * list itself; the manual entry is upgraded to its CURRENT latest version.
 * Carry-forward: clause-doc entries pin v1 until regenerateSection ships
 * (no v2 exists today) — noted in the task evidence.
 *
 * Whole IMS set must fit the AppSync 30s resolver cap: PdfRenderFn renders
 * with one browser + page concurrency; PDFs are sha-cached so re-exports
 * skip chromium entirely.
 */

import { randomUUID } from 'node:crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { zipSync } from 'fflate';
import type { RenderRequestDoc, RenderedDoc } from './render.js';
import { assertTenantKey } from './render.js';

const logger = new Logger({ serviceName: 'ims-export' });
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const CONTENT_BUCKET = process.env.CONTENT_BUCKET ?? '';
const PDF_RENDER_FN = process.env.PDF_RENDER_FN ?? '';
const URL_TTL_SECONDS = 15 * 60; // 15 min (STO-4)

interface ManualInput {
  documentId: string;
  versionId: string;
  contentKey: string;
  title: string;
  docType: string;
  standard: string;
  versionNo: number;
}

interface MasterListCandidate {
  documentId: string;
  versionId: string;
  contentKey: string;
  title: string;
  standard: string;
  versionNo: number;
}

export interface ExportRequest {
  tenantId: string;
  manual: ManualInput;
  masterListCandidates: MasterListCandidate[];
}

interface MasterEntry {
  documentId: string;
  title: string;
  docType: string;
  standard: string;
  versionNo: number;
  contentRef: string;
}

async function readJson(key: string): Promise<{ entries?: MasterEntry[] }> {
  const res = await s3.send(new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: key }));
  return JSON.parse(await res.Body!.transformToString());
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document'
  );
}

export async function handler(event: ExportRequest): Promise<{ url: string; expiresAt: string }> {
  const { tenantId, manual, masterListCandidates } = event;
  if (!tenantId || !manual?.documentId)
    throw new Error('BAD_REQUEST: tenantId and manual required');
  if (!CONTENT_BUCKET || !PDF_RENDER_FN) throw new Error('EXPORT_NOT_CONFIGURED');
  logger.appendKeys({ tenantId, manualDocumentId: manual.documentId });

  // 1. Resolve the export set from the master list that lists this manual.
  let masterList: MasterListCandidate | null = null;
  let entries: MasterEntry[] = [];
  for (const cand of masterListCandidates ?? []) {
    assertTenantKey(tenantId, cand.contentKey);
    const content = await readJson(cand.contentKey);
    if (content.entries?.some((e) => e.documentId === manual.documentId)) {
      masterList = cand;
      entries = content.entries;
      break;
    }
  }
  if (!masterList) throw new Error('EXPORT_SET_NOT_FOUND');

  // 2. Build the render batch: entries (manual entry replaced by its CURRENT
  //    latest version from SQL) + the master list itself.
  const docs: RenderRequestDoc[] = [
    ...entries.map((e) =>
      e.documentId === manual.documentId
        ? {
            documentId: manual.documentId,
            versionId: manual.versionId,
            contentKey: manual.contentKey,
            title: manual.title,
            docType: manual.docType,
            standard: manual.standard,
            versionNo: manual.versionNo,
          }
        : {
            documentId: e.documentId,
            versionId: `${e.documentId}-v${e.versionNo}`,
            contentKey: e.contentRef,
            title: e.title,
            docType: e.docType,
            standard: e.standard,
            versionNo: e.versionNo,
          },
    ),
    {
      documentId: masterList.documentId,
      versionId: masterList.versionId,
      contentKey: masterList.contentKey,
      title: masterList.title,
      docType: 'master_list',
      standard: masterList.standard,
      versionNo: masterList.versionNo,
    },
  ];
  for (const d of docs) assertTenantKey(tenantId, d.contentKey);

  // 3. Render (sha-cached inside PdfRenderFn).
  const invoke = await lambda.send(
    new InvokeCommand({
      FunctionName: PDF_RENDER_FN,
      Payload: JSON.stringify({ tenantId, documents: docs }),
    }),
  );
  if (invoke.FunctionError) {
    logger.error('render failed', { err: new TextDecoder().decode(invoke.Payload) });
    throw new Error('RENDER_FAILED');
  }
  const { results } = JSON.parse(new TextDecoder().decode(invoke.Payload)) as {
    results: RenderedDoc[];
  };

  // 4. Zip. Manual first (00-), then the rest in master-list order.
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  let n = 0;
  for (const doc of docs) {
    const r = results.find((x) => x.documentId === doc.documentId);
    if (!r) throw new Error(`RENDER_MISSING: ${doc.documentId}`);
    const body = await s3.send(new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: r.pdfKey }));
    const prefix = doc.documentId === manual.documentId ? '00' : String(++n).padStart(2, '0');
    let name = `${prefix}-${slug(doc.title)}.pdf`;
    while (used.has(name)) name = `${prefix}-${slug(doc.title)}-${randomUUID().slice(0, 4)}.pdf`;
    used.add(name);
    files[name] = new Uint8Array(await body.Body!.transformToByteArray());
  }
  const zipped = zipSync(files, { level: 6 });

  // 5. Upload + presign (15 min). Signed with this role's creds — TTL is far
  //    below the role session lifetime, so the URL honors the full 15 min.
  const zipKey = `tenants/${tenantId}/exports/ims-${manual.documentId}-${randomUUID().slice(0, 8)}.zip`;
  await s3.send(
    new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: zipKey,
      Body: zipped,
      ContentType: 'application/zip',
    }),
  );
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: CONTENT_BUCKET, Key: zipKey }),
    { expiresIn: URL_TTL_SECONDS },
  );
  const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString();
  logger.info('export complete', { zipKey, files: Object.keys(files).length });
  return { url, expiresAt };
}
