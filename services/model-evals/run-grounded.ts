/**
 * Grounded re-eval runner — agents-existing-8 Tasks 13/14 (design §6.2/§6.3).
 *
 * Per task: query vector (pre-embedded, architect ops) → AOSS retrieval via
 * the VPC-attached prover Lambda (production retrieve() wrapper inside) →
 * grounded prompt → Bedrock Converse via the spec-30 runner (eval-boundary
 * ruling: direct Converse allowed ONLY in services/model-evals) → automated
 * clause-citation scoring where applicable.
 *
 * Usage:
 *   npx tsx services/model-evals/run-grounded.ts \
 *     --model moonshotai.kimi-k2.5 --seat guru \
 *     --eval-set services/model-evals/data/eval-sets/guru-iso45001.json \
 *     --queries <embedded-queries.json> --prover <fn-name> \
 *     --collection cumplify-iso-kb --index task13-guru45001-kb \
 *     --tenant tenant-eval45001-t13 --cap 1.50 --out <dir> [--no-score]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { invokeCandidate } from './src/runner.js';
import { scoreClauseCitation } from './graders/clause-citation.js';
import { createBudgetGuard } from './src/budget.js';
import { SEAT_CONFIGS } from './src/seat-configs.js';
import type { EvalTask, PriceEntry } from './src/types.js';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i > 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required arg --${name}`);
}

const MODEL = arg('model');
const SEAT = arg('seat');
const EVAL_SET = arg('eval-set');
const QUERIES = arg('queries');
const PROVER = arg('prover');
const COLLECTION = arg('collection');
const INDEX = arg('index');
const TENANT = arg('tenant');
const CAP = Number(arg('cap'));
const OUT = arg('out');
const TOP_K = Number(arg('top-k', '5'));
const AUTO_SCORE = !process.argv.includes('--no-score');

// Live-verified pricing (Task-2 seed, AWS Pricing API capturedAt 2026-07-09).
// weights are credits per M tokens; 1000 credits = $1.
const seed = JSON.parse(
  readFileSync(new URL('../ai-invoker/data/model-weights-seed.json', import.meta.url), 'utf-8'),
);
// Non-seat candidates (Task 14) carry spec-30 live-API prices not in the seed.
const EXTRA_PRICES: Record<string, PriceEntry> = {
  'zai.glm-5': { inputPricePerMToken: 1.0, outputPricePerMToken: 3.2, unit: 'M tokens', notes: 'spec-30 task-8 live-API' },
  'deepseek.v3.2': { inputPricePerMToken: 0.62, outputPricePerMToken: 1.85, unit: 'M tokens', notes: 'spec-30 task-8 live-API' },
};

function priceFor(modelId: string): PriceEntry {
  const w = seed.models[modelId];
  if (w) return { inputPricePerMToken: w.wIn / 1000, outputPricePerMToken: w.wOut / 1000, unit: 'M tokens' };
  const extra = EXTRA_PRICES[modelId];
  if (!extra) throw new Error(`No price for ${modelId} — refuse to run unpriced (spec-30 incident #4)`);
  return extra;
}

const lambda = new LambdaClient({ region: 'us-east-1' });

interface ProverChunk {
  text: string;
  score: number;
  metadata: Record<string, string>;
}

async function retrieveChunks(vector: number[]): Promise<{ chunks: ProverChunk[]; latencyMs: number; attempts: number; coldStart: boolean }> {
  const resp = await lambda.send(new InvokeCommand({
    FunctionName: PROVER,
    Payload: JSON.stringify({
      action: 'query', collection: COLLECTION, indexName: INDEX,
      tenantId: TENANT, queryVector: vector, topK: TOP_K,
    }),
  }));
  if (resp.FunctionError) {
    throw new Error(`Prover retrieval failed: ${Buffer.from(resp.Payload!).toString()}`);
  }
  return JSON.parse(Buffer.from(resp.Payload!).toString());
}

function groundedPrompt(task: EvalTask, chunks: ProverChunk[]): string {
  const context = chunks
    .map((c, i) => `[Doc ${i + 1} — clause ${c.metadata.clauseRef ?? 'n/a'}]\n${c.text}`)
    .join('\n\n');
  return (
    `You are answering using the tenant's uploaded standards documentation. ` +
    `Ground your answer in the retrieved excerpts below and cite the specific clause number(s).\n\n` +
    `=== Retrieved excerpts ===\n${context}\n=== End excerpts ===\n\n` +
    `Question: ${task.prompt}`
  );
}

async function main(): Promise<void> {
  const evalSet = JSON.parse(readFileSync(EVAL_SET, 'utf-8'));
  const tasks: EvalTask[] = evalSet.tasks;
  const queryVectors: Record<string, number[]> = Object.fromEntries(
    JSON.parse(readFileSync(QUERIES, 'utf-8')).queries.map((q: { id: string; embedding: number[] }) => [q.id, q.embedding]),
  );
  const seatConfig = SEAT_CONFIGS[SEAT];
  if (!seatConfig) throw new Error(`Unknown seat '${SEAT}'`);
  const price = priceFor(MODEL);
  const guard = createBudgetGuard(CAP, CAP);
  mkdirSync(OUT, { recursive: true });

  const scores: number[] = [];
  const retrievalRecall: number[] = [];
  let totalCost = 0;
  let retrievalColdStarts = 0;

  for (const task of tasks) {
    const vector = queryVectors[task.id];
    if (!vector) throw new Error(`No query vector for ${task.id} — refuse partial run`);

    const retrieval = await retrieveChunks(vector);
    if (retrieval.coldStart) retrievalColdStarts++;

    // Diagnostics: was every expected clause's doc among retrieved chunks?
    const retrievedRefs = new Set(retrieval.chunks.map((c) => c.metadata.clauseRef));
    const expected = (task.expectedClauses ?? []).map((c) => c.match(/(\d+(?:\.\d+)+)/)?.[1] ?? c);
    const recall = expected.length
      ? expected.filter((c) => retrievedRefs.has(c)).length / expected.length
      : 1;
    retrievalRecall.push(recall);

    const grounded: EvalTask = { ...task, prompt: groundedPrompt(task, retrieval.chunks) };
    const result = await invokeCandidate(MODEL, grounded, seatConfig, price, guard);
    totalCost += result.costUsd;

    const score = AUTO_SCORE ? scoreClauseCitation(result.response, task.expectedClauses ?? []) : undefined;
    if (score !== undefined) scores.push(score);

    writeFileSync(join(OUT, `${task.id}.json`), JSON.stringify({
      taskId: task.id, model: MODEL,
      retrieval: {
        latencyMs: retrieval.latencyMs, attempts: retrieval.attempts, coldStart: retrieval.coldStart,
        chunks: retrieval.chunks.map((c) => ({ clauseRef: c.metadata.clauseRef, score: c.score })),
        recall,
      },
      response: result.response,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      costUsd: result.costUsd, latencyMs: result.latencyMs, score,
    }, null, 1));

    console.log(
      `${task.id}: recall=${recall.toFixed(2)}${score !== undefined ? ` score=${score.toFixed(2)}` : ''} ` +
      `cost=$${result.costUsd.toFixed(5)} (cum $${totalCost.toFixed(4)})`,
    );
  }

  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : NaN;
  const meanRecall = retrievalRecall.reduce((a, b) => a + b, 0) / retrievalRecall.length;
  const summary = {
    model: MODEL, seat: SEAT, tasks: tasks.length,
    meanScore: AUTO_SCORE ? Number(mean.toFixed(4)) : 'HUMAN-GRADED',
    bar: seatConfig.qualityBar,
    pass: AUTO_SCORE && seatConfig.qualityBar != null ? mean >= seatConfig.qualityBar : 'PENDING-HUMAN-GRADING',
    meanRetrievalRecall: Number(meanRecall.toFixed(4)),
    retrievalColdStarts,
    totalCostUsd: Number(totalCost.toFixed(4)),
    capUsd: CAP,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log('\nSUMMARY:', JSON.stringify(summary, null, 1));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
