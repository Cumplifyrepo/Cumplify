/**
 * FinalizeManual Lambda — DocGenStateMachine step 3. TASK-5 STUB.
 *
 * Task 5 scope: terminal run-status semantics + run-complete events.
 * Task 6 fills in the m1 document writes (manual + clause docs + correlation
 * matrix + master list) — tracked, not silently omitted.
 *
 * Status semantics (design §4.1 / Task 6 bullet):
 *   any 'failed' section  → 'partial'
 *   otherwise             → 'complete'
 * ('pending' sections cannot exist here: the Map completes before this state;
 *  an aborted execution never reaches FinalizeManual, so the run stays
 *  'running' and a re-run resumes it — GEN-5.)
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { beginTenantTransaction, publishAuditEvent } from '../../api/src/resolvers/shared.js';
import { publishGenerationEvent } from './appsync-publish.js';

const logger = new Logger({ serviceName: 'qms-finalize-manual' });

export interface FinalizeInput { runId: string; tenantId: string }

export async function handler(event: FinalizeInput): Promise<{ runId: string; status: string; summary: Record<string, number> }> {
  const { runId, tenantId } = event;
  logger.appendKeys({ runId, tenantId });

  const txn = await beginTenantTransaction(tenantId);
  let status: string;
  const summary: Record<string, number> = { prose: 0, gap: 0, na_justified: 0, failed: 0, pending: 0 };
  try {
    const countResult = await txn.execute(
      `SELECT status, COUNT(*) FROM qms.generation_sections
       WHERE run_id = :runId::uuid GROUP BY status`,
      [{ name: 'runId', value: { stringValue: runId } }],
    );
    for (const row of countResult.records ?? []) {
      const s = (row[0] as { stringValue?: string }).stringValue ?? 'unknown';
      summary[s] = Number((row[1] as { longValue?: number }).longValue ?? 0);
    }

    status = (summary.failed ?? 0) > 0 ? 'partial' : 'complete';

    await txn.execute(
      `UPDATE qms.generation_runs
       SET status = :status, finished_at = NOW(), updated_at = NOW()
       WHERE id = :runId::uuid`,
      [
        { name: 'status', value: { stringValue: status } },
        { name: 'runId', value: { stringValue: runId } },
      ],
    );
    await txn.commit();
  } catch (err) {
    try { await txn.rollback(); } catch { /* never mask */ }
    throw err;
  }

  await publishAuditEvent({
    tenantId,
    actor: 'docgen-state-machine',
    module: 'M1',
    clauseRef: 'run',
    standard: 'IMS',
    detailType: 'Generation.RunCompleted',
    source: 'cumplify.qms.docgen',
    payload: { runId, status, summary },
  });
  await publishGenerationEvent({
    runId, tenantId, type: 'run_complete', summary: JSON.stringify({ status, ...summary }),
  });

  logger.info('Run finalized', { status, summary });
  return { runId, status, summary };
}
