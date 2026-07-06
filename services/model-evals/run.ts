/**
 * CLI entry point for the model-evals harness.
 * Usage: npx tsx services/model-evals/run.ts --seat <seat> [--estimate-only] [--run --approved-budget <$>] [--candidate <modelId>]
 */

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    seat: { type: 'string' },
    'estimate-only': { type: 'boolean', default: false },
    run: { type: 'boolean', default: false },
    'approved-budget': { type: 'string' },
    candidate: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

if (values.help || !values.seat) {
  console.log(`
Model Evals Harness — CLI

Usage:
  npx tsx services/model-evals/run.ts --seat <seat> --estimate-only
  npx tsx services/model-evals/run.ts --seat <seat> --run --approved-budget <$>
  npx tsx services/model-evals/run.ts --seat <seat> --run --candidate <modelId> --approved-budget <$>

Seats: guru, workhorse, lightweight, micro, snapshot, editor-ai, pain-distiller, legal-ledger

Options:
  --seat              Seat to evaluate (required)
  --estimate-only     Show cost estimate without invoking models
  --run               Execute the benchmark (requires --approved-budget)
  --approved-budget   Budget cap in USD (e.g., "3.00")
  --candidate         Run only a single candidate (for debugging)
  --help              Show this help
  `);
  process.exit(0);
}

console.log(`[model-evals] Seat: ${values.seat}`);
console.log(`[model-evals] Mode: ${values['estimate-only'] ? 'estimate-only' : values.run ? 'run' : 'unspecified'}`);

if (values['estimate-only']) {
  console.log('[model-evals] Pre-flight: loading eval set + pricing...');
  // TODO: wire to actual estimate flow in implementation
  console.log('[model-evals] Budget consumed: $0.00');
  console.log('[model-evals] Estimate complete — no Bedrock invocations made.');
  process.exit(0);
}

if (values.run && !values['approved-budget']) {
  console.error('ERROR: --run requires --approved-budget');
  process.exit(1);
}

if (values.run) {
  console.log(`[model-evals] Approved budget: $${values['approved-budget']}`);
  console.log('[model-evals] Starting benchmark run...');
  // TODO: wire to actual runner flow in implementation
  process.exit(0);
}

console.error('ERROR: specify --estimate-only or --run');
process.exit(1);
