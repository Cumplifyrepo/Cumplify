/**
 * IAM-signed publishGenerationEvent → AppSync (spec 40, design §4.5, GEN-5).
 *
 * This is the FIRST real Lambda→AppSync IAM publisher in the codebase — the
 * @aws_iam None-DS mutation fans out to onGenerationProgress subscribers.
 * SigV4 for service 'appsync', same signing core as the AOSS client
 * (NodeSha256 reused — REV-10 lesson: two signing implementations = drift).
 *
 * Best-effort by design: progress streaming failing must never fail the
 * section work — the audit trail is the durable record, the subscription is
 * UX. Failures are logged loudly and swallowed.
 */

import { SignatureV4 } from '@smithy/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Logger } from '@aws-lambda-powertools/logger';
import { NodeSha256 } from '../../agents/shared/aoss-signed-client.js';

const logger = new Logger({ serviceName: 'qms-generation-publish' });

const APPSYNC_URL = process.env.APPSYNC_URL!;
const REGION = process.env.AWS_REGION ?? 'us-east-1';

const MUTATION = `mutation PublishGenerationEvent($input: PublishGenerationEventInput!) {
  publishGenerationEvent(input: $input) { runId tenantId type harmonizationKey kind summary }
}`;

export interface GenerationEventInput {
  runId: string;
  tenantId: string;
  type: 'section_started' | 'section_complete' | 'section_failed' | 'run_complete';
  harmonizationKey?: string;
  kind?: 'PROSE' | 'GAP' | 'NA_JUSTIFIED' | 'FAILED' | 'PENDING';
  summary?: string; // AWSJSON — JSON string
}

let signer: SignatureV4 | null = null;
function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({
      service: 'appsync',
      region: REGION,
      credentials: defaultProvider(),
      sha256: NodeSha256,
    });
  }
  return signer;
}

/** Exported for testing. */
export function resetSigner(): void { signer = null; }

export async function publishGenerationEvent(input: GenerationEventInput): Promise<void> {
  try {
    const url = new URL(APPSYNC_URL);
    const body = JSON.stringify({ query: MUTATION, variables: { input } });

    // Plain request-shaped literal — same approach as signedAossFetch (no
    // @smithy/protocol-http dependency in the repo).
    const request = {
      method: 'POST',
      protocol: 'https:',
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        host: url.hostname,
        'content-type': 'application/json',
      } as Record<string, string>,
      body,
    };

    const signed = await getSigner().sign(request);
    const response = await fetch(APPSYNC_URL, {
      method: 'POST',
      headers: signed.headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    const payload = await response.json() as { errors?: Array<{ message: string }> };
    if (!response.ok || payload.errors?.length) {
      logger.error('publishGenerationEvent rejected', {
        status: response.status,
        errors: payload.errors,
        type: input.type,
        runId: input.runId,
      });
    }
  } catch (err) {
    // Best-effort: never fail section work over progress streaming
    logger.error('publishGenerationEvent failed', {
      error: (err as Error).message,
      type: input.type,
      runId: input.runId,
    });
  }
}
