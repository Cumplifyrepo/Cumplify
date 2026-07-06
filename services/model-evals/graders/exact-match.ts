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

/**
 * Compute multi-label set F1 for a single prediction.
 * Predicted and expected are comma-separated sorted label sets.
 * F1 = 2 * |intersection| / (|predicted| + |expected|)
 */
export function computeSetF1(predictedStr: string, expectedStr: string): number {
  const predicted = new Set(
    predictedStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  const expected = new Set(
    expectedStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  if (predicted.size === 0 && expected.size === 0) return 1.0;
  if (predicted.size === 0 || expected.size === 0) return 0.0;

  let intersection = 0;
  for (const label of predicted) {
    if (expected.has(label)) intersection++;
  }

  const precision = intersection / predicted.size;
  const recall = intersection / expected.size;

  if (precision + recall === 0) return 0.0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Score a multi-label response against expected labels (for micro-routing).
 * Returns set-F1 score (0.0 - 1.0).
 */
export function scoreMultiLabel(response: string, expectedLabels: string): number {
  return computeSetF1(response.trim(), expectedLabels);
}
