// Placeholder — implemented in Task 2
import type { CumplifyEvent } from './types.js';

export interface PublishOptions {
  busName: string;
  source: string;
  detailType: string;
  event: CumplifyEvent;
}

export async function publish(_opts: PublishOptions): Promise<string> {
  throw new Error('Not implemented — Task 2');
}
