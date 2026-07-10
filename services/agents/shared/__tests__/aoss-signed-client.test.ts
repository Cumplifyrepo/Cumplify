/**
 * Unit tests for the shared SigV4 AOSS client.
 * Defect class this pins (Task-11 live carry): unsigned requests to the AOSS
 * data plane → 403. Every outgoing request MUST carry a SigV4 Authorization
 * header for service 'aoss' plus x-amz-content-sha256.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signedAossFetch, resetSigner } from '../aoss-signed-client.js';
import { retrieve } from '../retrieval.js';

const ENDPOINT = 'https://abc123.us-east-1.aoss.amazonaws.com';

describe('signedAossFetch', () => {
  let capturedInit: RequestInit | undefined;
  let capturedUrl: string | undefined;

  beforeEach(() => {
    process.env.AWS_ACCESS_KEY_ID = 'AKIATESTTESTTESTTEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-test-secret-test-secret';
    process.env.AWS_REGION = 'us-east-1';
    resetSigner();
    capturedInit = undefined;
    capturedUrl = undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSigner();
  });

  it('signs requests: SigV4 Authorization for service aoss + content sha256', async () => {
    const resp = await signedAossFetch('POST', ENDPOINT, '/task12-idx/_search', '{"size":1}');
    expect(resp.status).toBe(200);

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization ?? headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers.authorization ?? headers.Authorization).toContain('/aoss/aws4_request');
    expect(headers['x-amz-content-sha256'] ?? headers['X-Amz-Content-Sha256']).toBeDefined();
    expect(capturedUrl).toBe(`${ENDPOINT}/task12-idx/_search`);
  });

  it('GET without body omits content-type but still signs', async () => {
    await signedAossFetch('GET', ENDPOINT, '/_index_template/cumplify-kb-template');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization ?? headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(capturedInit?.body).toBeUndefined();
  });

  it("retrieval's DEFAULT client signs its search requests (regression: bare fetch 403'd live)", async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ hits: { hits: [] } }), { status: 200 });
    }));

    // No injected httpClient → exercises defaultAossClient
    const result = await retrieve({
      tenantId: 'tenant-a',
      collectionEndpoint: ENDPOINT,
      indexName: 'task12-idx',
      queryText: '',
      queryVector: Array(1024).fill(0.01),
    });

    expect(result.chunks).toEqual([]);
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.authorization ?? headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(headers.authorization ?? headers.Authorization).toContain('/aoss/aws4_request');
    // Body still carries the mandatory tenant filter through the signed path
    expect(String(capturedInit?.body)).toContain('"metadata.tenantId":"tenant-a"');
  });

  it('default client surfaces non-2xx as statusCode-tagged errors (retryability contract)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"forbidden"}', { status: 403 })));

    await expect(
      retrieve({
        tenantId: 'tenant-a',
        collectionEndpoint: ENDPOINT,
        indexName: 'task12-idx',
        queryText: '',
        queryVector: Array(1024).fill(0.01),
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
