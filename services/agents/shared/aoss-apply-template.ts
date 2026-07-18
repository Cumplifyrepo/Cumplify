/**
 * AOSS apply-template Lambda — Task 9 custom resource (T3E-F1 part 2, architect-executed).
 *
 * PUTs the committed index template (services/agents/shared/aoss-index-template.json,
 * inlined at bundle time — T3E-F2 pattern) to each AOSS collection endpoint, then
 * GET-verifies it: knn_vector dimension MUST be 1024 and metadata.tenantId MUST be
 * type=keyword. FAIL-CLOSED: any collection failing apply or verify fails the whole
 * invocation (and therefore the CloudFormation custom resource).
 *
 * MUST complete before any document seeding (Task 12 GETs the template first and
 * aborts if absent — the fail-closed pair to this writer).
 *
 * Runs VPC-attached (AOSS network policy allows the VPC endpoint only).
 * Requests are SigV4-signed for service 'aoss' (data-plane requirement).
 * Retries cover data-access-policy propagation + collection activation delays.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { signedAossFetch } from './aoss-signed-client.js';

import templateRaw from './aoss-index-template.json' with { type: 'json' };

const logger = new Logger({ serviceName: 'aoss-apply-template' });

const TEMPLATE_NAME = 'cumplify-kb-template';
/** JSON array: [{ "name": "cumplify-iso-kb", "endpoint": "https://xxx.us-east-1.aoss.amazonaws.com" }, ...] */
const COLLECTIONS: Array<{ name: string; endpoint: string }> = JSON.parse(
  process.env.COLLECTIONS ?? '[]',
);

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;

function retryable(status: number): boolean {
  // 403: data-access policy still propagating; 404/0: endpoint DNS/activation; 5xx/429: transient
  return status === 403 || status === 404 || status === 429 || status >= 500;
}

async function withRetry(
  label: string,
  fn: () => Promise<{ status: number; body: string }>,
  okStatuses: number[],
): Promise<{ status: number; body: string }> {
  let last: { status: number; body: string } | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      last = await fn();
      if (okStatuses.includes(last.status)) return last;
      if (!retryable(last.status)) break;
      logger.warn('Retryable response', { label, attempt, status: last.status });
    } catch (err) {
      logger.warn('Request error, retrying', { label, attempt, error: (err as Error).message });
      last = { status: 0, body: (err as Error).message };
    }
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(
    `${label} FAILED after ${MAX_ATTEMPTS} attempts: HTTP ${last?.status} — ${last?.body?.slice(0, 500)}`,
  );
}

export interface VerifyResult {
  collection: string;
  dimension: number;
  tenantIdType: string;
}

/**
 * GET the template back and fail-closed on any mapping drift.
 * Exported for the Task-12 prover — seeding MUST run this check first and
 * abort if the template is absent/wrong (never index against auto-mapping).
 */
export async function verifyTemplate(name: string, endpoint: string): Promise<VerifyResult> {
  const resp = await withRetry(
    `verify:${name}`,
    () => signedAossFetch('GET', endpoint, `/_index_template/${TEMPLATE_NAME}`),
    [200],
  );
  const parsed = JSON.parse(resp.body);
  const tpl = parsed.index_templates?.[0]?.index_template;
  const props = tpl?.template?.mappings?.properties;
  const dimension = props?.embedding?.dimension;
  const tenantIdType = props?.metadata?.properties?.tenantId?.type;
  const langType = props?.metadata?.properties?.lang?.type;
  if (dimension !== 1024) {
    throw new Error(`FAIL-CLOSED ${name}: embedding.dimension=${dimension}, expected 1024`);
  }
  if (tenantIdType !== 'keyword') {
    throw new Error(
      `FAIL-CLOSED ${name}: metadata.tenantId.type=${tenantIdType}, expected keyword`,
    );
  }
  if (langType !== 'keyword') {
    throw new Error(`FAIL-CLOSED ${name}: metadata.lang.type=${langType}, expected keyword`);
  }
  return { collection: name, dimension, tenantIdType };
}

export async function handler(event: { action: string }): Promise<{
  status: string;
  applied: string[];
  verified: VerifyResult[];
}> {
  if (COLLECTIONS.length === 0) {
    throw new Error('COLLECTIONS env is empty — nothing to apply (fail-closed)');
  }

  const applied: string[] = [];
  const verified: VerifyResult[] = [];
  const templateBody = JSON.stringify(templateRaw);

  for (const { name, endpoint } of COLLECTIONS) {
    if (event.action !== 'verify') {
      const put = await withRetry(
        `apply:${name}`,
        () => signedAossFetch('PUT', endpoint, `/_index_template/${TEMPLATE_NAME}`, templateBody),
        [200],
      );
      logger.info('Template applied', { collection: name, status: put.status });
      applied.push(name);
    }
    verified.push(await verifyTemplate(name, endpoint));
    logger.info('Template verified', { collection: name });
  }

  return { status: 'success', applied, verified };
}
