/**
 * Golden-set eval aggregate pin (spec 40, Task 12 — NFR-3/ACC-10).
 *
 * The committed scores (fixtures/golden-eval-scores.json) are the architect's
 * blind-order rubric grading of the ROUND-2 golden run (post-fix system) —
 * 60 sampled prose sections from 10 generated manuals, 5 dimensions each
 * (grounding, voice, clauseIntent, coherence, specificity).
 *
 * Aggregation reuses the REAL model-evals rubric grader, so the NFR-3 gate
 * (mean >= 4.0, zero catastrophic 1s) is pinned by the same code the
 * model-policy-evals spec uses — and re-checked on every CI run.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateRubricScores, type RubricScore } from '../../model-evals/graders/rubric.js';

interface ScoresFile {
  round: number;
  system: string;
  scores: Array<{ index: number; dimensions: Record<string, number>; gradedBy: string; gradedAt: string }>;
}

describe('golden-set eval (NFR-3): mean >= 4.0/5, zero low scores', () => {
  const file = JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'golden-eval-scores.json'), 'utf8'),
  ) as ScoresFile;

  const rubricScores: RubricScore[] = file.scores.map(s => ({
    taskId: `section-${s.index}`,
    candidateModelId: 'doc-composer-seat',
    dimensions: s.dimensions,
    gradedBy: s.gradedBy,
    gradedAt: s.gradedAt,
  }));

  it('60 sections graded on 5 dimensions each', () => {
    expect(file.scores.length).toBe(60);
    for (const s of file.scores) {
      expect(Object.keys(s.dimensions).sort()).toEqual(
        ['clauseIntent', 'coherence', 'grounding', 'specificity', 'voice'],
      );
    }
  });

  it('aggregate passes the NFR-3 gate via the real model-evals rubric grader', () => {
    const agg = aggregateRubricScores(rubricScores);
    expect(agg.meanScore).toBeGreaterThanOrEqual(4.0);
    expect(agg.hasCatastrophicFailure).toBe(false);
    expect(agg.qualityPass).toBe(true);
  });
});
