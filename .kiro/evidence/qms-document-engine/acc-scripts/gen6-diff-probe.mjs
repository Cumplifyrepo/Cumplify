/**
 * GEN-6 live probe (spec-40, regenerateSection wave) — proves the ACC-6
 * second clause end-to-end on tenant-arch-smoke:
 *   regenerateSection (real composer, one door) → manual v2 + clause-doc v2 +
 *   refreshed master list → getDocumentVersionDiff(v1, v2) NON-ZERO.
 * Plus negatives (RUN_NOT_FOUND, SECTION_NOT_FOUND) and APR-1 review reset.
 */
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

const T = 'tenant-arch-smoke';
const QMS_FN = process.env.QMS_FN;
const M1_FN = process.env.M1_FN;
const CLUSTER = 'arn:aws:rds:us-east-1:697114252993:cluster:dev-datastack-auroracluster23d869c0-zmmgimmc0vnd';
const SECRET = 'arn:aws:secretsmanager:us-east-1:697114252993:secret:RdsMasterSecretC1475EBB-1GVOC4xruniy-jgacYf';

const lambda = new LambdaClient({ region: 'us-east-1' });
const rds = new RDSDataClient({ region: 'us-east-1' });

async function sql(text) {
  const res = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER, secretArn: SECRET, database: 'postgres', sql: text, includeResultMetadata: true,
  }));
  return (res.records ?? []).map(r => Object.fromEntries(
    r.map((c, i) => [res.columnMetadata[i].name, c.isNull ? null : Object.values(c)[0]]),
  ));
}

async function invoke(fn, fieldName, args, sub = 'architect-readback') {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: fn,
    Payload: JSON.stringify({
      info: { fieldName }, arguments: args,
      identity: { resolverContext: { tenantId: T, sub, role: 'QualityManager' } },
    }),
  }));
  const payload = JSON.parse(new TextDecoder().decode(res.Payload));
  if (res.FunctionError) return { error: payload.errorMessage ?? JSON.stringify(payload) };
  return { data: payload };
}

const iso = () => new Date().toISOString();
let failures = 0;
const row = (step, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${detail}`);
  if (!ok) failures++;
};

// ── locate the finalized run + a prose section ───────────────────────────────
const run = (await sql(`SELECT id, status, manual_document_id FROM qms.generation_runs
  WHERE tenant_id='${T}' AND manual_document_id IS NOT NULL ORDER BY started_at DESC LIMIT 1`))[0];
const section = (await sql(`SELECT harmonization_key FROM qms.generation_sections
  WHERE run_id='${run.id}' AND status='prose' ORDER BY harmonization_key LIMIT 1`))[0];
const preVersions = await sql(`SELECT MAX(version_no) AS v FROM m1.document_versions WHERE document_id='${run.manual_document_id}'`);
console.log(`run=${run.id} status=${run.status} manual=${run.manual_document_id} section=${section.harmonization_key} preManualVmax=${preVersions[0].v}`);

// ── negatives first ──────────────────────────────────────────────────────────
const negRun = await invoke(QMS_FN, 'regenerateSection', { input: { runId: 'deadbeef-0000-4000-8000-000000000000', harmonizationKey: 'x' } });
row('unknown run → RUN_NOT_FOUND', negRun.error?.includes('RUN_NOT_FOUND'), `${iso()} err=${negRun.error}`);
const negSec = await invoke(QMS_FN, 'regenerateSection', { input: { runId: run.id, harmonizationKey: 'no-such-key' } });
row('unknown section → SECTION_NOT_FOUND', negSec.error?.includes('SECTION_NOT_FOUND'), `${iso()} err=${negSec.error}`);

// ── the regeneration ─────────────────────────────────────────────────────────
const t0 = Date.now();
const regen = await invoke(QMS_FN, 'regenerateSection', { input: { runId: run.id, harmonizationKey: section.harmonization_key } });
row('regenerateSection returns the section', !!regen.data?.id && !regen.error,
  `${iso()} kind=${regen.data?.kind} sha=${(regen.data?.contentSha256 ?? '').slice(0, 12)} ${Date.now() - t0}ms`);
row('review state cleared (APR-1 not inheritable)', regen.data?.reviewedBy === null && regen.data?.reviewedAt === null,
  `${iso()} reviewedBy=${regen.data?.reviewedBy}`);

// ── DB truth: new versions ───────────────────────────────────────────────────
const manualVersions = await sql(`SELECT id, version_no, content_ref, content_sha256, change_summary, author_id
  FROM m1.document_versions WHERE document_id='${run.manual_document_id}' ORDER BY version_no`);
const vNew = manualVersions.at(-1);
row('manual has a NEW version (GEN-6: version without regenerating the manual run)',
  manualVersions.length >= 2 && vNew.version_no === Number(preVersions[0].v) + 1 && vNew.content_ref.endsWith(`v${vNew.version_no}.json`),
  `${iso()} versions=${manualVersions.map(v => v.version_no).join(',')} newRef=${vNew.content_ref} author=${vNew.author_id} summary="${vNew.change_summary}"`);

const master = await sql(`SELECT d.id, MAX(v.version_no) AS vmax FROM m1.documents d
  JOIN m1.document_versions v ON v.document_id=d.id
  WHERE d.tenant_id='${T}' AND d.doc_type='master_list' GROUP BY d.id`);
row('master list re-versioned (entries refreshed — Task-9 carry-forward closed)',
  master.some(m => Number(m.vmax) >= 2), `${iso()} ${JSON.stringify(master)}`);

// ── ACC-6: non-zero section-keyed diff v1 vs vNew via the REAL resolver ──────
const v1 = manualVersions[0];
const diff = await invoke(M1_FN, 'getDocumentVersionDiff', { v1: v1.id, v2: vNew.id });
const parsedContent = diff.data ? JSON.parse(diff.data.content ?? '{}') : {};
row('getDocumentVersionDiff(v1, vNew) is NON-ZERO and keyed by the regenerated section',
  !diff.error && (diff.data.additions > 0 || diff.data.deletions > 0) && Object.keys(parsedContent).includes(section.harmonization_key),
  `${iso()} additions=${diff.data?.additions} deletions=${diff.data?.deletions} keys=${Object.keys(parsedContent).join(',')}`);

// same-version sanity: v1 vs v1 must still be 0/0
const zero = await invoke(M1_FN, 'getDocumentVersionDiff', { v1: v1.id, v2: v1.id });
row('same-version diff stays 0/0 (control)', zero.data?.additions === 0 && zero.data?.deletions === 0,
  `${iso()} ${zero.data?.additions}/${zero.data?.deletions}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
