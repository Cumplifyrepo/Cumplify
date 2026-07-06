/**
 * Clause-citation grader — Guru tier: clause-number extraction + exact match.
 * Scores how many expected clause references appear in the model's response.
 */

/**
 * Score a response by checking how many expected clauses are cited.
 * Returns proportion of expected clauses found (0.0 - 1.0).
 *
 * Matching is flexible: "ISO 9001 10.2" matches "10.2", "clause 10.2",
 * "ISO 9001:2015 clause 10.2", etc.
 */
export function scoreClauseCitation(response: string, expectedClauses: string[]): number {
  if (expectedClauses.length === 0) return 1.0;

  const normalizedResponse = response.toLowerCase();
  let found = 0;

  for (const clause of expectedClauses) {
    // Extract the clause number (e.g., "10.2" from "ISO 9001 10.2")
    const clauseNumber = extractClauseNumber(clause);
    if (clauseNumber && normalizedResponse.includes(clauseNumber.toLowerCase())) {
      found++;
    }
  }

  return found / expectedClauses.length;
}

/**
 * Extract the numeric clause portion from a full clause reference.
 * "ISO 9001 10.2" → "10.2"
 * "ISO 14001 6.1.3" → "6.1.3"
 * "4.1" → "4.1"
 */
function extractClauseNumber(clauseRef: string): string | null {
  // Match patterns like "10.2", "6.1.3", "4.1.2.1"
  const match = clauseRef.match(/(\d+(?:\.\d+)+)/);
  return match ? match[1] : null;
}
