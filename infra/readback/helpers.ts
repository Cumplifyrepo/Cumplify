/**
 * Readback assertion helpers — Part 39 Layer 3
 *
 * These utilities format pass/fail output per AC-2.4:
 * resource ARN/name, designed value, actual observed value.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AssertionResult {
  resource: string;
  property: string;
  designed: unknown;
  observed: unknown;
  pass: boolean;
}

const results: AssertionResult[] = [];

/**
 * Assert a deployed resource property matches the designed intent.
 * Logs the result in the standard format and throws on mismatch for Vitest.
 *
 * Post-deploy mode semantics: if a resource is expected but absent after
 * infrastructure is deployed, pass observed='ABSENT' — this FAILS the
 * assertion. A missing resource must never pass green once anything is deployed.
 */
export function assertResource(
  resource: string,
  property: string,
  designed: unknown,
  observed: unknown,
): void {
  const pass = JSON.stringify(designed) === JSON.stringify(observed);
  const result: AssertionResult = { resource, property, designed, observed, pass };
  results.push(result);

  if (!pass) {
    throw new Error(
      `READBACK FAIL: ${resource}\n` +
        `  property: ${property}\n` +
        `  designed: ${JSON.stringify(designed)}\n` +
        `  observed: ${JSON.stringify(observed)}`,
    );
  }
}

/**
 * Get all accumulated assertion results (for reporting).
 */
export function getResults(): AssertionResult[] {
  return [...results];
}

/**
 * Reset results between test files.
 */
export function resetResults(): void {
  results.length = 0;
}

/**
 * Format a summary table of all assertions.
 */
export function formatResultsTable(): string {
  if (results.length === 0) return 'No assertions executed.';
  const lines = ['| Resource | Property | Designed | Observed | Result |', '|---|---|---|---|---|'];
  for (const r of results) {
    lines.push(
      `| ${r.resource} | ${r.property} | ${JSON.stringify(r.designed)} | ${JSON.stringify(r.observed)} | ${r.pass ? 'PASS' : 'FAIL'} |`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// cdk-outputs.json loader — per design §2 / F-9
// ---------------------------------------------------------------------------

export type StackOutputs = Record<string, Record<string, string>>;

/**
 * Load cdk-outputs.json from the repo root (or CDK_OUTPUTS_FILE env var).
 * Returns null if the file does not exist (pre-deploy mode).
 */
export function loadCdkOutputs(): StackOutputs | null {
  const filePath = process.env.CDK_OUTPUTS_FILE ?? resolve(process.cwd(), 'cdk-outputs.json');
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as StackOutputs;
}

/**
 * Get a specific output value from a stack.
 * Returns undefined if the file or key is not found.
 */
export function getOutput(
  outputs: StackOutputs | null,
  stackName: string,
  outputKey: string,
): string | undefined {
  return outputs?.[stackName]?.[outputKey];
}
