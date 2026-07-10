/**
 * Shared SigV4-signing HTTP client for AOSS data-plane requests.
 *
 * Extracted from aoss-apply-template.ts (Task 12) so the apply-template
 * custom resource, the retrieval wrapper, and the Task-12 prover share ONE
 * signing implementation (REV-10 lesson: two implementations = drift).
 * AOSS data-plane requires SigV4 for service 'aoss' with x-amz-content-sha256
 * (applyChecksum: true).
 *
 * Closes the Task-11 live carry: retrieval.ts's default client was a bare
 * fetch — every AOSS query from a deployed handler 403'd.
 */

import { createHash, createHmac } from 'node:crypto';
import { SignatureV4 } from '@smithy/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/** Minimal Sha256 HashConstructor over node:crypto (no @aws-crypto dep in repo). */
type SourceData = string | ArrayBuffer | ArrayBufferView;

function toBuffer(data: SourceData): Buffer {
  if (typeof data === 'string') return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

export class NodeSha256 {
  private hash: ReturnType<typeof createHash> | ReturnType<typeof createHmac>;
  constructor(secret?: SourceData) {
    this.hash = secret !== undefined ? createHmac('sha256', toBuffer(secret)) : createHash('sha256');
  }
  update(data: SourceData): void {
    this.hash.update(toBuffer(data));
  }
  async digest(): Promise<Uint8Array> {
    return new Uint8Array(this.hash.digest());
  }
  reset(): void {
    this.hash = createHash('sha256');
  }
}

export type AossHttpMethod = 'GET' | 'PUT' | 'POST' | 'DELETE';

export interface SignedResponse {
  status: number;
  body: string;
}

/** Singleton signer (cold-cached per Lambda). */
let signer: SignatureV4 | null = null;

function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({
      service: 'aoss',
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials: defaultProvider(),
      sha256: NodeSha256,
      applyChecksum: true, // AOSS requires x-amz-content-sha256
    });
  }
  return signer;
}

/** Reset signer (for testing). */
export function resetSigner(): void {
  signer = null;
}

/**
 * SigV4-signed fetch against an AOSS collection endpoint.
 * `endpoint` is the collection URL (https://xxx.us-east-1.aoss.amazonaws.com);
 * `path` starts with '/'.
 */
export async function signedAossFetch(
  method: AossHttpMethod,
  endpoint: string,
  path: string,
  body?: string,
  timeoutMs = 20_000,
): Promise<SignedResponse> {
  const url = new URL(endpoint);
  const request = {
    method,
    protocol: 'https:',
    hostname: url.hostname,
    path,
    headers: {
      host: url.hostname,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    } as Record<string, string>,
    ...(body !== undefined ? { body } : {}),
  };
  const signed = await getSigner().sign(request);
  const resp = await fetch(`https://${url.hostname}${path}`, {
    method,
    headers: signed.headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: resp.status, body: await resp.text() };
}
