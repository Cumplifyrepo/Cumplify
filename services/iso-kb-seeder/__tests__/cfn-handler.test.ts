/**
 * Unit tests for CFN custom resource handler (FIX-P12-3).
 * Verifies: SUCCESS/FAILED response shapes, Delete no-op, response always sent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the seed function
const seedMock = vi.fn();
vi.mock('../src/handler.js', () => ({
  seed: () => seedMock(),
}));

// Mock https for cfn-response capture
const httpRequestMock = vi.fn();
vi.mock('node:https', () => ({
  default: {
    request: (...args: unknown[]) => httpRequestMock(...args),
  },
}));

const { handler } = await import('../src/cfn-handler.js');

function makeCfnEvent(requestType: 'Create' | 'Update' | 'Delete') {
  return {
    RequestType: requestType,
    ResponseURL: 'https://cfn-response-bucket.s3.amazonaws.com/some-presigned-url',
    StackId: 'arn:aws:cloudformation:us-east-1:123:stack/test/guid',
    RequestId: 'req-123',
    ResourceType: 'Custom::IsoKbSeed',
    LogicalResourceId: 'IsoKbSeederTrigger',
    PhysicalResourceId: 'iso-kb-seed-prev',
    ResourceProperties: { SourceHash: 'abc123', ServiceToken: 'arn:lambda:...' },
  };
}

let capturedResponses: Array<Record<string, unknown>> = [];

beforeEach(() => {
  seedMock.mockReset();
  httpRequestMock.mockReset();
  capturedResponses = [];

  // Capture the cfn-response body
  httpRequestMock.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
    const req = {
      on: vi.fn(),
      write: (body: string) => {
        capturedResponses.push(JSON.parse(body));
      },
      end: () => {
        callback({ statusCode: 200 });
      },
    };
    return req;
  });
});

describe('cfn-handler — CFN protocol (FIX-P12-3)', () => {
  it('Create: seed SUCCESS → cfn-response SUCCESS with Data', async () => {
    seedMock.mockResolvedValue({
      status: 'seeded',
      contentHash: 'deadbeef1234567890abcdef',
      chunksTotal: 109,
      chunksIndexed: 109,
      durationMs: 25000,
    });

    await handler(makeCfnEvent('Create'));

    expect(capturedResponses).toHaveLength(1);
    const resp = capturedResponses[0];
    expect(resp.Status).toBe('SUCCESS');
    expect(resp.Data).toEqual({
      ContentHash: 'deadbeef1234567890abcdef',
      ChunksIndexed: 109,
      Status: 'seeded',
    });
    expect(resp.PhysicalResourceId).toContain('iso-kb-seed-deadbeef1234');
  });

  it('Update: seed SUCCESS (skipped) → cfn-response SUCCESS', async () => {
    seedMock.mockResolvedValue({
      status: 'skipped',
      contentHash: 'cafebabe00000000',
      chunksTotal: 109,
    });

    await handler(makeCfnEvent('Update'));

    expect(capturedResponses).toHaveLength(1);
    const resp = capturedResponses[0];
    expect(resp.Status).toBe('SUCCESS');
    expect(resp.Data).toEqual({
      ContentHash: 'cafebabe00000000',
      ChunksIndexed: 0,
      Status: 'skipped',
    });
  });

  it('Create: seed FAILS → cfn-response FAILED with reason', async () => {
    seedMock.mockRejectedValue(new Error('FAIL-CLOSED: template absent'));

    await handler(makeCfnEvent('Create'));

    expect(capturedResponses).toHaveLength(1);
    const resp = capturedResponses[0];
    expect(resp.Status).toBe('FAILED');
    expect(resp.Reason).toContain('FAIL-CLOSED: template absent');
    expect(resp.PhysicalResourceId).toBe('iso-kb-seed-prev');
  });

  it('Delete: no-op SUCCESS (does NOT call seed)', async () => {
    await handler(makeCfnEvent('Delete'));

    expect(seedMock).not.toHaveBeenCalled();
    expect(capturedResponses).toHaveLength(1);
    const resp = capturedResponses[0];
    expect(resp.Status).toBe('SUCCESS');
  });

  it('response always sent even on unexpected error', async () => {
    seedMock.mockRejectedValue(new Error('Unexpected kaboom'));

    await handler(makeCfnEvent('Create'));

    expect(capturedResponses).toHaveLength(1);
    expect(capturedResponses[0].Status).toBe('FAILED');
    expect(capturedResponses[0].Reason).toContain('Unexpected kaboom');
  });
});
