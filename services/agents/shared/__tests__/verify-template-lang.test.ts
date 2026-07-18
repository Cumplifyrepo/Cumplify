/**
 * Unit test: verifyTemplate() fails-closed on missing/wrong metadata.lang.
 * Spec: iso-kb-seeding Task 1 — index template lang field validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const signedFetchMock = vi.fn();

vi.mock('../aoss-signed-client.js', () => ({
  signedAossFetch: (...args: unknown[]) => signedFetchMock(...args),
}));

const { verifyTemplate } = await import('../aoss-apply-template.js');

function buildTemplateResponse(metadataProps: Record<string, { type: string }>) {
  return {
    status: 200,
    body: JSON.stringify({
      index_templates: [
        {
          index_template: {
            template: {
              mappings: {
                properties: {
                  embedding: { type: 'knn_vector', dimension: 1024 },
                  metadata: { properties: metadataProps },
                },
              },
            },
          },
        },
      ],
    }),
  };
}

beforeEach(() => {
  signedFetchMock.mockReset();
});

describe('verifyTemplate — metadata.lang validation (iso-kb-seeding Task 1)', () => {
  it('passes when metadata.lang is keyword', async () => {
    signedFetchMock.mockResolvedValue(
      buildTemplateResponse({
        tenantId: { type: 'keyword' },
        lang: { type: 'keyword' },
      }),
    );

    const result = await verifyTemplate('cumplify-iso-kb', 'https://test.aoss.amazonaws.com');
    expect(result.dimension).toBe(1024);
    expect(result.tenantIdType).toBe('keyword');
  });

  it('FAIL-CLOSED when metadata.lang is missing', async () => {
    signedFetchMock.mockResolvedValue(
      buildTemplateResponse({
        tenantId: { type: 'keyword' },
        // lang field absent
      }),
    );

    await expect(
      verifyTemplate('cumplify-iso-kb', 'https://test.aoss.amazonaws.com'),
    ).rejects.toThrow(/FAIL-CLOSED.*metadata\.lang\.type=undefined.*expected keyword/);
  });

  it('FAIL-CLOSED when metadata.lang is wrong type (text instead of keyword)', async () => {
    signedFetchMock.mockResolvedValue(
      buildTemplateResponse({
        tenantId: { type: 'keyword' },
        lang: { type: 'text' },
      }),
    );

    await expect(
      verifyTemplate('cumplify-iso-kb', 'https://test.aoss.amazonaws.com'),
    ).rejects.toThrow(/FAIL-CLOSED.*metadata\.lang\.type=text.*expected keyword/);
  });

  it('still FAIL-CLOSED when dimension is wrong (regardless of lang)', async () => {
    signedFetchMock.mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        index_templates: [
          {
            index_template: {
              template: {
                mappings: {
                  properties: {
                    embedding: { type: 'knn_vector', dimension: 768 },
                    metadata: {
                      properties: {
                        tenantId: { type: 'keyword' },
                        lang: { type: 'keyword' },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      }),
    });

    await expect(
      verifyTemplate('cumplify-iso-kb', 'https://test.aoss.amazonaws.com'),
    ).rejects.toThrow(/FAIL-CLOSED.*embedding\.dimension=768.*expected 1024/);
  });
});
