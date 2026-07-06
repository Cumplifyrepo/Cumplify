/**
 * Scoring orchestrator — delegates to appropriate grader based on seat config.
 * EV-4: Quality bar FIRST (pass/fail), then rank by $/task.
 */

import type { EvalResult, EvalSet, SeatConfig } from './types.js';
import { scoreExactMatch } from '../graders/exact-match.js';
import { scoreSchemaValidation } from '../graders/schema-validator.js';
import { scoreClauseCitation } from '../graders/clause-citation.js';

/**
 * Score a set of results for a single candidate against the eval set.
 * Returns the aggregate quality score (0-1) and per-task scores.
 */
export function scoreCandidate(
  results: EvalResult[],
  evalSet: EvalSet,
  _seatConfig: SeatConfig,
): { aggregateScore: number; qualityPass: boolean; perTask: Array<{ taskId: string; score: number }> } {
  const perTask: Array<{ taskId: string; score: number }> = [];

  for (const result of results) {
    const task = evalSet.tasks.find((t) => t.id === result.taskId);
    if (!task) continue;

    let score = 0;
    switch (evalSet.gradingMethod) {
      case 'exact-match':
        score = scoreExactMatch(result.response, task.expectedOutput ?? '');
        break;
      case 'schema-validation':
        score = scoreSchemaValidation(result.response, task.expectedSchema ?? {});
        break;
      case 'clause-citation':
        score = scoreClauseCitation(result.response, task.expectedClauses ?? []);
        break;
      case 'rubric':
      case 'human':
        // Human-graded: score remains 0 until human input
        score = 0;
        break;
    }

    perTask.push({ taskId: result.taskId, score });
  }

  const aggregateScore =
    perTask.length > 0 ? perTask.reduce((sum, t) => sum + t.score, 0) / perTask.length : 0;

  // Pass threshold: >= 0.7 for automated grading
  const qualityPass = evalSet.gradingMethod === 'human' || evalSet.gradingMethod === 'rubric'
    ? true // Deferred to human review
    : aggregateScore >= 0.7;

  return { aggregateScore, qualityPass, perTask };
}
