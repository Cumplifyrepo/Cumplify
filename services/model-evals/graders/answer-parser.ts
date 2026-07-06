/**
 * Answer-line parser for automated grading.
 *
 * FINDING-F: grading must parse a DECLARED answer line, not scrape the whole response.
 * Protocol: every automated-seat prompt ends with "End your response with exactly one
 * line: ANSWER: <your answer>". The grader parses ONLY the last ANSWER: line.
 */

export interface ParsedAnswer {
  found: boolean;
  answer: string;
  failureReason?: string;
}

/**
 * Extract the answer from a model response.
 * Finds the LAST line matching the pattern ANSWER: (case-insensitive).
 * Returns the content after "ANSWER:" trimmed.
 * If no answer line found, returns found=false with failure reason.
 */
export function parseAnswerLine(response: string): ParsedAnswer {
  const lines = response.split('\n');
  let lastAnswer: string | null = null;

  for (const line of lines) {
    const match = line.match(/^ANSWER:\s*(.*)/i);
    if (match) {
      lastAnswer = match[1].trim();
    }
  }

  if (lastAnswer === null) {
    return { found: false, answer: '', failureReason: 'no answer line' };
  }

  return { found: true, answer: lastAnswer };
}

/**
 * Normalize a multi-label answer: split by comma, trim, lowercase, sort, dedupe.
 */
export function normalizeMultiLabelAnswer(answer: string): string {
  const labels = answer
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const deduped = [...new Set(labels)].sort();
  return deduped.join(',') || 'none';
}
