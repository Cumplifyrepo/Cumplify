/**
 * Unit tests for AOSS retry wrapper — FIX-P12-2.
 * Verifies: 403→200 recovery, per-operation 404 semantics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const signedFetchMock = vi.fn();

vi.mock('../../agents/shared/aoss-signed-client.js', () => ({
  signedAossFetch: (...args: unknown[]) => signedFetchMock(...args),
}));

const { aossWriteOp, aossReadOp, aossDeleteOp } = await import('../src/aoss-retry.js');

beforeEach(() => {
  signedFetchMock.mockReset();
});

describe('aossWriteOp — write-path retry (FIX-P12-2)', () => {
  it('retries 403 (policy propagation) then succeeds on 200', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 403, body: 'Access denied' })
      .mockResolvedValueOnce({ status: 403, body: 'Access denied' })
      .mockResolvedValueOnce({ status: 200, body: '{"_id":"ok"}' });

    const result = await aossWriteOp('test:write', 'PUT', 'https://ep', '/idx/_doc/1', '{}');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries 404 (index activation delay) then succeeds on 201', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 404, body: 'index_not_found' })
      .mockResolvedValueOnce({ status: 201, body: '{"_id":"ok"}' });

    const result = await aossWriteOp('test:write', 'PUT', 'https://ep', '/idx/_doc/2', '{}');
    expect(result.status).toBe(201);
    expect(signedFetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 (throttling) then succeeds', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 429, body: 'Throttled' })
      .mockResolvedValueOnce({ status: 200, body: '{}' });

    const result = await aossWriteOp('test:write', 'PUT', 'https://ep', '/idx', '{}');
    expect(result.status).toBe(200);
  });

  it('retries 500 (transient) then succeeds', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 500, body: 'Internal error' })
      .mockResolvedValueOnce({ status: 200, body: '{}' });

    const result = await aossWriteOp('test:write', 'PUT', 'https://ep', '/idx', '{}');
    expect(result.status).toBe(200);
  });

  it('does NOT retry non-retryable status (e.g., 400 bad request)', async () => {
    signedFetchMock.mockResolvedValueOnce({ status: 400, body: 'Bad request' });

    await expect(
      aossWriteOp('test:write', 'PUT', 'https://ep', '/idx/_doc/1', '{}'),
    ).rejects.toThrow(/FAILED after/);
    expect(signedFetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transport errors (network failures)', async () => {
    signedFetchMock
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ status: 200, body: '{}' });

    const result = await aossWriteOp('test:write', 'PUT', 'https://ep', '/idx', '{}');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('aossReadOp — read-path 404 semantics (FIX-P12-2)', () => {
  it('404 is returned immediately as success (not retried)', async () => {
    signedFetchMock.mockResolvedValueOnce({ status: 404, body: '{}' });

    const result = await aossReadOp('test:read', 'GET', 'https://ep', '/idx/_doc/meta');
    expect(result.status).toBe(404);
    expect(signedFetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('200 returned immediately', async () => {
    signedFetchMock.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ _source: { contentHash: 'abc' } }),
    });

    const result = await aossReadOp('test:read', 'GET', 'https://ep', '/idx/_doc/meta');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 403 (propagation) on read path', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 403, body: 'Denied' })
      .mockResolvedValueOnce({ status: 200, body: '{"_source":{}}' });

    const result = await aossReadOp('test:read', 'GET', 'https://ep', '/idx/_doc/meta');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('aossDeleteOp — delete-path 404 semantics (FIX-P12-2)', () => {
  it('404 is returned immediately as success (index already absent)', async () => {
    signedFetchMock.mockResolvedValueOnce({ status: 404, body: 'index_not_found' });

    const result = await aossDeleteOp('test:delete', 'https://ep', '/idx');
    expect(result.status).toBe(404);
    expect(signedFetchMock).toHaveBeenCalledTimes(1); // no retry
  });

  it('200 is returned immediately (index deleted)', async () => {
    signedFetchMock.mockResolvedValueOnce({ status: 200, body: '{"acknowledged":true}' });

    const result = await aossDeleteOp('test:delete', 'https://ep', '/idx');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 403 on delete path then succeeds', async () => {
    signedFetchMock
      .mockResolvedValueOnce({ status: 403, body: 'Denied' })
      .mockResolvedValueOnce({ status: 200, body: '{"acknowledged":true}' });

    const result = await aossDeleteOp('test:delete', 'https://ep', '/idx');
    expect(result.status).toBe(200);
    expect(signedFetchMock).toHaveBeenCalledTimes(2);
  });
});
