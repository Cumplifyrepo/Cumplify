/**
 * Exact-match grader — Micro tier: classification F1 / accuracy.
 */

/**
 * Score a response against the expected output via exact match.
 * Returns 1.0 for match, 0.0 for mismatch.
 * Comparison is case-insensitive and trimmed.
 */
export function scoreExactMatch(response: string, expected: string): number {
  const normalized = response.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();
  return normalized === normalizedExpected ? 1.0 : 0.0;
}

/**
 * Compute F1 score for a set of predictions against ground-truth labels.
 */
export function computeF1(predictions: string[], groundTruth: string[]): {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
} {
  if (predictions.length !== groundTruth.length) {
    throw new Error('Predictions and ground-truth must have same length');
  }

  const total = predictions.length;
  let correct = 0;

  for (let i = 0; i < total; i++) {
    if (predictions[i].trim().toLowerCase() === groundTruth[i].trim().toLowerCase()) {
      correct++;
    }
  }

  const accuracy = total > 0 ? correct / total : 0;

  // For multi-class: micro-averaged F1 = accuracy when using exact match
  return { precision: accuracy, recall: accuracy, f1: accuracy, accuracy };
}
