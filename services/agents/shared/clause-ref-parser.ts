/**
 * Clause-ref parser — extracts ISO clause references from user questions.
 * Pure function module, no I/O, unit-testable in isolation.
 * Spec: iso-kb-content-depth, design §3.1, OQ-3 resolved (middle path).
 *
 * Priority order:
 *   1. Full ISO reference: "ISO 9001 4.1" / "ISO 9001:2015 clause 4.1"
 *   2. Labeled reference: "clause 4.1" / "section 7.1.5.2"
 *   3. Bare clause number: "4.1" (leading digit 4-10 only)
 *
 * N-1: Bare-number parsing will false-positive on non-clause numerics
 * (e.g., "4.1 percent"). RETRIEVAL-2f fallback makes this safe.
 */

export interface ParsedClauseRef {
  /** Formatted for metadata.clauseRef match, e.g., 'ISO 9001 4.1' — null if no standard parsed */
  clauseRef: string | null;
  /** Formatted for metadata.standard match, e.g., 'ISO9001' — null if no standard parsed */
  standard: string | null;
  /** Raw clause number extracted, e.g., '4.1' — null if nothing detected */
  clauseNum: string | null;
}

/**
 * Parse a clause reference from a user question.
 * Returns { clauseRef, standard, clauseNum }.
 * - Priority 1 (full ISO ref): all three fields populated.
 * - Priority 2/3 (labeled/bare): only clauseNum populated; guru composes clauseRef.
 * - No match: all null.
 *
 * D-3': When priority-1 returns an explicit standard, it WINS over the guru's own
 * standard. The guru uses its standard only for priority 2/3 composition.
 *
 * RETRIEVAL-1c: First match wins (multiple refs → primary only).
 */
export function parseClauseRef(question: string): ParsedClauseRef {
  // Priority 1: Full ISO reference — "ISO 9001 4.1" or "ISO 9001:2015 clause 4.1"
  const fullMatch = question.match(
    /\bISO\s+(9001|14001|45001)(?::20\d{2})?\s+(?:clause\s+|section\s+)?(\d+(?:\.\d+)+)\b/i,
  );
  if (fullMatch) {
    const [, stdNum, clauseNum] = fullMatch;
    return {
      clauseRef: `ISO ${stdNum} ${clauseNum}`,
      standard: `ISO${stdNum}`,
      clauseNum,
    };
  }

  // Priority 2: "clause X.Y" / "section X.Y" (no standard specified)
  const labeledMatch = question.match(/\b(?:clause|section)\s+(\d+(?:\.\d+)+)\b/i);
  if (labeledMatch) {
    return { clauseRef: null, standard: null, clauseNum: labeledMatch[1] };
  }

  // Priority 3: Bare clause number — X.Y where X is 4-10 (valid ISO clause range)
  // N-1: bare-number parsing will false-positive on non-clause numerics.
  const bareMatch = question.match(/\b((?:[4-9]|10)(?:\.\d+)+)\b/);
  if (bareMatch) {
    return { clauseRef: null, standard: null, clauseNum: bareMatch[1] };
  }

  return { clauseRef: null, standard: null, clauseNum: null };
}
