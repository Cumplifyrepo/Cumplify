/**
 * Mandatory event envelope (ET-4).
 * Every event published to cumplify-events carries these fields.
 */
export interface CumplifyEvent<T = Record<string, unknown>> {
  tenantId: string;
  eventId: string; // ULID
  timestamp: string; // ISO 8601
  actor: string; // cognito sub or agentName
  module: string; // M1..M13
  clauseRef: string; // ISO clause string
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
  payload: T;
}

/**
 * Canonical queue-message contract (FIX-1).
 * Every SQS message body in any queue has this shape —
 * enforced by input transformers on all rule targets and
 * by the FIFO-router's MessageBody construction.
 */
export interface QueueMessage<T = Record<string, unknown>> {
  detailType: string; // Domain.Action
  detail: CumplifyEvent<T>;
}
