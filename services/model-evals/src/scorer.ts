/**
 * Scoring orchestrator — routes scoring by ground-truth shape on each task.
 *
 * FINDING-H fix (truth incident #6): scoring routes are determined by the
 * TASK's ground-truth fields, not just the seat's gradingMethod label.
 * - Tasks with groundTruthLabels → scoreMultiLabel (multi-label set-F1)
 * - Tasks with expectedOutput only → scoreExactMatch (ANSWER: line protocol)
 * - Tasks with expectedSchema → scoreSchemaValidation
 * - Tasks with expectedClauses → scoreClauseCitation
 *
 * qualityPass = aggregate >= seatConfig.qualityBar (NO numeric literals here).
 */

import type { EvalResult, EvalSet, SeatConfig } from './types.js';
import { scoreExactMatch, scoreMultiLabel } from '../graders/exact-match.js';
import { scoreSchemaValidation } from '../graders/schema-validator.js';
import { scoreClauseCitation } from '../graders/clause-citation.js';

export interface ScoringResult {
  aggregateScore: number;
  qualityPass: boolean;
  perTask: Array<{ taskId: string; score: number; method: string }>;
}

/**
 * Score a set of results for a single candidate against the eval set.
 * Routes scoring per task based on ground-truth shape.
 * qualityPass = aggregateScore >= seatConfig.qualityBar.
 */
export function scoreCandidate(
  results: EvalResult[],
  evalSet: EvalSet,
  seatConfig: SeatConfig,
): ScoringResult {
  const perTask: Array<{ taskId: string; score: number; method: string }> = [];

  for (const result of results) {
    const task = evalSet.tasks.find((t) => t.id === result.taskId);
    if (!task) continue;

    let score = 0;
    let method = 'unknown';

    // Route by ground-truth shape (priority order)
    if (task.groundTruthLabels && task.groundTruthLabels.length > 0) {
      // Multi-label classification: use scoreMultiLabel (set-F1 via ANSWER: line)
      const expectedLabels = task.groundTruthLabels.sort().join(',');
      score = scoreMultiLabel(result.response, expectedLabels);
      method = 'multi-label-f1';
    } else if (task.expectedClauses && task.expectedClauses.length > 0) {
      // Clause-citation: check clause references in response
      score = scoreClauseCitation(result.response, task.expectedClauses);
      method = 'clause-citation';
    } else if (task.expectedSchema && Object.keys(task.expectedSchema).length > 0) {
      // Schema validation: check JSON structure
      score = scoreSchemaValidation(result.response, task.expectedSchema);
      method = 'schema-validation';
    } else if (task.expectedOutput !== undefined) {
      // Exact match via ANSWER: line protocol
      score = scoreExactMatch(result.response, task.expectedOutput);
      method = 'exact-match';
    }

    perTask.push({ taskId: result.taskId, score, method });
  }

  // Aggregate: mean score across all tasks
  const aggregateScore =
    perTask.length > 0 ? perTask.reduce((sum, t) => sum + t.score, 0) / perTask.length : 0;

  // qualityPass from seat config bar (NO hardcoded threshold)
  let qualityPass: boolean;
  if (seatConfig.qualityBar === null) {
    // Human-graded seats: pass deferred to human review
    qualityPass = true;
  } else {
    qualityPass = aggregateScore >= seatConfig.qualityBar;
  }

  return { aggregateScore, qualityPass, perTask };
}
