/**
 * HITL Approval resolver — stub (Task 4 implements full logic).
 */
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'resolver-hitl-approval' });

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

export async function handler(event: AppSyncEvent): Promise<unknown> {
  logger.info('HITL approval stub called', { field: event.info.fieldName });
  throw new Error('Not implemented — Task 4 builds the full approval Lambda');
}
