import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { Logger } from '@aws-lambda-powertools/logger';
import { ulid } from 'ulid';
import type { CumplifyEvent } from './types.js';

const client = new EventBridgeClient({});
const logger = new Logger({ serviceName: 'eventing-publisher' });

export interface PublishOptions {
  busName: string;
  /** Source identifier, e.g. 'cumplify.m2.capa' */
  source: string;
  /** Domain.Action event name, e.g. 'CAPA.Opened' */
  detailType: string;
  /** The event envelope (eventId auto-generated if absent) */
  event: CumplifyEvent;
}

/**
 * Publishes a domain event to the cumplify-events bus.
 * Returns the eventId (generated if not provided).
 */
export async function publish(opts: PublishOptions): Promise<string> {
  const event: CumplifyEvent = {
    ...opts.event,
    eventId: opts.event.eventId || ulid(),
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
