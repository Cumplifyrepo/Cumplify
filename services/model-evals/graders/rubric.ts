/**
 * Rubric grader — multi-dimension scoring for human-graded seats.
 * Provides the schema + aggregation logic; actual scoring is human-input.
 */

export interface RubricScore {
  taskId: string;
  candidateModelId: string;
  dimensions: Record<string, number>; // dimension name → score (1-5)
  gradedBy: string;
  gradedAt: string;
}

/**
 * Aggregate rubric scores for a candidate across all tasks.
 * Pass threshold: mean >= 4.0, no individual response scores 1 on any dimension.
 */
export function aggregateRubricScores(scores: RubricScore[]): {
  meanScore: number;
  qualityPass: boolean;
  hasCatastrophicFailure: boolean;
} {
  if (scores.length === 0) {
    return { meanScore: 0, qualityPass: false, hasCatastrophicFailure: false };
  }

  let totalDimScores = 0;
  let dimCount = 0;
  let hasCatastrophicFailure = false;

  for (const score of scores) {
    for (const dimScore of Object.values(score.dimensions)) {
      totalDimScores += dimScore;
      dimCount++;
      if (dimScore === 1) {
        hasCatastrophicFailure = true;
      }
    }
  }

  const meanScore = dimCount > 0 ? totalDimScores / dimCount : 0;
  const qualityPass = meanScore >= 4.0 && !hasCatastrophicFailure;

  return { meanScore, qualityPass, hasCatastrophicFailure };
}
