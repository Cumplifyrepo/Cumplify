/**
 * CLI entry point for the model-evals harness.
 * Usage: npx tsx services/model-evals/run.ts --seat <seat> [--estimate-only] [--run --approved-budget <$>] [--candidate <modelId>]
 *
 * --estimate-only: loads eval set, checks pricing staleness, prints cost estimate table, exits 0.
 * --run: full benchmark (requires --approved-budget).
 */

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEAT_CONFIGS } from './src/seat-configs.js';
import { fetchPricing } from './src/pricing.js';
import { computeEstimate, createBudgetGuard } from './src/budget.js';
import { invokeCandidate } from './src/runner.js';
import { scoreCandidate } from './src/scorer.js';
import { generateReport } from './src/reporter.js';
import type {
  EvalSet,
  CandidateReport,
  ScoredReport,
  PriceEntry,
  EvalResult,
} from './src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    seat: { type: 'string' },
    'estimate-only': { type: 'boolean', default: false },
    run: { type: 'boolean', default: false },
    'approved-budget': { type: 'string' },
    candidate: { type: 'string' },
    'run-id': { type: 'string' },
    rescore: { type: 'string' },
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

Seats: ${Object.keys(SEAT_CONFIGS).join(', ')}

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

const seatConfig = SEAT_CONFIGS[values.seat];
if (!seatConfig) {
  console.error(
    `ERROR: Unknown seat '${values.seat}'. Available: ${Object.keys(SEAT_CONFIGS).join(', ')}`,
  );
  process.exit(1);
}

// Narrow candidates if --candidate specified
const candidates = values.candidate ? [values.candidate] : seatConfig.candidates;

console.log(`[model-evals] Seat: ${values.seat}`);
console.log(`[model-evals] Candidates: ${candidates.join(', ')}`);

// Load eval set
const evalSetPath = resolve(__dirname, seatConfig.evalSetPath);
let evalSet: EvalSet;
try {
  evalSet = JSON.parse(readFileSync(evalSetPath, 'utf-8')) as EvalSet;
  console.log(
    `[model-evals] Eval set loaded: ${seatConfig.evalSetPath} (${evalSet.taskCount} tasks)`,
  );
} catch (err) {
  console.error(`ERROR: Failed to load eval set at ${evalSetPath}: ${(err as Error).message}`);
  process.exit(1);
}

// Load pricing (staleness checked inside fetchPricing)
console.log('[model-evals] Fetching pricing (Pricing API + snapshot fallback)...');
let prices: Record<string, PriceEntry>;
let pricingSources: Record<string, 'live-api' | 'snapshot-priced'>;
try {
  const pricingResult = await fetchPricing(candidates);
  prices = pricingResult.prices;
  pricingSources = pricingResult.sources;
  console.log(`[model-evals] Pricing loaded for ${Object.keys(prices).length} models`);
  for (const [modelId, source] of Object.entries(pricingSources)) {
    console.log(
      `  ${modelId}: ${source} ($${prices[modelId].inputPricePerMToken}/$${prices[modelId].outputPricePerMToken} per M tokens in/out)`,
    );
  }
} catch (err) {
  console.error(`ERROR: Pricing fetch failed: ${(err as Error).message}`);
  process.exit(1);
}

// Compute cost estimate
const estimate = computeEstimate({ ...seatConfig, candidates }, evalSet, prices);

console.log('');
console.log('=== Cost Estimate ===');
console.log(
  `| Seat | Tasks | Candidates | Invocations | Est. Input Tokens | Est. Output Tokens | Est. Cost (worst-case) |`,
);
console.log(
  `|------|-------|-----------|-------------|-------------------|--------------------|----------------------|`,
);
console.log(
  `| ${estimate.seat} | ${estimate.taskCount} | ${estimate.candidateCount} | ${estimate.totalInvocations} | ${estimate.estimatedInputTokens.toLocaleString()} | ${estimate.estimatedOutputTokens.toLocaleString()} | $${estimate.estimatedCostUsd.toFixed(4)} |`,
);
console.log('');

if (values['estimate-only']) {
  console.log('[model-evals] Budget consumed: $0.00');
  console.log('[model-evals] Estimate complete — no Bedrock invocations made.');
  process.exit(0);
}

// --rescore mode: reload raw outputs, re-score with current bars, regenerate report
if (values.rescore) {
  const rescoreRunId = values.rescore;
  const rescoreDir = resolve(
    '.kiro/evidence/model-policy-evals/runs',
    `${values.seat}-${rescoreRunId}`,
  );
  const rescoreRawDir = resolve(rescoreDir, 'raw');
  console.log(`[model-evals] Rescore mode: loading raw from ${rescoreRawDir}`);

  const { readdirSync } = await import('node:fs');
  const rawFiles = readdirSync(rescoreRawDir).filter((f: string) => f.endsWith('.json'));
  if (rawFiles.length === 0) {
    console.error(`ERROR: No raw output files in ${rescoreRawDir}`);
    process.exit(1);
  }

  // Group by model
  const resultsByModel: Record<string, EvalResult[]> = {};
  for (const file of rawFiles) {
    const raw = JSON.parse(readFileSync(resolve(rescoreRawDir, file), 'utf-8'));
    const modelId = raw.modelId as string;
    if (!resultsByModel[modelId]) resultsByModel[modelId] = [];
    resultsByModel[modelId].push({
      taskId: raw.taskId,
      candidateModelId: modelId,
      response: raw.response,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      latencyMs: raw.latencyMs,
      costUsd: raw.costUsd,
    });
  }

  const rescoreCandidateReports: CandidateReport[] = [];
  for (const [modelId, results] of Object.entries(resultsByModel)) {
    const scoring = scoreCandidate(results, evalSet, seatConfig);
    const costs = results.map((r) => r.costUsd).sort((a, b) => a - b);
    const p50Idx = Math.floor(costs.length * 0.5);
    const p95Idx = Math.floor(costs.length * 0.95);
    const costP50 = costs[p50Idx] ?? 0;

    const marginInputsPath = resolve(__dirname, 'data/margin-inputs.json');
    const marginInputs = JSON.parse(readFileSync(marginInputsPath, 'utf-8'));
    const seatMargin = marginInputs.creditPricingPerTask[seatConfig.seat];
    const margin = seatMargin ? 1 - costP50 / seatMargin.effectivePricePerTask : 0;

    rescoreCandidateReports.push({
      modelId,
      qualityPass: scoring.qualityPass,
      qualityScore: scoring.aggregateScore,
      costPerTaskP50: costP50,
      costPerTaskP95: costs[p95Idx] ?? 0,
      marginAtCreditPricing: margin,
      marginPass: margin >= 0.5,
      tokenUsage: {
        inputP50: results.sort((a, b) => a.inputTokens - b.inputTokens)[p50Idx]?.inputTokens ?? 0,
        inputP95: results.sort((a, b) => a.inputTokens - b.inputTokens)[p95Idx]?.inputTokens ?? 0,
        outputP50:
          results.sort((a, b) => a.outputTokens - b.outputTokens)[p50Idx]?.outputTokens ?? 0,
        outputP95:
          results.sort((a, b) => a.outputTokens - b.outputTokens)[p95Idx]?.outputTokens ?? 0,
      },
      rank: null,
    });
  }

  const passers = rescoreCandidateReports.filter((c) => c.qualityPass && c.marginPass);
  passers.sort((a, b) => a.costPerTaskP50 - b.costPerTaskP50);
  passers.forEach((c, i) => {
    c.rank = i + 1;
  });
  const winner = passers[0]?.modelId ?? null;

  const rescoreReport: ScoredReport = {
    seat: seatConfig.seat,
    timestamp: new Date().toISOString(),
    candidates: rescoreCandidateReports,
    winner,
    budgetConsumed: 0,
    pricingSource: Object.fromEntries(candidates.map((c) => [c, 'live-api' as const])),
    groundTruthLimitation: `RESCORED from raw run ${rescoreRunId} using scoring commit ${process.env.GIT_COMMIT ?? 'HEAD'}`,
  };

  const rescoreReportMd = generateReport(rescoreReport);
  const rescoreReportFile = resolve(rescoreDir, 'report-rescored.md');
  writeFileSync(rescoreReportFile, rescoreReportMd);
  console.log('\n' + rescoreReportMd);
  console.log(`[model-evals] Rescored report written to: ${rescoreReportFile}`);
  process.exit(0);
}

// --run mode
if (!values.run) {
  console.error('ERROR: specify --estimate-only, --rescore <runId>, or --run');
  process.exit(1);
}

if (!values['approved-budget']) {
  console.error('ERROR: --run requires --approved-budget');
  process.exit(1);
}

if (!values['run-id']) {
  console.error('ERROR: --run requires --run-id (timestamp identifier for this run)');
  process.exit(1);
}

const approvedBudget = parseFloat(values['approved-budget']);
if (estimate.estimatedCostUsd > approvedBudget) {
  console.error(
    `ERROR: Estimated cost $${estimate.estimatedCostUsd.toFixed(4)} exceeds approved budget $${approvedBudget.toFixed(2)}`,
  );
  process.exit(1);
}

const runId = values['run-id']!;
const runDir = resolve('.kiro/evidence/model-policy-evals/runs', `${values.seat}-${runId}`);
const rawDir = resolve(runDir, 'raw');
mkdirSync(rawDir, { recursive: true });

console.log(`[model-evals] Approved budget: $${approvedBudget.toFixed(2)}`);
console.log(`[model-evals] Run ID: ${runId}`);
console.log(`[model-evals] Output dir: ${runDir}`);
console.log('[model-evals] Starting benchmark run...');

const budgetGuard = createBudgetGuard(approvedBudget, approvedBudget);
const candidateReports: CandidateReport[] = [];

for (const modelId of candidates) {
  console.log(`\n--- Candidate: ${modelId} ---`);
  const results: EvalResult[] = [];

  for (const task of evalSet.tasks) {
    try {
      const result = await invokeCandidate(modelId, task, seatConfig, prices[modelId], budgetGuard);
      results.push(result);

      // FINDING-G: persist raw output per task per model
      const rawFile = resolve(rawDir, `${task.id}-${modelId.replace(/[/:]/g, '_')}.json`);
      writeFileSync(
        rawFile,
        JSON.stringify(
          {
            taskId: task.id,
            modelId,
            prompt: task.prompt,
            response: result.response,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            latencyMs: result.latencyMs,
            costUsd: result.costUsd,
            truncated: result.truncated,
            invocationError: result.invocationError,
          },
          null,
          2,
        ),
      );

      process.stdout.write(result.invocationError ? 'E' : result.truncated ? 'T' : '.');
    } catch (err) {
      if ((err as Error).name === 'BudgetExceededError') {
        console.error('\nBudget exceeded — halting run.');
        process.exit(1);
      }
      // FINDING-K: per-candidate isolation — log and continue
      console.error(`\nUnexpected error for ${modelId}/${task.id}: ${(err as Error).message}`);
      results.push({
        taskId: task.id,
        candidateModelId: modelId,
        response: '',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        costUsd: 0,
        truncated: false,
        invocationError: (err as Error).message,
      });
    }
  }
  console.log(` (${results.length} tasks complete)`);

  // Score
  const scoring = scoreCandidate(results, evalSet, seatConfig);
  const costs = results.map((r) => r.costUsd).sort((a, b) => a - b);
  const p50Idx = Math.floor(costs.length * 0.5);
  const p95Idx = Math.floor(costs.length * 0.95);

  // Margin computation (load margin-inputs)
  const marginInputsPath = resolve(__dirname, 'data/margin-inputs.json');
  const marginInputs = JSON.parse(readFileSync(marginInputsPath, 'utf-8'));
  const seatMargin = marginInputs.creditPricingPerTask[seatConfig.seat];
  const costP50 = costs[p50Idx] ?? 0;
  const margin = seatMargin ? 1 - costP50 / seatMargin.effectivePricePerTask : 0;

  candidateReports.push({
    modelId,
    qualityPass: scoring.qualityPass,
    qualityScore: scoring.aggregateScore,
    costPerTaskP50: costP50,
    costPerTaskP95: costs[p95Idx] ?? 0,
    marginAtCreditPricing: margin,
    marginPass: margin >= 0.5,
    tokenUsage: {
      inputP50: results.sort((a, b) => a.inputTokens - b.inputTokens)[p50Idx]?.inputTokens ?? 0,
      inputP95: results.sort((a, b) => a.inputTokens - b.inputTokens)[p95Idx]?.inputTokens ?? 0,
      outputP50: results.sort((a, b) => a.outputTokens - b.outputTokens)[p50Idx]?.outputTokens ?? 0,
      outputP95: results.sort((a, b) => a.outputTokens - b.outputTokens)[p95Idx]?.outputTokens ?? 0,
    },
    rank: null, // assigned below
  });
}

// Rank: quality-pass first, then by costP50 ascending
const passers = candidateReports.filter((c) => c.qualityPass && c.marginPass);
passers.sort((a, b) => a.costPerTaskP50 - b.costPerTaskP50);
passers.forEach((c, i) => {
  c.rank = i + 1;
});

const winner = passers[0]?.modelId ?? null;

const report: ScoredReport = {
  seat: seatConfig.seat,
  timestamp: new Date().toISOString(),
  candidates: candidateReports,
  winner,
  budgetConsumed: budgetGuard.consumed,
  pricingSource: pricingSources,
};

const reportMd = generateReport(report);
console.log('\n' + reportMd);

// FINDING-G: persist scored report
const reportFile = resolve(runDir, 'report.md');
writeFileSync(reportFile, reportMd);
console.log(`[model-evals] Report written to: ${reportFile}`);
console.log(`[model-evals] Budget consumed: $${budgetGuard.consumed.toFixed(4)}`);
console.log(`[model-evals] Winner: ${winner ?? 'NONE'}`);
process.exit(0);
