/**
 * compile-register — produces services/ai-invoker/data/register-compiled.json
 * from a hardcoded SEAT_MAP that MUST be kept in sync with contracts/model-register.md.
 *
 * Run: npx tsx services/ai-invoker/scripts/compile-register.ts
 *
 * CI-gated (D-4): an acceptance test (register-drift.test.ts) parses the
 * model-register.md seat table and asserts equality with the compiled output.
 * Any drift between the Register source-of-truth and SEAT_MAP fails CI.
 *
 * This is a build-time step. The output is committed and deployed.
 * Model reassignment requires updating SEAT_MAP + redeploying (D-4 trade-off).
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import type { CompiledRegister, SeatId, SeatTier, RegisterStatus } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '../data/register-compiled.json');

// Nova models support caching; third-party do not (verified D-3)
const CACHING_MODELS = new Set([
  'us.amazon.nova-pro-v1:0',
  'us.amazon.nova-lite-v1:0',
  'us.amazon.nova-micro-v1:0',
  'us.amazon.nova-2-lite-v1:0',
]);

/**
 * Seat definitions sourced from contracts/model-register.md.
 * This mapping is manually maintained to match the Register.
 * Any discrepancy fails the spec's acceptance gate.
 */
const SEAT_MAP: Record<SeatId, { modelId: string; status: RegisterStatus; expiry: string | null; marginHeadroom: number; tier: SeatTier }> = {
  workhorse: { modelId: 'us.amazon.nova-pro-v1:0', status: 'PROVISIONAL', expiry: '2026-10-06', marginHeadroom: 0.948, tier: 'workhorse' },
  lightweight: { modelId: 'us.amazon.nova-lite-v1:0', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.990, tier: 'lightweight' },
  'guru-9001': { modelId: 'qwen.qwen3-next-80b-a3b', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.966, tier: 'guru' },
  'guru-14001': { modelId: 'qwen.qwen3-next-80b-a3b', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.975, tier: 'guru' },
  'guru-45001': { modelId: 'moonshotai.kimi-k2.5', status: 'ASSIGNED', expiry: '2026-10-08', marginHeadroom: 0.949, tier: 'guru' },
  micro: { modelId: 'us.amazon.nova-2-lite-v1:0', status: 'PROVISIONAL', expiry: '2026-10-06', marginHeadroom: 0.931, tier: 'micro' },
  snapshot: { modelId: 'zai.glm-4.7-flash', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.971, tier: 'snapshot' },
  'editor-ai': { modelId: 'us.amazon.nova-pro-v1:0', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.854, tier: 'editor-ai' },
  'pain-distiller': { modelId: 'qwen.qwen3-next-80b-a3b', status: 'ASSIGNED', expiry: '2026-10-06', marginHeadroom: 0.978, tier: 'pain-distiller' },
  'legal-ledger': { modelId: 'zai.glm-5', status: 'ASSIGNED', expiry: '2026-10-08', marginHeadroom: 0.853, tier: 'legal-ledger' },
  // spec-40 §4.4: same Pro-class model as workhorse (weights row shared by modelId);
  // PROVISIONAL until the Task-12 golden-set eval (≥4.0/5) — owner ratifies there.
  'doc-composer': { modelId: 'us.amazon.nova-pro-v1:0', status: 'PROVISIONAL', expiry: '2026-10-06', marginHeadroom: 0.948, tier: 'doc-composer' },
};

function main(): void {
  const sourceCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();

  const register: CompiledRegister = {
    seats: {} as CompiledRegister['seats'],
    compiledAt: new Date().toISOString(),
    sourceCommit,
  };

  for (const [seatId, config] of Object.entries(SEAT_MAP)) {
    register.seats[seatId as SeatId] = {
      ...config,
      cachingSupported: CACHING_MODELS.has(config.modelId),
    };
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(register, null, 2) + '\n');
  console.log(`✓ Compiled register written to ${OUTPUT_PATH}`);
  console.log(`  Source commit: ${sourceCommit}`);
  console.log(`  Seats: ${Object.keys(register.seats).length}`);
}

main();
