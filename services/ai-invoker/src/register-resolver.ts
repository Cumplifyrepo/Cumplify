/**
 * Register resolver — loads the build-time compiled register and resolves
 * seat → modelId at invoke time. Fails closed on EXPIRED/UNASSIGNED.
 *
 * Design §1.3 — agents-existing-8.
 * Trade-off (D-4): build-time map = redeploy on reassignment (CI-gated, safer).
 * Expiry date-check is LIVE at invoke time regardless.
 */

import { readFileSync } from 'node:fs';
import type { CompiledRegister, SeatId, SeatEntry } from './types.js';
import { InvokeError } from './types.js';

// Task-10 hotfix (T3E-F2 defect class): static JSON import — esbuild inlines
// the register at bundle time. The previous fileURLToPath(import.meta.url) +
// readFileSync pattern threw at runtime in the deployed Lambda (import.meta.url
// is undefined under CJS bundling); unit tests never caught it (unbundled).
import registerRaw from '../data/register-compiled.json' with { type: 'json' };

/** Cold-cached register (loaded once per Lambda cold start) */
let cachedRegister: CompiledRegister | null = null;

/**
 * Load the compiled register. Cold-cached in Lambda memory.
 * Exported for testing (explicit path = test injection via readFileSync).
 */
export function loadRegister(path?: string): CompiledRegister {
  if (path) {
    return JSON.parse(readFileSync(path, 'utf-8')) as CompiledRegister;
  }
  if (!cachedRegister) {
    cachedRegister = registerRaw as unknown as CompiledRegister;
  }
  return cachedRegister;
}

/** Reset cached register (for testing) */
export function resetCache(): void {
  cachedRegister = null;
}

/**
 * Resolve a seat to its model ID. Fails closed if:
 * - Seat status is EXPIRED or UNASSIGNED
 * - Seat expiry date is in the past (LIVE check at invoke time)
 */
export function resolveModel(seat: SeatId, register?: CompiledRegister): SeatEntry {
  const reg = register ?? loadRegister();
  const entry = reg.seats[seat];

  if (!entry) {
    throw new InvokeError('MODEL_SEAT_EXPIRED', `Seat '${seat}' not found in register`);
  }

  // Status check
  if (entry.status === 'UNASSIGNED') {
    throw new InvokeError(
      'MODEL_SEAT_UNASSIGNED',
      `Seat '${seat}' is UNASSIGNED — no model assigned`,
    );
  }
  if (entry.status === 'EXPIRED') {
    throw new InvokeError(
      'MODEL_SEAT_EXPIRED',
      `Seat '${seat}' is EXPIRED — re-validation required`,
    );
  }

  // Live expiry date check (D-4: runs at invoke time regardless of build-time map)
  if (entry.expiry) {
    const expiryDate = new Date(entry.expiry);
    // F-5 FIX: unparseable expiry = EXPIRED (fail closed, never fail open)
    if (isNaN(expiryDate.getTime())) {
      throw new InvokeError(
        'MODEL_SEAT_EXPIRED',
        `Seat '${seat}' has unparseable expiry '${entry.expiry}' — treated as EXPIRED`,
      );
    }
    const now = new Date();
    if (now > expiryDate) {
      throw new InvokeError(
        'MODEL_SEAT_EXPIRED',
        `Seat '${seat}' expired on ${entry.expiry} — re-validation required`,
      );
    }
  }

  return entry;
}
