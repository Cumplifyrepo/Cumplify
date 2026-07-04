import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Logger } from '@aws-lambda-powertools/logger';

const sqsClient = new SQSClient({});
const logger = new Logger({ serviceName: 'fifo-router' });

// Queue URL map from environment variables
const QUEUE_MAP: Record<string, string | undefined> = {
  CAPA_INTAKE_QUEUE_URL: process.env.CAPA_INTAKE_QUEUE_URL,
  AUDIT_SINK_QUEUE_URL: process.env.AUDIT_SINK_QUEUE_URL,
};

interface RouterEvent {
  targetQueue: string; // env var key stamped by input transformer (D-3)
  detailType: string; // Domain.Action
  detail: {
    tenantId: string;
    eventId: string;
    [key: string]: unknown;
  };
}

export async function handler(event: RouterEvent): Promise<void> {
  const queueUrl = QUEUE_MAP[event.targetQueue];
  if (!queueUrl) {
    throw new Error(`Unknown or unconfigured targetQueue key: ${event.targetQueue}`);
  }

  // FIX-1: MessageBody = canonical queue-message contract {detailType, detail}
  const messageBody = JSON.stringify({
    detailType: event.detailType,
    detail: event.detail,
  });

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
      MessageGroupId: event.detail.tenantId,
      MessageDeduplicationId: event.detail.eventId,
    }),
  );

  logger.info('Routed to FIFO', {
    targetQueue: event.targetQueue,
    detailType: event.detailType,
    tenantId: event.detail.tenantId,
    eventId: event.detail.eventId,
  });
}
