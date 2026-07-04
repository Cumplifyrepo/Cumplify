// Placeholder — implemented in Task 3
import type { CumplifyEvent } from './types.js';

export type EventHandler<T = Record<string, unknown>> = (
  event: CumplifyEvent<T>,
  detailType: string,
) => Promise<void>;

export interface ConsumerConfig {
  dlqUrl: string;
  handler: EventHandler;
}

export function createHandler(_config: ConsumerConfig) {
  throw new Error('Not implemented — Task 3');
}
