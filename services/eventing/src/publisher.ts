import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { Logger } from '@aws-lambda-powertools/logger';
import { ulid } from 'ulid';
import type { CumplifyEvent } from './types.js';
import { AUDIT_TRAIL_REGISTRY } from './audit-trail-registry.js';

const client = new EventBridgeClient({});
const logger = new Logger({ serviceName: 'eventing-publisher' });

export interface PublishOptions {
  busName: string;
  /** Source identifier, e.g. 'cumplify.m2.capa' */
  source: string;
  /** Domain.Action event name, e.g. 'CAPA.Opened' */
  detailType: string;
  /** The event envelope (eventId auto-generated if absent) */
  event: Omit<CumplifyEvent, 'auditTrail' | 'eventId'> & { eventId?: string };
}

/**
 * Publishes a domain event to the cumplify-events bus.
 * Stamps auditTrail from the registry. Throws on unregistered detailType.
 * Returns the eventId (generated if not provided).
 */
export async function publish(opts: PublishOptions): Promise<string> {
  const auditTrail = AUDIT_TRAIL_REGISTRY[opts.detailType];
  if (auditTrail === undefined) {
    throw new Error(
      `Unregistered detailType: '${opts.detailType}'. ` +
        'Register in contracts/events.md and audit-trail-registry.ts before publishing.',
    );
  }

  const event: CumplifyEvent = {
    ...opts.event,
    eventId: opts.event.eventId || ulid(),
    auditTrail,
  };

  const cmd = new PutEventsCommand({
    Entries: [
      {
        EventBusName: opts.busName,
        Source: opts.source,
        DetailType: opts.detailType,
        Detail: JSON.stringify(event),
      },
    ],
  });

  const result = await client.send(cmd);

  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    const errorMsg = result.Entries?.[0]?.ErrorMessage ?? 'Unknown error';
    logger.error('PutEvents partial failure', {
      detailType: opts.detailType,
      eventId: event.eventId,
      errorMsg,
    });
    throw new Error(`PutEvents failed: ${errorMsg}`);
  }

  logger.info('Event published', {
    detailType: opts.detailType,
    tenantId: event.tenantId,
    eventId: event.eventId,
  });

  return event.eventId;
}
