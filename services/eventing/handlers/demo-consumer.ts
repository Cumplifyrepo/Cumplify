import { createHandler } from '../src/consumer.js';
import type { CumplifyEvent } from '../src/types.js';

const DLQ_URL = process.env.NC_TRIAGE_DLQ_URL!;

const businessLogic = async (_event: CumplifyEvent, _detailType: string): Promise<void> => {
  // Throwaway-grade: log and acknowledge.
  // Production consumers will replace this with actual agent invocations.
};

export const handler = createHandler({
  dlqUrl: DLQ_URL,
  handler: businessLogic,
});
