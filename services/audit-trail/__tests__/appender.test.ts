import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, QueryCommand, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import { appendAuditEvent, ItemSizeExceededError, ReplayDetectedError } from '../src/appender.js';
import { computePayloadHash, GENESIS_HASH } from '../src/hash-chain.js';

const ddbMock = mockClient(DynamoDBClient);

// Set required env
process.env.TABLE_NAME = 'CumplifyCore';

const baseInput = {
  tenantId: 'tenant-001',
  eventId: '01J000000000000000000001',
  timestamp: '2026-07-04T12:00:00.000Z',
  actor: 'user-sub-123',
  module: 'M2',
  clauseRef: 'ISO 9001 10.2',
  standard: 'ISO9001' as const,
  payload: { before: { status: 'open' }, after: { status: 'closed' } },
};

beforeEach(() => {
  ddbMock.reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-04T14:00:00.000Z'));
});

describe('appendAuditEvent', () => {
  describe('hash chain computation', () => {
    it('uses GENESIS prevHash when partition is empty (first event)', async () => {
      // No existing items
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(baseInput, 'CAPA.Closed');

      expect(result.prevHash).toBe(GENESIS_HASH);
      expect(result.pk).toBe('TENANT#tenant-001#AUDITLOG');
    });

    it('computes prevHash from predecessor PK+SK+payloadHash', async () => {
      const prevItem = {
        PK: { S: 'TENANT#tenant-001#AUDITLOG' },
        SK: { S: 'EVENT#2026-07-04T13:00:00.000Z#01J000000000000000000000' },
        payloadHash: { S: 'abc123' },
      };
      ddbMock.on(QueryCommand).resolves({ Items: [prevItem] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(baseInput, 'CAPA.Closed');

      // prevHash should NOT be GENESIS
      expect(result.prevHash).not.toBe(GENESIS_HASH);
      expect(result.prevHash).toHaveLength(64); // SHA-256 hex
    });

    it('computes payloadHash from {before, after}', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(baseInput, 'CAPA.Closed');

      const expectedHash = computePayloadHash(baseInput.payload);
      expect(result.payloadHash).toBe(expectedHash);
    });
  });

  describe('monotonicity enforcement (REV-1)', () => {
    it('derives SK from latest +1ms when append time <= latest SK timestamp', async () => {
      // Latest SK has a timestamp AFTER our fake clock
      const futureTs = '2026-07-04T15:00:00.000Z'; // 1 hour ahead of our 14:00
      const prevItem = {
        PK: { S: 'TENANT#tenant-001#AUDITLOG' },
        SK: { S: `EVENT#${futureTs}#01J000000000000000000000` },
        payloadHash: { S: 'abc' },
      };
      ddbMock.on(QueryCommand).resolves({ Items: [prevItem] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(baseInput, 'CAPA.Closed');

      // SK should be AFTER the latest (futureTs + 1ms)
      const skTs = result.sk.split('#')[1];
      expect(skTs > futureTs).toBe(true);
    });

    it('uses current time when append time > latest SK timestamp', async () => {
      const pastTs = '2026-07-04T10:00:00.000Z'; // 4 hours before our 14:00
      const prevItem = {
        PK: { S: 'TENANT#tenant-001#AUDITLOG' },
        SK: { S: `EVENT#${pastTs}#01J000000000000000000000` },
        payloadHash: { S: 'abc' },
      };
      ddbMock.on(QueryCommand).resolves({ Items: [prevItem] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(baseInput, 'CAPA.Closed');

      const skTs = result.sk.split('#')[1];
      // Should use our clock time (2026-07-04T14:00:00.000Z)
      expect(skTs).toBe('2026-07-04T14:00:00.000Z');
    });
  });

  describe('entityId + GSI1 stamping (sparse index)', () => {
    const writtenItem = () => {
      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      expect(calls.length).toBeGreaterThan(0);
      const put = calls[0].args[0].input.TransactItems![0].Put!;
      return put.Item as Record<string, { S?: string }>;
    };

    it('stamps entityId + GSI1PK/GSI1SK when entityId is provided', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const result = await appendAuditEvent(
        { ...baseInput, entityId: 'row-uuid-42' },
        'CAPA.Closed',
      );

      const item = writtenItem();
      expect(item.entityId?.S).toBe('row-uuid-42');
      expect(item.GSI1PK?.S).toBe('TENANT#tenant-001#ENTITY#row-uuid-42');
      // GSI1SK mirrors SK so per-entity order matches partition order
      expect(item.GSI1SK?.S).toBe(result.sk);
      // Leading TENANT#<id># satisfies the tenant-data role LeadingKeys condition
      expect(item.GSI1PK!.S!.startsWith('TENANT#tenant-001#')).toBe(true);
    });

    it('omits ALL GSI attributes when entityId is absent (sparse)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      const item = writtenItem();
      expect(item.entityId).toBeUndefined();
      expect(item.GSI1PK).toBeUndefined();
      expect(item.GSI1SK).toBeUndefined();
    });

    it('treats empty-string entityId as no entity (no GSI attributes)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent({ ...baseInput, entityId: '' }, 'CAPA.Closed');

      const item = writtenItem();
      expect(item.entityId).toBeUndefined();
      expect(item.GSI1PK).toBeUndefined();
      expect(item.GSI1SK).toBeUndefined();
    });

    it('keeps GSI attributes OUT of the hash chain (payloadHash covers payload only)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const withEntity = await appendAuditEvent(
        { ...baseInput, entityId: 'row-uuid-42' },
        'CAPA.Closed',
      );

      // Identical payload with no entityId hashes identically — stamping is
      // metadata, never chain content.
      expect(withEntity.payloadHash).toBe(computePayloadHash(baseInput.payload));
    });
  });

  describe('400KB item size guard (REV-2)', () => {
    it('throws ItemSizeExceededError for oversized payload', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const hugePayload = {
        before: null,
        after: { data: 'x'.repeat(500 * 1024) }, // > 400KB
      };
      const bigInput = { ...baseInput, payload: hugePayload };

      await expect(appendAuditEvent(bigInput, 'CAPA.Closed')).rejects.toThrow(
        ItemSizeExceededError,
      );
    });

    it('does NOT throw for payloads under 400KB', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const smallPayload = { before: null, after: { data: 'small' } };
      const input = { ...baseInput, payload: smallPayload };

      await expect(appendAuditEvent(input, 'CAPA.Closed')).resolves.toBeDefined();
    });
  });

  describe('replay detection (FIX-1)', () => {
    it('throws ReplayDetectedError when dedup marker already exists', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      // Simulate transaction failure on dedup marker (index 1)
      const err = new Error('Transaction cancelled');
      err.name = 'TransactionCanceledException';
      (err as any).CancellationReasons = [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }];
      ddbMock.on(TransactWriteItemsCommand).rejects(err);

      await expect(appendAuditEvent(baseInput, 'CAPA.Closed')).rejects.toThrow(ReplayDetectedError);
    });

    it('throws ReplayDetectedError when chain item already exists', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const err = new Error('Transaction cancelled');
      err.name = 'TransactionCanceledException';
      (err as any).CancellationReasons = [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }];
      ddbMock.on(TransactWriteItemsCommand).rejects(err);

      await expect(appendAuditEvent(baseInput, 'CAPA.Closed')).rejects.toThrow(ReplayDetectedError);
    });

    it('rethrows non-conditional transaction failures', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const err = new Error('Transaction cancelled');
      err.name = 'TransactionCanceledException';
      (err as any).CancellationReasons = [{ Code: 'TransactionConflict' }, { Code: 'None' }];
      ddbMock.on(TransactWriteItemsCommand).rejects(err);

      await expect(appendAuditEvent(baseInput, 'CAPA.Closed')).rejects.toThrow(
        'Transaction cancelled',
      );
    });
  });

  describe('AUDITMETA registration (REV-7)', () => {
    it('writes AUDITMETA entry on first event (prevHash === GENESIS)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      // First TransactWrite = chain+dedup, Second = AUDITMETA
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      // Should have been called twice (chain+dedup, then AUDITMETA)
      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      expect(calls).toHaveLength(2);

      // Second call should be AUDITMETA
      const auditmetaCall = calls[1].args[0].input;
      const putItem = auditmetaCall.TransactItems![0].Put!.Item!;
      expect(putItem.PK.S).toBe('AUDITMETA');
      expect(putItem.SK.S).toBe('TENANT#tenant-001');
    });

    it('does NOT write AUDITMETA when partition already has items', async () => {
      const prevItem = {
        PK: { S: 'TENANT#tenant-001#AUDITLOG' },
        SK: { S: 'EVENT#2026-07-04T10:00:00.000Z#01J000000000000000000000' },
        payloadHash: { S: 'existing' },
      };
      ddbMock.on(QueryCommand).resolves({ Items: [prevItem] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      // Only one TransactWrite call (chain+dedup) — no AUDITMETA
      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      expect(calls).toHaveLength(1);
    });
  });

  describe('item schema', () => {
    it('includes itemType=AUDITLOG in the written item (FIX-4)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      const chainItem = calls[0].args[0].input.TransactItems![0].Put!.Item!;
      expect(chainItem.itemType.S).toBe('AUDITLOG');
    });

    it('stores eventTimestamp from envelope (REV-1)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      const chainItem = calls[0].args[0].input.TransactItems![0].Put!.Item!;
      expect(chainItem.eventTimestamp.S).toBe('2026-07-04T12:00:00.000Z');
    });

    it('stores full payload in the item (REV-2)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      const chainItem = calls[0].args[0].input.TransactItems![0].Put!.Item!;
      // payload is a Map type in DynamoDB marshalled format
      expect(chainItem.payload).toBeDefined();
      expect(chainItem.payload.M).toBeDefined();
    });

    it('includes docVersionHash when present in payload', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      const input = {
        ...baseInput,
        payload: { before: null, after: {}, docVersionHash: 'hash123' },
      };
      await appendAuditEvent(input, 'Document.Approved');

      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      const chainItem = calls[0].args[0].input.TransactItems![0].Put!.Item!;
      expect(chainItem.docVersionHash.S).toBe('hash123');
    });

    it('writes dedup marker with itemType=AUDITDEDUP (FIX-1)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteItemsCommand).resolves({});

      await appendAuditEvent(baseInput, 'CAPA.Closed');

      const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
      const dedupItem = calls[0].args[0].input.TransactItems![1].Put!.Item!;
      expect(dedupItem.PK.S).toBe('TENANT#tenant-001#AUDITDEDUP');
      expect(dedupItem.SK.S).toBe('EVENT#01J000000000000000000001');
      expect(dedupItem.itemType.S).toBe('AUDITDEDUP');
    });
  });
});
