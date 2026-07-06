/**
 * Report generator — produces markdown scored reports per §10 format.
 */

import type { ScoredReport } from './types.js';

/**
 * Generate a markdown scored report from candidate results.
 */
export function generateReport(report: ScoredReport): string {
  const lines: string[] = [];

  lines.push(`# Eval Report: ${report.seat} — ${report.timestamp}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('| Candidate | Quality Score | Quality Pass | $/task P50 | $/task P95 | Margin Headroom | Rank |');
  lines.push('|-----------|--------------|-------------|-----------|-----------|-----------------|------|');

  for (const c of report.candidates) {
    lines.push(
      `| ${c.modelId} | ${c.qualityScore.toFixed(3)} | ${c.qualityPass ? 'PASS' : 'FAIL'} | $${c.costPerTaskP50.toFixed(5)} | $${c.costPerTaskP95.toFixed(5)} | ${(c.marginAtCreditPricing * 100).toFixed(1)}% | ${c.rank ?? 'N/A'} |`,
    );
  }

  lines.push('');
  lines.push(`## Winner: ${report.winner ?? 'NONE (no quality-passers)'}`);
  lines.push('');
  lines.push(`## Budget Consumed: $${report.budgetConsumed.toFixed(4)}`);
  lines.push('');

  // Pricing sources
  lines.push('## Pricing Sources');
  for (const [modelId, source] of Object.entries(report.pricingSource)) {
    lines.push(`- ${modelId}: ${source}`);
  }

  if (report.groundTruthLimitation) {
    lines.push('');
    lines.push('## Ground-Truth Limitation');
    lines.push(report.groundTruthLimitation);
  }

  lines.push('');
  return lines.join('\n');
}
