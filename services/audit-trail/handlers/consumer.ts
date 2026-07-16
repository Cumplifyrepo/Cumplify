/**
 * Audit-sink consumer Lambda handler.
 * ESM on spec 2's audit-sink FIFO queue → appendAuditEvent.
 *
 * Uses createFifoHandler (REV-3): fail-forward-all on first transient error.
 * FIX-1: ReplayDetectedError = idempotent success (dedup marker collision).
 * REV-2: ItemSizeExceededError = poison → DLQ.
 */

import { createFifoHandler, PoisonMessageError } from '../../eventing/src/consumer.js';
import { appendAuditEvent, ItemSizeExceededError } from '../src/appender.js';
import type { CumplifyEvent } from '../../eventing/src/types.js';

const DLQ_URL = process.env.AUDIT_SINK_DLQ_URL!;

const businessLogic = async (event: CumplifyEvent, detailType: string): Promise<void> => {
  try {
    await appendAuditEvent(
      {
        tenantId: event.tenantId,
        eventId: event.eventId,
        timestamp: event.timestamp,
        actor: event.actor,
        module: event.module,
        clauseRef: event.clauseRef,
        standard: event.standard,
        entityId: event.entityId,
        payload: event.payload as Record<string, unknown>,
      },
      detailType,
    );
  } catch (err: unknown) {
    if (err instanceof ItemSizeExceededError) {
      throw new PoisonMessageError(err.message);
    }
    throw err;
  }
};

export const handler = createFifoHandler({
  fifo: true,
  dlqUrl: DLQ_URL,
  handler: businessLogic,
  idempotentErrors: ['ReplayDetectedError'],
});
