/**
 * Spec-41 Task 8 live readback (D3): exportFormRecordPdf + approved-record sealing.
 * Invokes FormsFn DIRECTLY with synthetic AppSync events (established readback
 * pattern) on tenant-arch-smoke. Asserts BEHAVIOR: PDF bytes over the presigned
 * URL, S3 Object-Lock retention == m4.records retain_until == object_lock_until
 * to the millisecond, forms.records.m4_record_id stamped, RLS negative.
 */
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { S3Client, GetObjectRetentionCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const REGION = 'us-east-1';
const T = 'tenant-arch-smoke';
const FORMS_FN = process.env.FORMS_FN;
const CLUSTER = 'arn:aws:rds:us-east-1:697114252993:cluster:dev-datastack-auroracluster23d869c0-zmmgimmc0vnd';
const SECRET = 'arn:aws:secretsmanager:us-east-1:697114252993:secret:RdsMasterSecretC1475EBB-1GVOC4xruniy-jgacYf';
const EVIDENCE_BUCKET = 'dev-datastack-evidencevault2b2802b4-9gbjwnn7s30y';
const MGMT_REVIEW_TPL = 'a0000001-0000-4000-8000-000000000002';

const lambda = new LambdaClient({ region: REGION });
const rds = new RDSDataClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

const results = [];
function row(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  ${detail}`);
  if (!ok) { console.error('ABORT on failure'); printAndExit(1); }
}
function printAndExit(code) {
  console.log('\n=== SUMMARY ===');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.step}`);
  process.exit(code);
}

async function invoke(fieldName, args, sub) {
  const event = {
    info: { fieldName },
    arguments: args,
    identity: { resolverContext: { tenantId: T, sub, role: 'QualityManager' } },
  };
  const res = await lambda.send(new InvokeCommand({ FunctionName: FORMS_FN, Payload: JSON.stringify(event) }));
  const payload = JSON.parse(new TextDecoder().decode(res.Payload));
  if (res.FunctionError) return { error: payload.errorMessage ?? JSON.stringify(payload) };
  return { data: payload };
}

async function sql(text) {
  const res = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER, secretArn: SECRET, database: 'postgres', sql: text,
    includeResultMetadata: true,
  }));
  return (res.records ?? []).map(r => Object.fromEntries(
    r.map((c, i) => [res.columnMetadata[i].name, c.isNull ? null : Object.values(c)[0]]),
  ));
}

const iso = () => new Date().toISOString();

// ── 1. create record (opener/completer = architect-readback) ────────────────
const create = await invoke('createFormRecord', { templateId: MGMT_REVIEW_TPL }, 'architect-readback');
row('createFormRecord', !!create.data?.id, `${iso()} recordId=${create.data?.id} status=${create.data?.status}`);
const recordId = create.data.id;

// ── 2. fill all required fields ──────────────────────────────────────────────
const values = {
  review_date: '2026-07-16T00:00:00Z',
  chairperson: 'architect-readback',
  attendees: 'A. Architect; K. Iro; J. Medrano',
  standards_reviewed: ['ISO9001', 'ISO14001'],
  customer_feedback: 'Feedback reviewed; two survey results discussed.',
  objectives_progress: 'Quality objectives on track (3 of 4 met).',
  process_performance: 'Process KPIs within control limits.',
  nc_capa_status: 'Two NCs open, one CAPA closed effective.',
  audit_results: 'Internal audit round 1 complete; no major findings.',
  resource_adequacy: 'Resources adequate; one hire pending.',
  risk_opportunity_changes: 'Registry reviewed; no new critical risks.',
  improvement_opportunities: 'Automate calibration recall notices.',
  decisions_actions: 'Approve objective refresh for Q4.',
  improvement_actions: 'Digitize supplier evaluation records.',
  next_review_date: '2027-01-16T00:00:00Z',
};
const save = await invoke('saveFormRecordValues', { input: { recordId, values: JSON.stringify(values) } }, 'architect-readback');
row('saveFormRecordValues (15 required)', save.data?.completion?.requiredMissing?.length === 0,
  `${iso()} filled=${save.data?.completion?.fieldsFilled}/${save.data?.completion?.fieldsTotal} requiredMissing=${JSON.stringify(save.data?.completion?.requiredMissing)}`);

// ── 3. exportFormRecordPdf (in_progress record — REC-7 "any record") ────────
const exp1 = await invoke('exportFormRecordPdf', { recordId }, 'architect-readback');
row('exportFormRecordPdf returns presigned url', typeof exp1.data?.url === 'string' && !!exp1.data?.expiresAt,
  `${iso()} expiresAt=${exp1.data?.expiresAt}`);

const pdfRes = await fetch(exp1.data.url);
const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
const magic = new TextDecoder().decode(pdfBytes.slice(0, 5));
row('presigned URL serves a real PDF', pdfRes.status === 200 && magic === '%PDF-',
  `${iso()} http=${pdfRes.status} magic=${magic} bytes=${pdfBytes.length}`);

// ── 4. negative: random UUID → RECORD_NOT_FOUND (RLS + honest error) ────────
const expNeg = await invoke('exportFormRecordPdf', { recordId: 'deadbeef-0000-4000-8000-000000000000' }, 'architect-readback');
row('export of unknown record → RECORD_NOT_FOUND', expNeg.error?.includes('RECORD_NOT_FOUND'), `${iso()} err=${expNeg.error}`);

// ── 5. submit (completed_by = architect-readback) ────────────────────────────
const submit = await invoke('submitFormRecord', { input: { recordId } }, 'architect-readback');
row('submitFormRecord → COMPLETE', submit.data?.status === 'COMPLETE', `${iso()} status=${submit.data?.status}`);

// ── 6. SoD negative LIVE: same actor approve → SOD_VIOLATION ────────────────
const sodNeg = await invoke('approveFormRecord', { input: { recordId } }, 'architect-readback');
row('same-actor approve → SOD_VIOLATION (live)', sodNeg.error?.includes('SOD_VIOLATION'), `${iso()} err=${sodNeg.error}`);

// ── 7. approve as DIFFERENT actor → seal ─────────────────────────────────────
const approve = await invoke('approveFormRecord', { input: { recordId } }, 'architect-readback-2');
row('approveFormRecord (second identity) → APPROVED', approve.data?.status === 'APPROVED', `${iso()} status=${approve.data?.status}`);

// ── 8. DB truth: pointer row + retention parity ──────────────────────────────
const rec = await sql(`SELECT status, m4_record_id FROM forms.records WHERE id = '${recordId}'`);
row('forms.records.m4_record_id stamped', rec[0]?.status === 'approved' && !!rec[0]?.m4_record_id,
  `${iso()} status=${rec[0]?.status} m4_record_id=${rec[0]?.m4_record_id}`);

const m4 = await sql(`SELECT standard, record_type, source_module, retention_class, retain_until, object_lock_until, s3_object_ref FROM m4.records WHERE id = '${rec[0].m4_record_id}'`);
row('m4.records pointer row (ACC-7 columns written)',
  m4[0]?.record_type === 'form_record' && m4[0]?.retain_until !== null && m4[0]?.retain_until === m4[0]?.object_lock_until,
  `${iso()} ${JSON.stringify(m4[0])}`);

const pol = await sql(`SELECT record_type, retention_years, disposition_rule FROM m4.retention_policies WHERE tenant_id = '${T}' AND record_type = 'form_record'`);
row('form_record retention policy row (default seeded)', pol[0]?.retention_years >= 1, `${iso()} ${JSON.stringify(pol[0])}`);

// ── 9. S3 Object-Lock truth: retention on the sealed object == m4 row ───────
const sealedKey = m4[0].s3_object_ref.replace(`s3://${EVIDENCE_BUCKET}/`, '');
const retention = await s3.send(new GetObjectRetentionCommand({ Bucket: EVIDENCE_BUCKET, Key: sealedKey }));
const head = await s3.send(new HeadObjectCommand({ Bucket: EVIDENCE_BUCKET, Key: sealedKey }));
const s3Ms = new Date(retention.Retention.RetainUntilDate).getTime();
const dbMs = new Date(m4[0].retain_until.replace(' ', 'T') + (m4[0].retain_until.includes('+') ? '' : 'Z')).getTime();
row('S3 Object-Lock retention == m4.retain_until (to the ms)',
  retention.Retention.Mode === 'GOVERNANCE' && s3Ms === dbMs,
  `${iso()} mode=${retention.Retention.Mode} s3=${retention.Retention.RetainUntilDate.toISOString?.() ?? retention.Retention.RetainUntilDate} db=${m4[0].retain_until} sealedBytes=${head.ContentLength} type=${head.ContentType}`);

// ── 10. immutability: approved record rejects writes ─────────────────────────
const immut = await invoke('saveFormRecordValues', { input: { recordId, values: JSON.stringify({ attendees: 'tamper' }) } }, 'architect-readback');
row('approved record is immutable (RECORD_IMMUTABLE)', immut.error?.includes('RECORD_IMMUTABLE'), `${iso()} err=${immut.error}`);

console.log(`\nPURGE: forms.records ${recordId} (+values), m4.records ${rec[0].m4_record_id}, retention policy row, s3://${EVIDENCE_BUCKET}/${sealedKey} (GOVERNANCE-locked), GeneralBucket records/${recordId}.json + pdf/${recordId}-*.pdf, AUDITLOG partition items`);
printAndExit(0);
